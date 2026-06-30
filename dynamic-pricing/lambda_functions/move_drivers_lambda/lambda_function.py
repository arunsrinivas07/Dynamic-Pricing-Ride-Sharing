"""
move_drivers/lambda_function.py — REBALANCED
Changes:
- CITY_RADIUS_KM: 8 → 5  (matches seed + expire radius)
- MAX_MOVE_KM: 0.4 → 0.25  (slower movement = drivers stay in search radius longer)
- Toggle available: 8% → 12%  (more drivers go offline = fewer available nearby)
"""

import math, random, time, os
import boto3
from decimal import Decimal

CITY_CENTER    = {"lat": 11.9139, "lng": 79.8145}
CITY_RADIUS_KM = 5      # ← REDUCED from 8
MAX_MOVE_KM    = 0.25   # ← REDUCED from 0.4
DRIVERS_TABLE  = os.environ.get("DRIVERS_TABLE", "drivers")
REGION         = os.environ.get("AWS_REGION_NAME", "ap-south-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)

def haversine_km(lat1, lng1, lat2, lng2):
    R    = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a    = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def random_offset(center_lat, center_lng, max_km):
    angle     = random.uniform(0, 2 * math.pi)
    radius_km = max_km * math.sqrt(random.random())
    dlat      = radius_km / 111.0
    dlng      = radius_km / (111.0 * math.cos(math.radians(center_lat)))
    return center_lat + dlat * math.sin(angle), center_lng + dlng * math.cos(angle)

def clamp_to_city(lat, lng):
    dist = haversine_km(CITY_CENTER["lat"], CITY_CENTER["lng"], lat, lng)
    if dist > CITY_RADIUS_KM:
        return random_offset(CITY_CENTER["lat"], CITY_CENTER["lng"], CITY_RADIUS_KM * 0.5)
    return lat, lng

def lambda_handler(event, context):
    table    = dynamodb.Table(DRIVERS_TABLE)
    response = table.scan()
    drivers  = response["Items"]
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        drivers.extend(response["Items"])

    updated = 0
    with table.batch_writer() as batch:
        for d in drivers:
            heading   = (float(d.get("heading", 0)) + random.uniform(-40, 40)) % 360
            move_km   = random.uniform(0.02, MAX_MOVE_KM)
            angle_rad = math.radians(heading)
            lat       = float(d["lat"])
            lng       = float(d["lng"])

            dlat = (move_km / 111.0) * math.cos(angle_rad)
            dlng = (move_km / (111.0 * math.cos(math.radians(lat)))) * math.sin(angle_rad)
            new_lat, new_lng = clamp_to_city(lat + dlat, lng + dlng)

            available = bool(d.get("available", True))
            if random.random() < 0.12:   # ← 12% toggle (was 8%)
                available = not available

            batch.put_item(Item={
                "id":        d["id"],
                "lat":       Decimal(str(round(new_lat, 6))),
                "lng":       Decimal(str(round(new_lng, 6))),
                "available": available,
                "heading":   Decimal(str(round(heading, 2))),
                "ttl":       int(time.time()) + 86400 * 7,
            })
            updated += 1

    print(f"✅ Moved {updated} drivers (radius {CITY_RADIUS_KM}km, max {MAX_MOVE_KM}km/tick)")
    return {"statusCode": 200, "body": f"Moved {updated} drivers"}