#!/bin/bash
# test_phase3.sh — Test all API Gateway endpoints
# Usage: bash test_phase3.sh YOUR_API_URL
# Example: bash test_phase3.sh https://abc123.execute-api.ap-south-1.amazonaws.com/prod

API_URL=$1
LAT="11.9139"
LNG="79.8145"
DEST_LAT="11.9350"
DEST_LNG="79.8270"

if [ -z "$API_URL" ]; then
  echo "❌ Usage: bash test_phase3.sh YOUR_API_URL"
  exit 1
fi

echo "🧪 Testing all Phase 3 endpoints..."
echo "Base URL: $API_URL"
echo ""

pass=0; fail=0

test_endpoint() {
  NAME=$1; URL=$2; METHOD=${3:-GET}; BODY=$4
  echo -n "  $NAME ... "
  if [ "$METHOD" = "POST" ]; then
    STATUS=$(curl -s -o /tmp/test_response.json -w "%{http_code}" \
      -X POST -H "Content-Type: application/json" -d "$BODY" "$URL")
  else
    STATUS=$(curl -s -o /tmp/test_response.json -w "%{http_code}" "$URL")
  fi
  if [ "$STATUS" = "200" ]; then
    echo "✅ 200 OK"
    cat /tmp/test_response.json | python3 -m json.tool 2>/dev/null | head -8
    ((pass++))
  else
    echo "❌ HTTP $STATUS"
    cat /tmp/test_response.json
    ((fail++))
  fi
  echo ""
}

test_endpoint "GET /drivers" \
  "${API_URL}/drivers?lat=${LAT}&lng=${LNG}&radius_km=3"

test_endpoint "GET /riders" \
  "${API_URL}/riders?lat=${LAT}&lng=${LNG}&radius_km=3"

test_endpoint "GET /demand" \
  "${API_URL}/demand?lat=${LAT}&lng=${LNG}&radius_km=3"

test_endpoint "GET /weather" \
  "${API_URL}/weather?lat=${LAT}&lng=${LNG}"

test_endpoint "GET /traffic" \
  "${API_URL}/traffic?origin_lat=${LAT}&origin_lng=${LNG}&dest_lat=${DEST_LAT}&dest_lng=${DEST_LNG}"

test_endpoint "GET /price" \
  "${API_URL}/price?origin_lat=${LAT}&origin_lng=${LNG}&dest_lat=${DEST_LAT}&dest_lng=${DEST_LNG}&ride_type=single"

test_endpoint "POST /predict-price" \
  "${API_URL}/predict-price" \
  "POST" \
  '{"distance_km":12.5,"eta_minutes":22.0,"drivers":8,"riders":18,"demand_ratio":1.8,"weather_multiplier":1.1,"traffic_multiplier":1.4,"hour_of_day":8,"day_of_week":1,"is_shared":0}'

test_endpoint "GET /driver-tips" \
  "${API_URL}/driver-tips?driver_id=driver_001&lat=${LAT}&lng=${LNG}"

echo "════════════════════════════════════════"
echo "Results: $pass passed, $fail failed"
if [ $fail -eq 0 ]; then
  echo "🎉 All endpoints working!"
  echo "Update API_BASE in React to: $API_URL"
else
  echo "⚠  Check CloudWatch logs:"
  echo "  aws logs tail /aws/lambda/FUNCTION_NAME --follow --region ap-south-1"
fi
