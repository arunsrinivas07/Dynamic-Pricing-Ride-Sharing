#!/bin/bash
# test_phase2.sh
# Manually invoke move_drivers and expire_riders to verify they work
# Usage: bash test_phase2.sh

REGION="ap-south-1"

echo "🧪 Testing Phase 2 Lambda functions..."

# ── Test move-drivers-lambda ──────────────────────────────────────────────────
echo ""
echo "1️⃣  Invoking move-drivers-lambda..."
aws lambda invoke \
  --function-name move-drivers-lambda \
  --region "$REGION" \
  --log-type Tail \
  --query "LogResult" \
  --output text \
  move_drivers_response.json | base64 --decode 2>/dev/null || true

echo "Response:"
cat move_drivers_response.json
echo ""

# ── Test expire-riders-lambda ─────────────────────────────────────────────────
echo "2️⃣  Invoking expire-riders-lambda..."
aws lambda invoke \
  --function-name expire-riders-lambda \
  --region "$REGION" \
  --log-type Tail \
  --query "LogResult" \
  --output text \
  expire_riders_response.json | base64 --decode 2>/dev/null || true

echo "Response:"
cat expire_riders_response.json
echo ""

# ── Verify DynamoDB counts after movement ─────────────────────────────────────
echo "3️⃣  DynamoDB counts after Lambda runs:"
echo -n "  drivers table: "
aws dynamodb scan --table-name drivers --region "$REGION" --select COUNT --query "Count" --output text
echo " items"

echo -n "  riders table:  "
aws dynamodb scan --table-name riders  --region "$REGION" --select COUNT --query "Count" --output text
echo " items"

# Cleanup temp files
rm -f move_drivers_response.json expire_riders_response.json

echo ""
echo "✅ Phase 2 test complete"
echo ""
echo "If counts look right, run EventBridge setup:"
echo "  bash deploy_phase2.sh YOUR_ACCOUNT_ID"
