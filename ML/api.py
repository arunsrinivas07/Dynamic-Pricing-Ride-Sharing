from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
import joblib
import os

app = FastAPI(title="Ride-Share Dynamic Pricing API")

# Load model once at startup
MODEL_PATH = "pricing_model.pkl"
if not os.path.exists(MODEL_PATH):
    raise RuntimeError(f"Model file not found: {MODEL_PATH}")
model = joblib.load(MODEL_PATH)

FEATURES = ['distance_km', 'eta_minutes', 'drivers', 'riders',
            'demand_ratio', 'weather_multiplier', 'traffic_multiplier',
            'hour_of_day', 'day_of_week', 'is_shared']

class PriceRequest(BaseModel):
    distance_km: float
    eta_minutes: float
    drivers: int
    riders: int
    demand_ratio: float
    weather_multiplier: float
    traffic_multiplier: float
    hour_of_day: int
    day_of_week: int
    is_shared: int  # 0 or 1

class PriceResponse(BaseModel):
    predicted_price: float
    confidence_interval: dict  # {"low": float, "high": float}

@app.post("/predict-price", response_model=PriceResponse)
def predict_price(req: PriceRequest):
    try:
        features = [[getattr(req, f) for f in FEATURES]]
        prediction = float(model.predict(features)[0])

        # Confidence interval: ±8% based on noise in training data
        margin = prediction * 0.08
        return PriceResponse(
            predicted_price=round(prediction, 2),
            confidence_interval={
                "low":  round(prediction - margin, 2),
                "high": round(prediction + margin, 2)
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}