# driver_tips/lambda_function.py
# GET /driver-tips?driver_id=&lat=&lng=

import sys, os, json, math, random, time, uuid
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

import urllib.request
import boto3
from decimal import Decimal
from groq import Groq
from utils import (response, haversine_km, get_active_drivers,
                   get_active_riders, CITY_CENTER, CITY_RADIUS_KM,
                   RIDER_TTL_SEC, get_weather_multiplier)

GROQ_API_KEY          = os.environ.get("GROQ_API_KEY",          "")
TOMTOM_API_KEY        = os.environ.get("TOMTOM_API_KEY",        "")
OWM_API_KEY           = os.environ.get("OWM_API_KEY",           "")
DRIVER_SESSIONS_TABLE = os.environ.get("DRIVER_SESSIONS_TABLE", "driver_sessions")
REGION                = os.environ.get("AWS_REGION_NAME",       "ap-south-1")

groq_client = Groq(api_key=GROQ_API_KEY)
dynamodb    = boto3.resource("dynamodb", region_name=REGION)
GRID_KM     = 1.0

def get_grid_cell(lat, lng):
    cell_lat = GRID_KM / 111.0
    cell_lng = GRID_KM / (111.0 * math.cos(math.radians(lat)))
    return (round(lat / cell_lat) * cell_lat, round(lng / cell_lng) * cell_lng)

def compute_surge_grid(drivers, riders):
    cell_d = {}; cell_r = {}
    for d in drivers:
        c = get_grid_cell(float(d["lat"]), float(d["lng"]))
        cell_d[c] = cell_d.get(c, 0) + 1
    for r in riders:
        c = get_grid_cell(float(r["lat"]), float(r["lng"]))
        cell_r[c] = cell_r.get(c, 0) + 1
    grid = []
    for cell in set(cell_d) | set(cell_r):
        rc = cell_r.get(cell, 0)
        if rc == 0: continue
        dc    = cell_d.get(cell, 0)
        ratio = round(rc / max(dc, 1), 2)
        grid.append({"lat": cell[0], "lng": cell[1],
                     "drivers": dc, "riders": rc, "demand_ratio": ratio})
    return sorted(grid, key=lambda x: x["demand_ratio"], reverse=True)

def reverse_geocode(lat, lng):
    try:
        url = (f"https://api.tomtom.com/search/2/reverseGeocode/{lat},{lng}.json"
               f"?key={TOMTOM_API_KEY}")
        with urllib.request.urlopen(urllib.request.Request(url), timeout=5) as res:
            addr = json.loads(res.read())["addresses"][0]["address"]
        name = (addr.get("municipalitySubdivision")
                or addr.get("localName") or addr.get("municipality")
                or None)
        if name:
            name = name.split(",")[0].strip()
        if not name or any(c.isdigit() for c in name):
            raise ValueError("no name")
        return name
    except Exception:
        dlat = lat - CITY_CENTER["lat"]
        dlng = lng - CITY_CENTER["lng"]
        v    = "North" if dlat > 0 else "South"
        h    = "East"  if dlng > 0 else "West"
        d    = round(haversine_km(CITY_CENTER["lat"], CITY_CENTER["lng"], lat, lng), 1)
        return f"{v} {h} Puducherry ({d}km from center)"

def lambda_handler(event, context):
    try:
        params    = event.get("queryStringParameters") or {}
        driver_id = params.get("driver_id", "driver_001")
        lat       = float(params.get("lat", CITY_CENTER["lat"]))
        lng       = float(params.get("lng", CITY_CENTER["lng"]))
        now       = int(time.time())
        import datetime
        hour = datetime.datetime.now().hour

        # ── Driver session (DynamoDB) ──────────────────────────────────────
        sess_table = dynamodb.Table(DRIVER_SESSIONS_TABLE)
        sess = sess_table.get_item(Key={"driver_id": driver_id}).get("Item")
        if not sess:
            sess = {
                "driver_id":  driver_id,
                "start_time": Decimal(str(now)),
                "earned":     Decimal(str(round(random.uniform(200, 800), 2))),
            }
            sess_table.put_item(Item=sess)
        hours_online = round((now - int(sess["start_time"])) / 3600, 1)
        earned       = round(float(sess["earned"]), 0)

        # ── Surge grid ────────────────────────────────────────────────────
        all_drivers = get_active_drivers()
        all_riders  = get_active_riders()
        grid        = compute_surge_grid(all_drivers, all_riders)
        nearby      = [c for c in grid
                       if haversine_km(lat, lng, c["lat"], c["lng"]) <= 10.0][:3]
        if not nearby:
            nearby = grid[:3]

        # ── Reverse geocode zone names ────────────────────────────────────
        zone_lines = []
        for cell in nearby:
            dist      = round(haversine_km(lat, lng, cell["lat"], cell["lng"]), 1)
            zone_name = reverse_geocode(cell["lat"], cell["lng"])
            cell["zone_name"] = zone_name
            dist_str  = f"{dist}km" if dist >= 1.0 else f"{int(dist*1000)}m"
            zone_lines.append(
                f"- {zone_name}: {cell['demand_ratio']}x surge, "
                f"{dist_str} away, {cell['riders']} pending riders"
            )

        # ── Weather ───────────────────────────────────────────────────────
        weather_condition = "clear"
        try:
            url = (f"https://api.openweathermap.org/data/2.5/weather"
                   f"?lat={lat}&lon={lng}&appid={OWM_API_KEY}&units=metric")
            with urllib.request.urlopen(urllib.request.Request(url), timeout=5) as res:
                wd = json.loads(res.read())
            _, weather_condition = get_weather_multiplier(
                wd["weather"][0]["main"], wd["weather"][0]["description"]
            )
        except Exception:
            pass

        # ── Groq tips ─────────────────────────────────────────────────────
        zones_text = "\n".join(zone_lines) or "- No major surge zones nearby"
        prompt = (
            f"Driver online {hours_online}h, earned ₹{earned} today.\n"
            f"Time: {hour:02d}:00 | Weather: {weather_condition}\n"
            f"Top surge zones:\n{zones_text}\n\n"
            f"Generate exactly 3 short actionable peak-hour tips. "
            f"Each starts with emoji, mentions zone name, distance, ₹ estimate. "
            f"One tip per line."
        )
        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": (
                    "You are a driver earnings coach for a ride-sharing app in India. "
                    "Give concise data-driven tips. Mention zone names, distances, rupee estimates. "
                    "3 tips only, one per line, each starting with an emoji."
                )},
                {"role": "user", "content": prompt},
            ],
            temperature=0.75, max_tokens=250,
        )
        tips_raw = resp.choices[0].message.content.strip()
        tips     = [t.strip() for t in tips_raw.split("\n") if t.strip()][:3]

        return response(200, {
            "tips":         tips,
            "surge_grid":   nearby,
            "hours_online": hours_online,
            "earned":       earned,
            "hour":         hour,
        })
    except Exception as e:
        return response(500, {"error": str(e)})
