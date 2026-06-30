# riders/lambda_function.py
# GET /riders?lat=&lng=&radius_km=

import sys, time
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

from utils import response, get_nearby_riders, get_active_riders

def lambda_handler(event, context):
    try:
        params    = event.get("queryStringParameters") or {}
        lat       = float(params.get("lat",       11.9139))
        lng       = float(params.get("lng",       79.8145))
        radius_km = float(params.get("radius_km", 3.0))

        now          = int(time.time())
        nearby       = get_nearby_riders(lat, lng, radius_km)
        total_active = len(get_active_riders())

        avg_wait = (
            sum(now - int(r["created_at"]) for r in nearby) / len(nearby)
            if nearby else 0.0
        )

        return response(200, {
            "count":        len(nearby),
            "radius_km":    radius_km,
            "total_active": total_active,
            "avg_wait_sec": round(avg_wait, 1),
        })
    except Exception as e:
        return response(500, {"error": str(e)})
