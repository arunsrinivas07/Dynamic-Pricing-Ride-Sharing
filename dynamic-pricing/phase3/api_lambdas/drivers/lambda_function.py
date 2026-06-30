# drivers/lambda_function.py
# GET /drivers?lat=&lng=&radius_km=

import json
import sys
sys.path.insert(0, "/opt/python")   # Lambda layer path
sys.path.insert(0, ".")

from utils import response, get_nearby_drivers, DRIVERS_TABLE
import boto3, os

def lambda_handler(event, context):
    try:
        params     = event.get("queryStringParameters") or {}
        lat        = float(params.get("lat",       11.9139))
        lng        = float(params.get("lng",       79.8145))
        radius_km  = float(params.get("radius_km", 3.0))

        nearby      = get_nearby_drivers(lat, lng, radius_km)
        driver_list = [{"id": d["id"],
                        "lat": float(d["lat"]),
                        "lng": float(d["lng"])} for d in nearby]

        # Get total active count
        from utils import get_active_drivers
        total_active = len(get_active_drivers())

        return response(200, {
            "count":        len(nearby),
            "radius_km":    radius_km,
            "drivers":      driver_list,
            "total_active": total_active,
        })
    except Exception as e:
        return response(500, {"error": str(e)})
