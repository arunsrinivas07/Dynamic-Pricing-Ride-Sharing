# traffic/lambda_function.py
# GET /traffic?origin_lat=&origin_lng=&dest_lat=&dest_lng=

import sys, os, json
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

import urllib.request, urllib.parse
from utils import response, get_traffic_multiplier

TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY", "")

def fetch_url(url):
    with urllib.request.urlopen(urllib.request.Request(url), timeout=10) as res:
        return json.loads(res.read().decode())

def lambda_handler(event, context):
    try:
        params      = event.get("queryStringParameters") or {}
        origin_lat  = float(params.get("origin_lat",  11.9139))
        origin_lng  = float(params.get("origin_lng",  79.8145))
        dest_lat    = float(params.get("dest_lat",    11.9350))
        dest_lng    = float(params.get("dest_lng",    79.8270))

        # ── Routing API ───────────────────────────────────────────────────
        route_url = (
            f"https://api.tomtom.com/routing/1/calculateRoute/"
            f"{origin_lat},{origin_lng}:{dest_lat},{dest_lng}/json"
            f"?key={TOMTOM_API_KEY}&travelMode=car&traffic=true&routeType=fastest"
        )
        route_data   = fetch_url(route_url)
        summary      = route_data["routes"][0]["summary"]
        travel_sec   = summary["travelTimeInSeconds"]
        delay_sec    = summary.get("trafficDelayInSeconds", 0)
        distance_m   = summary["lengthInMeters"]
        traffic_mult, congestion = get_traffic_multiplier(delay_sec)

        # ── Flow API ──────────────────────────────────────────────────────
        speed_ratio   = None
        current_speed = None
        free_flow     = None
        try:
            flow_url = (
                f"https://api.tomtom.com/traffic/services/4/flowSegmentData"
                f"/relative/10/json?key={TOMTOM_API_KEY}&point={origin_lat},{origin_lng}"
            )
            fd = fetch_url(flow_url).get("flowSegmentData", {})
            current_speed = fd.get("currentSpeed")
            free_flow     = fd.get("freeFlowSpeed")
            if current_speed and free_flow and free_flow > 0:
                speed_ratio = round(current_speed / free_flow, 2)
                if speed_ratio < 0.5 and traffic_mult < 1.25:
                    traffic_mult, congestion = 1.25, "heavy"
                elif speed_ratio < 0.75 and traffic_mult < 1.1:
                    traffic_mult, congestion = 1.1, "moderate"
        except Exception:
            pass

        return response(200, {
            "eta_minutes":         round(travel_sec / 60, 1),
            "eta_seconds":         travel_sec,
            "delay_seconds":       delay_sec,
            "distance_km":         round(distance_m / 1000, 2),
            "traffic_multiplier":  traffic_mult,
            "congestion_level":    congestion,
            "current_speed_kmh":   current_speed,
            "free_flow_speed_kmh": free_flow,
            "speed_ratio":         speed_ratio,
        })
    except Exception as e:
        return response(500, {"error": str(e), "traffic_multiplier": 1.0})
