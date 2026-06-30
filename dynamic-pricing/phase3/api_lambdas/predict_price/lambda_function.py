# predict_price/lambda_function.py
# POST /predict-price  — loads model from S3, runs XGBoost prediction

import sys, os, json, tempfile
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

import boto3
import numpy as np
import joblib

from utils import response

S3_BUCKET    = os.environ.get("MODEL_BUCKET", "dynamic-price-models")
MODEL_KEY    = os.environ.get("MODEL_KEY",    "pricing_model.pkl")
MODEL_PATH   = "/tmp/pricing_model.pkl"   # Lambda /tmp is writable

_model = None   # module-level cache — persists across warm invocations

def load_model():
    global _model
    if _model is not None:
        return _model
    # Download from S3 if not already in /tmp
    if not os.path.exists(MODEL_PATH):
        print(f"Downloading model from s3://{S3_BUCKET}/{MODEL_KEY}")
        boto3.client("s3").download_file(S3_BUCKET, MODEL_KEY, MODEL_PATH)
    _model = joblib.load(MODEL_PATH)
    print("Model loaded successfully")
    return _model

WEATHER_SNAP = [1.0, 1.1, 1.3, 1.5]
TRAFFIC_SNAP = [1.0, 1.2, 1.4, 1.6]

def snap(value, allowed):
    return min(allowed, key=lambda x: abs(x - value))

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")

        distance_km        = float(body.get("distance_km",        5.0))
        eta_minutes        = float(body.get("eta_minutes",        15.0))
        drivers            = int(body.get("drivers",              10))
        riders             = int(body.get("riders",               10))
        demand_ratio       = min(float(body.get("demand_ratio",   1.0)), 2.0)
        weather_multiplier = snap(float(body.get("weather_multiplier", 1.0)), WEATHER_SNAP)
        traffic_multiplier = snap(float(body.get("traffic_multiplier", 1.0)), TRAFFIC_SNAP)
        hour_of_day        = int(body.get("hour_of_day",          12))
        day_of_week        = int(body.get("day_of_week",          1))
        is_shared          = int(body.get("is_shared",            0))

        model = load_model()

        X = np.array([[
            distance_km, eta_minutes, drivers, riders,
            demand_ratio, weather_multiplier, traffic_multiplier,
            hour_of_day, day_of_week, is_shared,
        ]])

        predicted = float(model.predict(X)[0])
        predicted = round(max(predicted, 30.0), 2)

        return response(200, {
            "predicted_price": predicted,
            "confidence_interval": {
                "low":  round(predicted * 0.92, 2),
                "high": round(predicted * 1.08, 2),
            },
            "inputs_used": {
                "distance_km":        distance_km,
                "eta_minutes":        eta_minutes,
                "drivers":            drivers,
                "riders":             riders,
                "demand_ratio":       demand_ratio,
                "weather_multiplier": weather_multiplier,
                "traffic_multiplier": traffic_multiplier,
                "hour_of_day":        hour_of_day,
                "day_of_week":        day_of_week,
                "is_shared":          is_shared,
            },
        })
    except Exception as e:
        return response(500, {"error": str(e)})
