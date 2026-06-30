# explain_price/lambda_function.py
# POST /explain-price — Groq LLM explanation

import sys, os, json
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

from groq import Groq
from utils import response

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
groq_client  = Groq(api_key=GROQ_API_KEY)

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")

        predicted_price    = float(body.get("predicted_price",    200))
        distance_km        = float(body.get("distance_km",        5.0))
        eta_minutes        = float(body.get("eta_minutes",        15.0))
        drivers            = int(body.get("drivers",              10))
        riders             = int(body.get("riders",               10))
        demand_ratio       = float(body.get("demand_ratio",       1.0))
        weather_condition  = body.get("weather_condition",        "clear")
        weather_multiplier = float(body.get("weather_multiplier", 1.0))
        traffic_condition  = body.get("traffic_condition",        "clear")
        traffic_multiplier = float(body.get("traffic_multiplier", 1.0))
        ride_type          = body.get("ride_type",                "single")
        is_surge           = bool(body.get("is_surge",            False))

        base_rate    = 30.0
        distance_fee = round(distance_km * 12.0, 2)
        time_fee     = round(eta_minutes  * 1.5,  2)
        base_total   = round(base_rate + distance_fee + time_fee, 2)
        demand_add   = round(base_total * (demand_ratio - 1.0), 2)   if demand_ratio > 1.0       else 0
        weather_add  = round(base_total * (weather_multiplier - 1.0), 2) if weather_multiplier > 1.0 else 0
        traffic_add  = round(base_total * (traffic_multiplier - 1.0), 2) if traffic_multiplier > 1.0 else 0
        shared_disc  = round(predicted_price / 0.65 - predicted_price, 2) if ride_type == "shared" else 0

        prompt = f"""Final Price: ₹{predicted_price} | Base Fare: ₹{base_total}
Drivers nearby: {drivers} | Riders requesting: {riders} | Demand ratio: {demand_ratio:.2f}
Weather: {weather_condition} (multiplier: {weather_multiplier}x)
Traffic: {traffic_condition} (multiplier: {traffic_multiplier}x)
ETA: {eta_minutes} mins | Distance: {distance_km} km
Ride type: {ride_type} | Surge active: {is_surge}

Explain in 3-4 friendly sentences why this price was calculated."""

        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": (
                    "You are a friendly pricing transparency assistant for a ride-sharing app in India. "
                    "Explain prices in plain language — warm, honest, 3-4 sentences max. "
                    "Use ₹ for currency. Never use jargon."
                )},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=200,
        )

        return response(200, {
            "explanation": resp.choices[0].message.content.strip(),
            "breakdown": {
                "base_rate":       base_rate,
                "distance_fee":    distance_fee,
                "time_fee":        time_fee,
                "base_total":      base_total,
                "demand_add":      demand_add,
                "weather_add":     weather_add,
                "traffic_add":     traffic_add,
                "shared_discount": -abs(shared_disc) if shared_disc else 0,
                "final_price":     predicted_price,
            },
        })
    except Exception as e:
        return response(500, {"error": str(e)})
