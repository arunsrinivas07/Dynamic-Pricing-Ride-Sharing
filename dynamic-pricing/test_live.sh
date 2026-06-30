#!/bin/bash
# test_live.sh — Test the full deployment end to end
# Usage: bash test_live.sh YOUR_CF_DOMAIN
# Example: bash test_live.sh abc123.cloudfront.net

CF_DOMAIN=$1

if [ -z "$CF_DOMAIN" ]; then
  echo "❌ Usage: bash test_live.sh YOUR_CF_DOMAIN"
  exit 1
fi

BASE="https://${CF_DOMAIN}"
API="${BASE}/api"
LAT="11.9139"; LNG="79.8145"
DEST_LAT="11.9350"; DEST_LNG="79.8270"

echo "🧪 Testing live deployment: $BASE"
echo ""

pass=0; fail=0

check() {
  NAME=$1; URL=$2; METHOD=${3:-GET}; BODY=$4
  echo -n "  $NAME ... "
  if [ "$METHOD" = "POST" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST -H "Content-Type: application/json" -d "$BODY" "$URL")
  else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
  fi
  if [ "$STATUS" = "200" ]; then echo "✅ $STATUS"; ((pass++))
  else echo "❌ $STATUS"; ((fail++)); fi
}

echo "── Frontend ─────────────────────────────────────────"
check "React app loads"   "$BASE/"
check "Static JS bundle"  "$BASE/static/js/main.*.js" 2>/dev/null || \
check "Static assets"     "$BASE/index.html"

echo ""
echo "── API endpoints via CloudFront /api/* ──────────────"
check "GET /api/drivers"  "${API}/drivers?lat=${LAT}&lng=${LNG}"
check "GET /api/riders"   "${API}/riders?lat=${LAT}&lng=${LNG}"
check "GET /api/demand"   "${API}/demand?lat=${LAT}&lng=${LNG}"
check "GET /api/weather"  "${API}/weather?lat=${LAT}&lng=${LNG}"
check "GET /api/traffic"  "${API}/traffic?origin_lat=${LAT}&origin_lng=${LNG}&dest_lat=${DEST_LAT}&dest_lng=${DEST_LNG}"
check "GET /api/price"    "${API}/price?origin_lat=${LAT}&origin_lng=${LNG}&dest_lat=${DEST_LAT}&dest_lng=${DEST_LNG}"
check "POST /api/predict-price" \
  "${API}/predict-price" POST \
  '{"distance_km":12.5,"eta_minutes":22,"drivers":8,"riders":18,"demand_ratio":1.8,"weather_multiplier":1.1,"traffic_multiplier":1.4,"hour_of_day":8,"day_of_week":1,"is_shared":0}'
check "GET /api/driver-tips" \
  "${API}/driver-tips?driver_id=test_001&lat=${LAT}&lng=${LNG}"

echo ""
echo "════════════════════════════════════════════"
echo "Results: $pass passed / $((pass+fail)) total"
if [ $fail -eq 0 ]; then
  echo "🎉 Full deployment verified!"
  echo "🌐 App live at: https://${CF_DOMAIN}"
else
  echo "⚠  $fail endpoint(s) failed"
  echo "Check CloudWatch logs:"
  echo "  aws logs tail /aws/lambda/FUNCTION_NAME --follow --region ap-south-1"
fi
