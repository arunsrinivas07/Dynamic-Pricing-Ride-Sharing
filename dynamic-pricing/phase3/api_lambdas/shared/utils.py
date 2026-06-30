# shared/utils.py — REBALANCED
# CITY_RADIUS_KM: 8 → 5  (matches all Lambda constants)
# RIDER_TTL_SEC stays 600

import math, time, os
import boto3

CITY_CENTER    = {"lat": 11.9139, "lng": 79.8145}
CITY_RADIUS_KM = 5      # ← REDUCED from 8
RIDER_TTL_SEC  = 600
REGION         = os.environ.get("AWS_REGION_NAME", "ap-south-1")
DRIVERS_TABLE  = os.environ.get("DRIVERS_TABLE",   "drivers")
RIDERS_TABLE   = os.environ.get("RIDERS_TABLE",    "riders")

dynamodb = boto3.resource("dynamodb", region_name=REGION)

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}

def response(status, body):
    import json
    return {
        "statusCode": status,
        "headers":    {**CORS, "Content-Type": "application/json"},
        "body":       json.dumps(body),
    }

def haversine_km(lat1, lng1, lat2, lng2):
    R    = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a    = (math.sin(dlat/2)**2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlng/2)**2)
    return R * 2 * math.asin(math.sqrt(a))

def scan_all(table_name):
    table    = dynamodb.Table(table_name)
    resp     = table.scan()
    items    = resp["Items"]
    while "LastEvaluatedKey" in resp:
        resp  = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp["Items"])
    return items

def get_active_drivers():
    return [d for d in scan_all(DRIVERS_TABLE) if d.get("available")]

def get_active_riders():
    now = int(time.time())
    return [r for r in scan_all(RIDERS_TABLE)
            if int(r.get("created_at", 0)) + RIDER_TTL_SEC > now]

def get_nearby_drivers(lat, lng, radius_km=3.0):
    return [d for d in get_active_drivers()
            if haversine_km(lat, lng, float(d["lat"]), float(d["lng"])) <= radius_km]

def get_nearby_riders(lat, lng, radius_km=3.0):
    return [r for r in get_active_riders()
            if haversine_km(lat, lng, float(r["lat"]), float(r["lng"])) <= radius_km]

def get_weather_multiplier(condition, description):
    c = condition.lower(); d = description.lower()
    if c == "thunderstorm": return 1.5, "storm"
    if c == "snow":         return 1.35, "snow"
    if c == "rain":
        if "heavy" in d or "extreme" in d: return 1.25, "heavy rain"
        return 1.15, "rain"
    if c == "drizzle":      return 1.1, "drizzle"
    if c in ("mist","fog","haze","smoke","dust"): return 1.1, "mist"
    if c == "clouds":       return 1.05, "clouds"
    return 1.0, "clear"

def get_traffic_multiplier(delay_sec):
    if delay_sec > 1200: return 1.4, "severe"
    if delay_sec > 600:  return 1.25, "heavy"
    if delay_sec > 300:  return 1.1, "moderate"
    return 1.0, "clear"

BASE_RATE = 30.0; PER_KM_RATE = 12.0; PER_MIN_RATE = 1.5
MAX_SURGE_CAP = 3.0; SHARED_DISCOUNT = 0.65

def compute_price(distance_km, eta_minutes, demand_multiplier,
                  weather_multiplier, traffic_multiplier,
                  drivers, riders, ride_type="single"):
    base = BASE_RATE + (distance_km * PER_KM_RATE) + (eta_minutes * PER_MIN_RATE)
    is_base = (drivers >= riders and weather_multiplier <= 1.1 and traffic_multiplier <= 1.1)
    if is_base:
        final_mult = 1.0; mode = "base"; raw_mult = 1.0
    else:
        raw_mult   = demand_multiplier * weather_multiplier * traffic_multiplier
        final_mult = min(raw_mult, MAX_SURGE_CAP); mode = "surge"
    price = round(base * final_mult, 2)
    if ride_type == "shared":
        price = round(price * SHARED_DISCOUNT, 2)
    return {
        "pricing_mode": mode, "base_price": round(base, 2), "final_price": price,
        "final_multiplier": round(final_mult, 3), "demand_multiplier": round(demand_multiplier, 3),
        "weather_multiplier": weather_multiplier, "traffic_multiplier": traffic_multiplier,
        "ride_type": ride_type, "shared_discount": SHARED_DISCOUNT if ride_type == "shared" else None,
        "surge_capped": raw_mult > MAX_SURGE_CAP if not is_base else False,
        "distance_km": distance_km, "eta_minutes": eta_minutes,
        "breakdown": {
            "base_rate": BASE_RATE,
            "distance_fee": round(distance_km * PER_KM_RATE, 2),
            "time_fee": round(eta_minutes * PER_MIN_RATE, 2),
        },
    }