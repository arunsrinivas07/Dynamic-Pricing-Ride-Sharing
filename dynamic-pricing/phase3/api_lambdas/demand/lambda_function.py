# demand/lambda_function.py
# GET /demand?lat=&lng=&radius_km=

import sys, time
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

from utils import response, get_nearby_drivers, get_nearby_riders

def lambda_handler(event, context):
    try:
        params    = event.get("queryStringParameters") or {}
        lat       = float(params.get("lat",       11.9139))
        lng       = float(params.get("lng",       79.8145))
        radius_km = float(params.get("radius_km", 3.0))

        now            = int(time.time())
        nearby_drivers = get_nearby_drivers(lat, lng, radius_km)
        nearby_riders  = get_nearby_riders(lat, lng, radius_km)

        driver_count = len(nearby_drivers)
        rider_count  = len(nearby_riders)
        demand_ratio = rider_count / max(driver_count, 1)

        avg_wait = (
            sum(now - int(r["created_at"]) for r in nearby_riders) / len(nearby_riders)
            if nearby_riders else 0.0
        )

        if demand_ratio < 0.8:
            level = "low";    mult = 1.0
        elif demand_ratio <= 1.2:
            level = "normal"; mult = 1.2
        else:
            level = "surge";  mult = round(1.0 + (demand_ratio - 1.2) * 0.5 + 0.4, 2)

        return response(200, {
            "drivers":          driver_count,
            "riders":           rider_count,
            "demand_ratio":     round(demand_ratio, 3),
            "demand_level":     level,
            "surge_likely":     demand_ratio > 1.2,
            "surge_multiplier": mult,
            "avg_wait_sec":     round(avg_wait, 1),
            "radius_km":        radius_km,
        })
    except Exception as e:
        return response(500, {"error": str(e)})
