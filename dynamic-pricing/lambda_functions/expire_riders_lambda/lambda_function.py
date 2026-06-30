"""
expire_riders/lambda_function.py — REBALANCED
Changes:
- CITY_RADIUS_KM: 8 → 5  (matches seed + move radius)
- ADD_PER_TICK: 5-8 → 8-12  (more riders added per minute)
- MIN_RIDERS: 25 → 40  (higher floor)
- 60% of new riders spawn near city center (hotspot clustering)
"""

import math, random, uuid, time, os
import boto3
from decimal import Decimal

CITY_CENTER    = {"lat": 11.9139, "lng": 79.8145}
CITY_RADIUS_KM = 5      # ← REDUCED from 8
RIDER_TTL_SEC  = 600
ADD_PER_TICK   = 10     # ← INCREASED from 5-8
MIN_RIDERS     = 40     # ← INCREASED from 25
RIDERS_TABLE   = os.environ.get("RIDERS_TABLE", "riders")
REGION         = os.environ.get("AWS_REGION_NAME", "ap-south-1")

dynamodb = boto3.resource("dynamodb", region_name=REGION)

def random_offset(center_lat, center_lng, max_km):
    angle     = random.uniform(0, 2 * math.pi)
    radius_km = max_km * math.sqrt(random.random())
    dlat      = radius_km / 111.0
    dlng      = radius_km / (111.0 * math.cos(math.radians(center_lat)))
    return center_lat + dlat * math.sin(angle), center_lng + dlng * math.cos(angle)

def lambda_handler(event, context):
    table = dynamodb.Table(RIDERS_TABLE)
    now   = int(time.time())

    response = table.scan()
    riders   = response["Items"]
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        riders.extend(response["Items"])

    total_before = len(riders)

    # Delete expired
    expired = [r for r in riders if int(r.get("created_at", 0)) + RIDER_TTL_SEC < now]
    with table.batch_writer() as batch:
        for r in expired:
            batch.delete_item(Key={"id": r["id"]})

    active_after = total_before - len(expired)

    # How many to add
    shortfall = max(0, MIN_RIDERS - active_after)
    organic   = random.randint(ADD_PER_TICK - 2, ADD_PER_TICK + 2)
    new_count = max(organic, shortfall)

    with table.batch_writer() as batch:
        for _ in range(new_count):
            # 60% cluster near center — ensures riders show up in 3km search
            if random.random() < 0.6:
                lat, lng = random_offset(
                    CITY_CENTER["lat"], CITY_CENTER["lng"], max_km=2.5
                )
            else:
                lat, lng = random_offset(
                    CITY_CENTER["lat"], CITY_CENTER["lng"], max_km=CITY_RADIUS_KM
                )
            batch.put_item(Item={
                "id":         str(uuid.uuid4())[:8],
                "lat":        Decimal(str(round(lat, 6))),
                "lng":        Decimal(str(round(lng, 6))),
                "created_at": now,
                "ttl":        now + RIDER_TTL_SEC,
            })

    final = active_after + new_count
    print(f"✅ Riders: before={total_before} expired={len(expired)} added={new_count} after={final}")
    return {"statusCode": 200, "body": f"before={total_before} expired={len(expired)} added={new_count} after={final}"}