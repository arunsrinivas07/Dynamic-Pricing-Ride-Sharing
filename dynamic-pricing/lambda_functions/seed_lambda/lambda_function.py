"""
seed_lambda/lambda_function.py — REBALANCED
Key changes vs original:
- NUM_DRIVERS reduced: 70 → 35  (fewer drivers in city)
- NUM_RIDERS increased: 40 → 80  (more riders requesting)
- CITY_RADIUS_KM reduced: 8 → 5  (tighter cluster = more overlap in 3km search)
- Drivers spread across full 5km radius
- Riders cluster 60% near city center hotspots (high demand zones)
- Riders spread 40% across full radius
"""

import json, math, random, uuid, time, os
import boto3
from decimal import Decimal

CITY_CENTER    = {"lat": 11.9139, "lng": 79.8145}
CITY_RADIUS_KM = 5      # ← REDUCED from 8 → tighter city
NUM_DRIVERS    = 35     # ← REDUCED from 70 → fewer drivers
NUM_RIDERS     = 80     # ← INCREASED from 40 → more riders
RIDER_TTL_SEC  = 600

DRIVERS_TABLE  = os.environ.get("DRIVERS_TABLE",  "drivers")
RIDERS_TABLE   = os.environ.get("RIDERS_TABLE",   "riders")
REGION         = os.environ.get("AWS_REGION_NAME", "ap-south-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)

def random_offset(center_lat, center_lng, max_km, min_km=0.0):
    angle     = random.uniform(0, 2 * math.pi)
    # Use sqrt for uniform distribution; clamp to min_km
    r         = min_km + (max_km - min_km) * math.sqrt(random.random())
    dlat      = r / 111.0
    dlng      = r / (111.0 * math.cos(math.radians(center_lat)))
    return (
        center_lat + dlat * math.sin(angle),
        center_lng + dlng * math.cos(angle),
    )

def seed_drivers():
    table = dynamodb.Table(DRIVERS_TABLE)
    # Clear existing
    existing = table.scan(ProjectionExpression="id")["Items"]
    with table.batch_writer() as b:
        for item in existing:
            b.delete_item(Key={"id": item["id"]})

    with table.batch_writer() as b:
        for _ in range(NUM_DRIVERS):
            lat, lng = random_offset(
                CITY_CENTER["lat"], CITY_CENTER["lng"],
                max_km=CITY_RADIUS_KM,
            )
            b.put_item(Item={
                "id":        str(uuid.uuid4())[:8],
                "lat":       Decimal(str(round(lat, 6))),
                "lng":       Decimal(str(round(lng, 6))),
                "available": random.random() > 0.2,   # 80% available
                "heading":   Decimal(str(round(random.uniform(0, 360), 2))),
                "ttl":       int(time.time()) + 86400 * 7,
            })
    print(f"✅ Seeded {NUM_DRIVERS} drivers (radius {CITY_RADIUS_KM}km)")
    return NUM_DRIVERS

def seed_riders():
    table = dynamodb.Table(RIDERS_TABLE)
    # Clear existing
    existing = table.scan(ProjectionExpression="id")["Items"]
    with table.batch_writer() as b:
        for item in existing:
            b.delete_item(Key={"id": item["id"]})

    now = int(time.time())
    with table.batch_writer() as b:
        for i in range(NUM_RIDERS):
            # 60% cluster near center (hotspot) — ensures riders near pickup
            if random.random() < 0.6:
                lat, lng = random_offset(
                    CITY_CENTER["lat"], CITY_CENTER["lng"],
                    max_km=2.5,   # tight inner cluster
                )
            else:
                lat, lng = random_offset(
                    CITY_CENTER["lat"], CITY_CENTER["lng"],
                    max_km=CITY_RADIUS_KM,
                )
            age = random.uniform(0, RIDER_TTL_SEC * 0.7)
            created_at = now - int(age)
            b.put_item(Item={
                "id":         str(uuid.uuid4())[:8],
                "lat":        Decimal(str(round(lat, 6))),
                "lng":        Decimal(str(round(lng, 6))),
                "created_at": created_at,
                "ttl":        created_at + RIDER_TTL_SEC,
            })
    print(f"✅ Seeded {NUM_RIDERS} riders (60% clustered near center)")
    return NUM_RIDERS

def lambda_handler(event, context):
    try:
        d = seed_drivers()
        r = seed_riders()
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message":        "Seed complete — rebalanced",
                "drivers_seeded": d,
                "riders_seeded":  r,
                "ratio":          f"{r/d:.2f}x (riders per driver)",
            }),
        }
    except Exception as e:
        print(f"❌ {e}")
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}