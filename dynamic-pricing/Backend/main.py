"""
Dynamic Pricing Dispatch Engine - Backend Service
Powered by FastAPI, Machine Learning, and GenAI
"""
import datetime
from groq import Groq
import asyncio
import math
import random
import uuid
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
# load_dotenv("../.env")
import time as _time
from typing import List
from contextlib import asynccontextmanager
import joblib
import numpy as np
from pydantic import BaseModel as PydanticBase
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
model_path = BASE_DIR / "pricing_model.pkl"
pricing_model = joblib.load(model_path)

# ─── CONFIG ───────────────────────────────────────────────────────────────────
TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY")
OWM_API_KEY    = os.getenv("OWM_API_KEY")
GROQ_API_KEY   = os.getenv("GROQ_API_KEY")

groq_client  = Groq(api_key=GROQ_API_KEY)
CITY_CENTER = {"lat": 11.9139, "lng": 79.8145}
CITY_RADIUS_KM = 8
NUM_DRIVERS = 70
MOVE_INTERVAL_SEC = 30
MAX_MOVE_KM = 0.4

NUM_SEED_RIDERS     = 40
RIDER_TTL_SEC       = 300
ADD_RIDERS_PER_TICK = 3

# ─── Data Stores ──────────────────────────────────────────────────────────────
class Driver(BaseModel):
    id: str
    lat: float
    lng: float
    available: bool
    heading: float

drivers: List[dict] = []
riders_store: List[dict] = []

# ─── Geo Helpers ──────────────────────────────────────────────────────────────
def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))

def random_offset(center_lat: float, center_lng: float, max_km: float):
    angle = random.uniform(0, 2 * math.pi)
    radius_km = max_km * math.sqrt(random.random())
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * math.cos(math.radians(center_lat)))
    return (
        center_lat + dlat * math.sin(angle),
        center_lng + dlng * math.cos(angle),
    )

def clamp_to_city(lat: float, lng: float) -> tuple:
    dist = haversine_km(CITY_CENTER["lat"], CITY_CENTER["lng"], lat, lng)
    if dist > CITY_RADIUS_KM:
        return random_offset(CITY_CENTER["lat"], CITY_CENTER["lng"], CITY_RADIUS_KM * 0.6)
    return lat, lng

# ─── Simulation Tasks ─────────────────────────────────────────────────────────
def seed_drivers():
    global drivers
    drivers = []
    for _ in range(NUM_DRIVERS):
        lat, lng = random_offset(CITY_CENTER["lat"], CITY_CENTER["lng"], CITY_RADIUS_KM)
        drivers.append({
            "id":        str(uuid.uuid4())[:8],
            "lat":       lat,
            "lng":       lng,
            "available": random.random() > 0.25,
            "heading":   random.uniform(0, 360),
        })

def move_drivers():
    for d in drivers:
        d["heading"] = (d["heading"] + random.uniform(-40, 40)) % 360
        move_km = random.uniform(0.05, MAX_MOVE_KM)
        angle_rad = math.radians(d["heading"])
        dlat = (move_km / 111.0) * math.cos(angle_rad)
        dlng = (move_km / (111.0 * math.cos(math.radians(d["lat"])))) * math.sin(angle_rad)
        new_lat, new_lng = clamp_to_city(d["lat"] + dlat, d["lng"] + dlng)
        d["lat"], d["lng"] = new_lat, new_lng
        if random.random() < 0.08:
            d["available"] = not d["available"]

def seed_riders():
    global riders_store
    riders_store = []
    now = _time.time()
    for _ in range(NUM_SEED_RIDERS):
        lat, lng = random_offset(CITY_CENTER["lat"], CITY_CENTER["lng"], CITY_RADIUS_KM)
        age = random.uniform(0, RIDER_TTL_SEC * 0.8)
        riders_store.append({
            "id":         str(uuid.uuid4())[:8],
            "lat":        lat,
            "lng":        lng,
            "created_at": now - age,
        })

def expire_and_add_riders():
    global riders_store
    now = _time.time()
    riders_store = [r for r in riders_store if now - r["created_at"] < RIDER_TTL_SEC]
    for _ in range(random.randint(1, ADD_RIDERS_PER_TICK)):
        lat, lng = random_offset(CITY_CENTER["lat"], CITY_CENTER["lng"], CITY_RADIUS_KM)
        riders_store.append({
            "id":         str(uuid.uuid4())[:8],
            "lat":        lat,
            "lng":        lng,
            "created_at": now,
        })

# ─── App Setup ────────────────────────────────────────────────────────────────
scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_drivers()
    seed_riders()
    scheduler.add_job(move_drivers,          "interval", seconds=MOVE_INTERVAL_SEC)
    scheduler.add_job(expire_and_add_riders, "interval", seconds=20)
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(title="DynamicPrice API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/demand")
def get_demand(
    lat: float = Query(..., description="Pickup latitude"),
    lng: float = Query(..., description="Pickup longitude"),
    radius_km: float = Query(3.0, description="Search radius in km"),
):
    now = _time.time()
    
    # Drivers count
    nearby_drivers = [d for d in drivers if d["available"] and haversine_km(lat, lng, d["lat"], d["lng"]) <= radius_km]
    driver_count = len(nearby_drivers)

    # Riders count
    active_riders = [r for r in riders_store if now - r["created_at"] < RIDER_TTL_SEC]
    nearby_riders = [r for r in active_riders if haversine_km(lat, lng, r["lat"], r["lng"]) <= radius_km]
    rider_count = len(nearby_riders)

    avg_wait = sum(now - r["created_at"] for r in nearby_riders) / len(nearby_riders) if nearby_riders else 0.0
    demand_ratio = rider_count / max(driver_count, 1)

    if demand_ratio < 0.8:
        demand_level, surge_multiplier = "low", 1.0
    elif demand_ratio <= 1.2:
        demand_level, surge_multiplier = "normal", 1.2
    else:
        demand_level, surge_multiplier = "surge", round(1.0 + (demand_ratio - 1.2) * 0.5 + 0.4, 2)

    return {
        "drivers":          driver_count,
        "riders":           rider_count,
        "demand_ratio":     round(demand_ratio, 3),
        "demand_level":     demand_level,
        "surge_likely":     demand_ratio > 1.2,
        "surge_multiplier": surge_multiplier,
        "avg_wait_sec":     round(avg_wait, 1),
        "radius_km":        radius_km,
        "total_drivers":    sum(1 for d in drivers if d["available"]),
        "total_riders":     len(active_riders)
    }

# ─── Feature 5: Weather ───────────────────────────────────────────────────────
import httpx

# OWM_API_KEY taken from config section at top

WEATHER_MULTIPLIERS = {
    "clear":      1.0,
    "clouds":     1.05,
    "drizzle":    1.1,
    "rain":       1.15,
    "heavy rain": 1.25,
    "snow":       1.35,
    "storm":      1.5,
    "thunderstorm": 1.5,
    "mist":       1.1,
    "fog":        1.1,
}

def get_weather_multiplier(condition: str, description: str) -> tuple[float, str]:
    """Map OWM condition + description → multiplier + normalized label."""
    c = condition.lower()
    d = description.lower()

    if c == "thunderstorm":
        return 1.5, "storm"
    if c == "snow":
        return 1.35, "snow"
    if c == "rain":
        if "heavy" in d or "extreme" in d:
            return 1.25, "heavy rain"
        return 1.15, "rain"
    if c == "drizzle":
        return 1.1, "drizzle"
    if c in ("mist", "fog", "haze", "smoke", "dust"):
        return 1.1, "mist"
    if c == "clouds":
        return 1.05, "clouds"
    return 1.0, "clear"


@app.get("/weather")
async def get_weather(
    lat: float = Query(..., description="Pickup latitude"),
    lng: float = Query(..., description="Pickup longitude"),
):
    """Fetch live weather from OpenWeatherMap and return pricing multiplier."""
    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        "lat":   lat,
        "lon":   lng,
        "appid": OWM_API_KEY,
        "units": "metric",
    }

    async with httpx.AsyncClient(timeout=8.0) as client:
        res = await client.get(url, params=params)

    if res.status_code != 200:
        return {
            "condition":          "unknown",
            "description":        "unavailable",
            "temp_c":             None,
            "feels_like_c":       None,
            "humidity":           None,
            "wind_speed_kmh":     None,
            "weather_multiplier": 1.0,
            "icon":               "❓",
            "error":              f"OWM returned {res.status_code}",
        }

    data       = res.json()
    raw_cond   = data["weather"][0]["main"]
    raw_desc   = data["weather"][0]["description"]
    multiplier, normalized = get_weather_multiplier(raw_cond, raw_desc)

    # Map condition → display icon
    icons = {
        "clear":      "☀️",
        "clouds":     "☁️",
        "drizzle":    "🌦️",
        "rain":       "🌧️",
        "heavy rain": "⛈️",
        "snow":       "❄️",
        "storm":      "🌩️",
        "mist":       "🌫️",
    }

    return {
        "condition":          normalized,
        "description":        raw_desc.title(),
        "temp_c":             round(data["main"]["temp"], 1),
        "feels_like_c":       round(data["main"]["feels_like"], 1),
        "humidity":           data["main"]["humidity"],
        "wind_speed_kmh":     round(data["wind"]["speed"] * 3.6, 1),
        "weather_multiplier": multiplier,
        "icon":               icons.get(normalized, "🌡️"),
    }

    # ─── Feature 6: Traffic & ETA ─────────────────────────────────────────────────

def get_traffic_multiplier(delay_sec: int) -> tuple[float, str]:
    if delay_sec > 1200:
        return 1.4, "severe"
    if delay_sec > 600:
        return 1.25, "heavy"
    if delay_sec > 300:
        return 1.1, "moderate"
    return 1.0, "clear"


@app.get("/traffic")
async def get_traffic(
    origin_lat:  float = Query(...),
    origin_lng:  float = Query(...),
    dest_lat:    float = Query(...),
    dest_lng:    float = Query(...),
):
    # ── 1. Routing API — ETA + traffic delay ──────────────────────────────────
    route_url = (
        f"https://api.tomtom.com/routing/1/calculateRoute/"
        f"{origin_lat},{origin_lng}:{dest_lat},{dest_lng}/json"
    )
    route_params = {
        "key":        TOMTOM_API_KEY,
        "travelMode": "car",
        "traffic":    "true",
        "routeType":  "fastest",
    }

    # ── 2. Traffic Flow API — speed ratio at pickup ───────────────────────────
    flow_url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative/10/json"
    flow_params = {
        "key":   TOMTOM_API_KEY,
        "point": f"{origin_lat},{origin_lng}",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        route_res, flow_res = await asyncio.gather(
            client.get(route_url, params=route_params),
            client.get(flow_url,  params=flow_params),
            return_exceptions=True,
        )

    # ── Parse routing response ────────────────────────────────────────────────
    if isinstance(route_res, Exception) or route_res.status_code != 200:
        return {"error": "Routing API failed", "traffic_multiplier": 1.0}

    route_data    = route_res.json()
    summary       = route_data["routes"][0]["summary"]
    travel_sec    = summary["travelTimeInSeconds"]
    delay_sec     = summary.get("trafficDelayInSeconds", 0)
    distance_m    = summary["lengthInMeters"]
    traffic_mult, congestion = get_traffic_multiplier(delay_sec)

    # ── Parse flow response (optional signal) ─────────────────────────────────
    speed_ratio   = None
    current_speed = None
    free_flow     = None

    if not isinstance(flow_res, Exception) and flow_res.status_code == 200:
        fd            = flow_res.json().get("flowSegmentData", {})
        current_speed = fd.get("currentSpeed")
        free_flow     = fd.get("freeFlowSpeed")
        if current_speed and free_flow and free_flow > 0:
            speed_ratio = round(current_speed / free_flow, 2)
            # Blend flow ratio into congestion if routing delay is borderline
            if speed_ratio < 0.5 and traffic_mult < 1.25:
                traffic_mult  = 1.25
                congestion    = "heavy"
            elif speed_ratio < 0.75 and traffic_mult < 1.1:
                traffic_mult  = 1.1
                congestion    = "moderate"

    return {
        "eta_minutes":        round(travel_sec / 60, 1),
        "eta_seconds":        travel_sec,
        "delay_seconds":      delay_sec,
        "distance_km":        round(distance_m / 1000, 2),
        "traffic_multiplier": traffic_mult,
        "congestion_level":   congestion,   # "clear"|"moderate"|"heavy"|"severe"
        "current_speed_kmh":  current_speed,
        "free_flow_speed_kmh":free_flow,
        "speed_ratio":        speed_ratio,
    }

# ─── Feature 7: Pricing Logic ─────────────────────────────────────────────────

# City-specific base rates (Puducherry / Chennai)
BASE_RATE     = 30.0   # ₹ flat base
PER_KM_RATE   = 12.0   # ₹ per km
PER_MIN_RATE  =  1.5   # ₹ per minute
MAX_SURGE_CAP =  3.0   # hard cap on surge multiplier
SHARED_DISCOUNT = 0.65 # shared ride multiplier

def compute_price(
    distance_km:        float,
    eta_minutes:        float,
    demand_multiplier:  float,
    weather_multiplier: float,
    traffic_multiplier: float,
    drivers:            int,
    riders:             int,
    ride_type:          str = "single",  # "single" | "shared"
) -> dict:

    # ── Base price ─────────────────────────────────────────────────────────
    base_price = BASE_RATE + (distance_km * PER_KM_RATE) + (eta_minutes * PER_MIN_RATE)

    # ── Rule-based mode guard ──────────────────────────────────────────────
    is_base_mode = (
        drivers >= riders
        and weather_multiplier <= 1.1
        and traffic_multiplier <= 1.1
    )

    if is_base_mode:
        final_multiplier = 1.0
        pricing_mode     = "base"
    else:
        # Combined surge — all three signals multiply together, then cap
        raw_multiplier   = demand_multiplier * weather_multiplier * traffic_multiplier
        final_multiplier = min(raw_multiplier, MAX_SURGE_CAP)
        pricing_mode     = "surge"

    surge_price = round(base_price * final_multiplier, 2)

    # ── Shared ride discount ───────────────────────────────────────────────
    if ride_type == "shared":
        surge_price = round(surge_price * SHARED_DISCOUNT, 2)

    # ── Breakdown for frontend ─────────────────────────────────────────────
    return {
        "pricing_mode":       pricing_mode,         # "base" | "surge"
        "base_price":         round(base_price, 2),
        "final_price":        surge_price,
        "final_multiplier":   round(final_multiplier, 3),
        "demand_multiplier":  round(demand_multiplier, 3),
        "weather_multiplier": weather_multiplier,
        "traffic_multiplier": traffic_multiplier,
        "ride_type":          ride_type,
        "shared_discount":    SHARED_DISCOUNT if ride_type == "shared" else None,
        "surge_capped":       raw_multiplier > MAX_SURGE_CAP if not is_base_mode else False,
        "distance_km":        distance_km,
        "eta_minutes":        eta_minutes,
        "breakdown": {
            "base_rate":    BASE_RATE,
            "distance_fee": round(distance_km * PER_KM_RATE, 2),
            "time_fee":     round(eta_minutes * PER_MIN_RATE, 2),
        },
    }


@app.get("/price")
async def get_price(
    origin_lat:  float = Query(...),
    origin_lng:  float = Query(...),
    dest_lat:    float = Query(...),
    dest_lng:    float = Query(...),
    ride_type:   str   = Query("single"),
):
    """
    Orchestrates all signals → returns rule-based price.
    ML model (Feature 8) will replace/augment this output.
    """

    # Fetch all signals in parallel
    demand_task  = asyncio.get_event_loop().run_in_executor(
        None,
        lambda: {
            "drivers": len([d for d in drivers if d["available"] and haversine_km(origin_lat, origin_lng, d["lat"], d["lng"]) <= 3]),
            "riders":  len([r for r in riders_store if _time.time() - r["created_at"] < RIDER_TTL_SEC and haversine_km(origin_lat, origin_lng, r["lat"], r["lng"]) <= 3]),
        }
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Weather
        weather_res = await client.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={"lat": origin_lat, "lon": origin_lng, "appid": OWM_API_KEY, "units": "metric"},
        )
        # Routing with traffic
        route_res = await client.get(
            f"https://api.tomtom.com/routing/1/calculateRoute/{origin_lat},{origin_lng}:{dest_lat},{dest_lng}/json",
            params={"key": TOMTOM_API_KEY, "travelMode": "car", "traffic": "true", "routeType": "fastest"},
        )

    demand = await demand_task

    # ── Parse weather ──────────────────────────────────────────────────────
    weather_mult = 1.0
    if weather_res.status_code == 200:
        wd = weather_res.json()
        weather_mult, _ = get_weather_multiplier(
            wd["weather"][0]["main"],
            wd["weather"][0]["description"],
        )

    # ── Parse route ────────────────────────────────────────────────────────
    distance_km  = 5.0   # fallback
    eta_minutes  = 15.0
    traffic_mult = 1.0
    if route_res.status_code == 200:
        summary      = route_res.json()["routes"][0]["summary"]
        distance_km  = round(summary["lengthInMeters"] / 1000, 2)
        eta_minutes  = round(summary["travelTimeInSeconds"] / 60, 1)
        delay_sec    = summary.get("trafficDelayInSeconds", 0)
        traffic_mult, _ = get_traffic_multiplier(delay_sec)

    # ── Demand multiplier ──────────────────────────────────────────────────
    demand_ratio  = demand["riders"] / max(demand["drivers"], 1)
    if demand_ratio < 0.8:
        demand_mult = 1.0
    elif demand_ratio <= 1.2:
        demand_mult = 1.2
    else:
        demand_mult = round(1.0 + (demand_ratio - 1.2) * 0.5 + 0.4, 2)

    result = compute_price(
        distance_km        = distance_km,
        eta_minutes        = eta_minutes,
        demand_multiplier  = demand_mult,
        weather_multiplier = weather_mult,
        traffic_multiplier = traffic_mult,
        drivers            = demand["drivers"],
        riders             = demand["riders"],
        ride_type          = ride_type,
    )

    # Attach raw signals for frontend display
    result["signals"] = {
        "drivers":       demand["drivers"],
        "riders":        demand["riders"],
        "demand_ratio":  round(demand_ratio, 3),
        "weather_mult":  weather_mult,
        "traffic_mult":  traffic_mult,
    }

    return result

# ─── Feature 8: ML Predict Price ─────────────────────────────────────────────

class PriceFeatures(PydanticBase):
    distance_km:         float
    eta_minutes:         float
    drivers:             int
    riders:              int
    demand_ratio:        float
    weather_multiplier:  float
    traffic_multiplier:  float
    hour_of_day:         int
    day_of_week:         int
    is_shared:           int   # 0 or 1

# Snap weather/traffic to the 4 discrete values the model trained on
WEATHER_SNAP = [1.0, 1.1, 1.3, 1.5]
TRAFFIC_SNAP = [1.0, 1.2, 1.4, 1.6]

def snap(value: float, allowed: list) -> float:
    return min(allowed, key=lambda x: abs(x - value))

@app.post("/predict-price")
def predict_price(features: PriceFeatures):
    # Clamp + snap inputs to what the model expects
    demand_ratio       = min(features.demand_ratio, 2.0)
    weather_multiplier = snap(features.weather_multiplier, WEATHER_SNAP)
    traffic_multiplier = snap(features.traffic_multiplier, TRAFFIC_SNAP)

    X = np.array([[
        features.distance_km,
        features.eta_minutes,
        features.drivers,
        features.riders,
        demand_ratio,
        weather_multiplier,
        traffic_multiplier,
        features.hour_of_day,
        features.day_of_week,
        features.is_shared,
    ]])

    predicted = float(pricing_model.predict(X)[0])
    predicted = round(max(predicted, 30.0), 2)  # floor at ₹30

    # ±8% confidence interval
    low  = round(predicted * 0.92, 2)
    high = round(predicted * 1.08, 2)

    return {
        "predicted_price": predicted,
        "confidence_interval": {
            "low":  low,
            "high": high,
        },
        "inputs_used": {
            "distance_km":         features.distance_km,
            "eta_minutes":         features.eta_minutes,
            "drivers":             features.drivers,
            "riders":              features.riders,
            "demand_ratio":        demand_ratio,
            "weather_multiplier":  weather_multiplier,
            "traffic_multiplier":  traffic_multiplier,
            "hour_of_day":         features.hour_of_day,
            "day_of_week":         features.day_of_week,
            "is_shared":           features.is_shared,
        }
    }

# ─── Feature 9: GenAI Pricing Explanation ────────────────────────────────────

class ExplainRequest(PydanticBase):
    predicted_price:     float
    base_price:          float
    distance_km:         float
    eta_minutes:         float
    drivers:             int
    riders:              int
    demand_ratio:        float
    weather_condition:   str
    weather_multiplier:  float
    traffic_condition:   str
    traffic_multiplier:  float
    ride_type:           str   # "single" | "shared"
    is_surge:            bool


@app.post("/explain-price")
async def explain_price(req: ExplainRequest):
    # ── Build breakdown numbers ────────────────────────────────────────────
    base_rate     = 30.0
    distance_fee  = round(req.distance_km  * 12.0, 2)
    time_fee      = round(req.eta_minutes  * 1.5,  2)
    base_total    = round(base_rate + distance_fee + time_fee, 2)

    demand_add    = round(base_total * (req.demand_ratio  - 1.0), 2) if req.demand_ratio  > 1.0 else 0
    weather_add   = round(base_total * (req.weather_multiplier - 1.0), 2) if req.weather_multiplier > 1.0 else 0
    traffic_add   = round(base_total * (req.traffic_multiplier - 1.0), 2) if req.traffic_multiplier > 1.0 else 0
    shared_disc   = round(req.predicted_price / 0.65 - req.predicted_price, 2) if req.ride_type == "shared" else 0

    # ── Prompt ────────────────────────────────────────────────────────────
    prompt = f"""
Final Price: ₹{req.predicted_price} | Base Fare: ₹{base_total}
Drivers nearby: {req.drivers} | Riders requesting: {req.riders} | Demand ratio: {req.demand_ratio:.2f}
Weather: {req.weather_condition} (multiplier: {req.weather_multiplier}x)
Traffic: {req.traffic_condition} (multiplier: {req.traffic_multiplier}x)
ETA: {req.eta_minutes} mins | Distance: {req.distance_km} km
Ride type: {req.ride_type} | Surge active: {req.is_surge}

Explain in 3-4 friendly sentences why this price was calculated.
Be specific about which factors increased or decreased the price.
If it is a shared ride, mention the discount. Keep it warm, clear and honest.
""".strip()

    def call_groq_explain():
        return groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a friendly pricing transparency assistant for a ride-sharing app in India. "
                        "Explain prices in plain language — warm, honest, 3-4 sentences max. "
                        "Use ₹ for currency. Never use jargon. Be specific about what drove the price."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=200,
        )

    loop        = asyncio.get_event_loop()
    response    = await loop.run_in_executor(None, call_groq_explain)
    explanation = response.choices[0].message.content.strip()
    
    return {
        "explanation": explanation,
        "breakdown": {
            "base_rate":      base_rate,
            "distance_fee":   distance_fee,
            "time_fee":       time_fee,
            "base_total":     base_total,
            "demand_add":     demand_add,
            "weather_add":    weather_add,
            "traffic_add":    traffic_add,
            "shared_discount": -abs(shared_disc) if shared_disc else 0,
            "final_price":    req.predicted_price,
        },
    }

# ─── Feature 10: Driver Incentive Agent ───────────────────────────────────────

# Coarse grid resolution for surge hotspot detection
GRID_CELL_KM = 1.0

def get_grid_cell(lat: float, lng: float) -> tuple:
    """Snap lat/lng to nearest 1km grid cell center."""
    cell_lat = CITY_RADIUS_KM / 111.0 * GRID_CELL_KM
    cell_lng = CITY_RADIUS_KM / (111.0 * math.cos(math.radians(lat))) * GRID_CELL_KM
    return (round(lat / cell_lat) * cell_lat, round(lng / cell_lng) * cell_lng)


def compute_surge_grid() -> list[dict]:
    """
    Divide city into 1km cells, compute demand_ratio per cell.
    Returns cells sorted by demand_ratio descending.
    """
    now = _time.time()

    # Group drivers and riders into grid cells
    cell_drivers: dict[tuple, int] = {}
    cell_riders:  dict[tuple, int] = {}

    for d in drivers:
        if d["available"]:
            cell = get_grid_cell(d["lat"], d["lng"])
            cell_drivers[cell] = cell_drivers.get(cell, 0) + 1

    for r in riders_store:
        if now - r["created_at"] < RIDER_TTL_SEC:
            cell = get_grid_cell(r["lat"], r["lng"])
            cell_riders[cell] = cell_riders.get(cell, 0) + 1

    # Build grid cells with demand ratio
    all_cells = set(cell_drivers.keys()) | set(cell_riders.keys())
    grid = []
    for cell in all_cells:
        d_count = cell_drivers.get(cell, 0)
        r_count = cell_riders.get(cell, 0)
        if r_count == 0:
            continue
        ratio = round(r_count / max(d_count, 1), 2)
        grid.append({
            "lat":          cell[0],
            "lng":          cell[1],
            "drivers":      d_count,
            "riders":       r_count,
            "demand_ratio": ratio,
            "is_surge":     ratio > 1.2,
        })

    return sorted(grid, key=lambda x: x["demand_ratio"], reverse=True)


# In-memory driver session store  { driver_id: { hours_online, earned } }
driver_sessions: dict[str, dict] = {}


@app.get("/driver-tips")
async def get_driver_tips(
    driver_id: str  = Query(...),
    lat:       float = Query(...),
    lng:       float = Query(...),
):
    now  = _time.time()
    hour = int(__import__("datetime").datetime.now().strftime("%H"))

    # ── Driver session ─────────────────────────────────────────────────────
    if driver_id not in driver_sessions:
        driver_sessions[driver_id] = {
            "start_time": now,
            "earned":     random.uniform(200, 800),   # seed realistic earnings
        }
    session      = driver_sessions[driver_id]
    hours_online = round((now - session["start_time"]) / 3600, 1)
    earned       = round(session["earned"], 0)

    # ── Find top 3 surge hotspots within 10km ─────────────────────────────
    grid    = compute_surge_grid()
    nearby  = [
        cell for cell in grid
        if haversine_km(lat, lng, cell["lat"], cell["lng"]) <= 10.0
    ][:3]

    # Fallback if no nearby surge cells
    if not nearby:
        nearby = grid[:3] if grid else []

    # Reverse geocode zone names via TomTom (best-effort)
    zone_lines = []
    async with httpx.AsyncClient(timeout=6.0) as client:
        for cell in nearby:
            dist = round(haversine_km(lat, lng, cell["lat"], cell["lng"]), 1)
            try:
                r = await client.get(
                    f"https://api.tomtom.com/search/2/reverseGeocode/{cell['lat']},{cell['lng']}.json",
                    params={"key": TOMTOM_API_KEY},
                )
                data = r.json()
                addr = data["addresses"][0]["address"]

                # Print full address for debugging
                print(f"[ReverseGeo] {cell['lat']:.4f},{cell['lng']:.4f} → {addr}")

                name = (
                    addr.get("municipalitySubdivision")
                    or addr.get("localName")
                    or addr.get("postalName")
                    or addr.get("neighbourhood")
                    or addr.get("municipality")
                    or addr.get("countrySecondarySubdivision")
                    or addr.get("countrySubdivision")
                    or None
                )
                name = name.split(",")[0].strip() if name else None
            except Exception as e:
                print(f"[ReverseGeo] Failed: {e}")
                name = None

            # ── Fallback: derive area name from direction + distance ──────
            if not name or any(c.isdigit() for c in name):
                dlat = cell["lat"] - CITY_CENTER["lat"]
                dlng = cell["lng"] - CITY_CENTER["lng"]
                # Cardinal direction from city center
                vert  = "North" if dlat > 0 else "South"
                horiz = "East"  if dlng > 0 else "West"
                dist_from_center = round(haversine_km(
                    CITY_CENTER["lat"], CITY_CENTER["lng"],
                    cell["lat"], cell["lng"]
                ), 1)
                name = f"{vert} {horiz} Puducherry ({dist_from_center}km from center)"
                
            cell["zone_name"] = name
            dist_str = f"{dist}km" if dist >= 1.0 else f"{int(dist*1000)}m"
            zone_lines.append(
                f"- {name}: {cell['demand_ratio']}x surge, "
                f"{dist_str} away, {cell['riders']} pending riders"
            )

    # ── Weather context ────────────────────────────────────────────────────
    weather_condition = "clear"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            wr = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"lat": lat, "lon": lng, "appid": OWM_API_KEY, "units": "metric"},
            )
        if wr.status_code == 200:
            _, weather_condition = get_weather_multiplier(
                wr.json()["weather"][0]["main"],
                wr.json()["weather"][0]["description"],
            )
    except Exception:
        pass

    # ── Build LLM prompt ───────────────────────────────────────────────────
    zones_text = "\n".join(zone_lines) if zone_lines else "- No major surge zones detected nearby"
    prompt = f"""Driver has been online for {hours_online} hours, earned ₹{earned} today.
Current time: {hour:02d}:00 | Weather: {weather_condition}
Top surge zones right now:
{zones_text}

Generate exactly 3 short, specific, actionable peak-hour tips for this driver.
Each tip must start with an emoji and mention a specific zone name, distance, and potential earnings.
Format: one tip per line, no numbering, no headers.""".strip()

    def call_groq():
        return groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role":    "system",
                    "content": (
                        "You are a driver earnings coach for a ride-sharing app in India. "
                        "Give concise, data-driven, encouraging tips. "
                        "Always mention specific zone names, distances, and rupee estimates. "
                        "3 tips only, one per line, each starting with an emoji."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.75,
            max_tokens=250,
        )

    loop     = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, call_groq)
    tips_raw = response.choices[0].message.content.strip()
    tips     = [t.strip() for t in tips_raw.split("\n") if t.strip()][:3]
    
    return {
        "tips":         tips,
        "surge_grid":   nearby,
        "hours_online": hours_online,
        "earned":       earned,
        "hour":         hour,
    }

@app.get("/health")
def health():
    return {"status": "ok", "drivers": len(drivers), "riders": len(riders_store)}
