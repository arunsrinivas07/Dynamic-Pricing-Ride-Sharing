#!/bin/bash
# update_lambda_config.sh
# Increase timeout and memory for background task Lambdas
# Run this BEFORE deploy_phase2.sh
# Usage: bash update_lambda_config.sh

REGION="ap-south-1"

echo "⚙️  Updating Lambda configurations for Phase 2..."

# move-drivers-lambda — scans + updates 70 items, needs more time
echo "Updating move-drivers-lambda config..."
aws lambda update-function-configuration \
  --function-name move-drivers-lambda \
  --timeout 55 \
  --memory-size 256 \
  --region "$REGION"

# expire-riders-lambda — scans + deletes + inserts, needs more time
echo "Updating expire-riders-lambda config..."
aws lambda update-function-configuration \
  --function-name expire-riders-lambda \
  --timeout 55 \
  --memory-size 256 \
  --region "$REGION"

# seed-lambda — scans + batch writes, needs most time
echo "Updating seed-lambda config..."
aws lambda update-function-configuration \
  --function-name seed-lambda \
  --timeout 60 \
  --memory-size 512 \
  --region "$REGION"

echo ""
echo "✅ Lambda configs updated"
echo "  move-drivers-lambda:  55s timeout, 256MB"
echo "  expire-riders-lambda: 55s timeout, 256MB"
echo "  seed-lambda:          60s timeout, 512MB"
echo ""
echo "Now run: bash test_phase2.sh"
