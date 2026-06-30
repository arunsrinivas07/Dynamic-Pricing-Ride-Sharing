# price/lambda_function.py
# GET /price?origin_lat=&origin_lng=&dest_lat=&dest_lng=&ride_type=

import sys, os, json, time
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

import urllib.request
from utils import (response, get_nearby_drivers, get_nearby_riders,
                   get_weather_multiplier, get_traffic_multiplier,
                   compute_price)

TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY", "")
OWM_API_KEY    = os.environ.get("OWM_API_KEY",    "")

def fetch_url(url):
    with urllib.request.urlopen(urllib.request.Request(url), timeout=10) as res:
        return json.loads(res.read().decode())

def lambda_handler(event, context):
    try:
        params     = event.get("queryStringParameters") or {}
        origin_lat = float(params.get("origin_lat", 11.9139))
        origin_lng = float(params.get("origin_lng", 79.8145))
        dest_lat   = float(params.get("dest_lat",   11.9350))
        dest_lng   = float(params.get("dest_lng",   79.8270))
        ride_type  = params.get("ride_type", "single")

        # ── Demand ────────────────────────────────────────────────────────
        nearby_drivers = get_nearby_drivers(origin_lat, origin_lng)
        nearby_riders  = get_nearby_riders(origin_lat, origin_lng)
        driver_count   = len(nearby_drivers)
        rider_count    = len(nearby_riders)
        demand_ratio   = rider_count / max(driver_count, 1)

        if demand_ratio < 0.8:    demand_mult = 1.0
        elif demand_ratio <= 1.2: demand_mult = 1.2
        else:                     demand_mult = round(1.0 + (demand_ratio - 1.2) * 0.5 + 0.4, 2)

        # ── Weather ───────────────────────────────────────────────────────
        weather_mult = 1.0
        try:
            wd = fetch_url(
                f"https://api.openweathermap.org/data/2.5/weather"
                f"?lat={origin_lat}&lon={origin_lng}&appid={OWM_API_KEY}&units=metric"
            )
            weather_mult, _ = get_weather_multiplier(
                wd["weather"][0]["main"], wd["weather"][0]["description"]
            )
        except Exception:
            pass

        # ── Route + Traffic ───────────────────────────────────────────────
        distance_km = 5.0;  eta_minutes = 15.0;  traffic_mult = 1.0
        try:
            rd = fetch_url(
                f"https://api.tomtom.com/routing/1/calculateRoute/"
                f"{origin_lat},{origin_lng}:{dest_lat},{dest_lng}/json"
                f"?key={TOMTOM_API_KEY}&travelMode=car&traffic=true&routeType=fastest"
            )
            s            = rd["routes"][0]["summary"]
            distance_km  = round(s["lengthInMeters"] / 1000, 2)
            eta_minutes  = round(s["travelTimeInSeconds"] / 60, 1)
            traffic_mult, _ = get_traffic_multiplier(s.get("trafficDelayInSeconds", 0))
        except Exception:
            pass

        result = compute_price(
            distance_km, eta_minutes, demand_mult,
            weather_mult, traffic_mult,
            driver_count, rider_count, ride_type
        )
        result["signals"] = {
            "drivers":      driver_count,
            "riders":       rider_count,
            "demand_ratio": round(demand_ratio, 3),
            "weather_mult": weather_mult,
            "traffic_mult": traffic_mult,
        }
        return response(200, result)
    except Exception as e:
        return response(500, {"error": str(e)})
