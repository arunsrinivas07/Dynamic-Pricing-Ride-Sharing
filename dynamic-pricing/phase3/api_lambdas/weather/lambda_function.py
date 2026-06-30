# weather/lambda_function.py
# GET /weather?lat=&lng=

import sys, os, json
sys.path.insert(0, "/opt/python")
sys.path.insert(0, ".")

import urllib.request
from utils import response, get_weather_multiplier

OWM_API_KEY = os.environ.get("OWM_API_KEY", "")

ICONS = {
    "clear": "☀️", "clouds": "☁️", "drizzle": "🌦️",
    "rain": "🌧️", "heavy rain": "⛈️", "snow": "❄️",
    "storm": "🌩️", "mist": "🌫️",
}

def lambda_handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        lat    = float(params.get("lat", 11.9139))
        lng    = float(params.get("lng", 79.8145))

        url = (f"https://api.openweathermap.org/data/2.5/weather"
               f"?lat={lat}&lon={lng}&appid={OWM_API_KEY}&units=metric")

        req  = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as res:
            data = json.loads(res.read().decode())

        raw_cond   = data["weather"][0]["main"]
        raw_desc   = data["weather"][0]["description"]
        multiplier, normalized = get_weather_multiplier(raw_cond, raw_desc)

        return response(200, {
            "condition":          normalized,
            "description":        raw_desc.title(),
            "temp_c":             round(data["main"]["temp"], 1),
            "feels_like_c":       round(data["main"]["feels_like"], 1),
            "humidity":           data["main"]["humidity"],
            "wind_speed_kmh":     round(data["wind"]["speed"] * 3.6, 1),
            "weather_multiplier": multiplier,
            "icon":               ICONS.get(normalized, "🌡️"),
        })
    except Exception as e:
        return response(200, {
            "condition": "unknown", "description": "unavailable",
            "temp_c": None, "feels_like_c": None,
            "humidity": None, "wind_speed_kmh": None,
            "weather_multiplier": 1.0, "icon": "❓",
            "error": str(e),
        })
