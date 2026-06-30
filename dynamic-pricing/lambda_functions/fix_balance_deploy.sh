#!/bin/bash
# Run this from: dynamic-pricing/lambda_functions/

ACCOUNT_ID=$1
REGION="ap-south-1"

if [ -z "$ACCOUNT_ID" ]; then
  echo "Usage: bash fix_balance_deploy.sh YOUR_ACCOUNT_ID"
  exit 1
fi

echo "Deploying balance fix..."
echo ""

# ─────────────────────────────────────────────
# Core Lambda deploy function
# ─────────────────────────────────────────────
deploy() {
  FUNC=$1
  DIR=$2

  echo -n "Packaging $FUNC ... "

  cd "$DIR" || exit 1
  zip -r "../${FUNC}.zip" . -x "*.pyc" "__pycache__/*" > /dev/null
  cd .. || exit 1

  aws lambda update-function-code \
    --function-name "$FUNC" \
    --zip-file "fileb://${FUNC}.zip" \
    --region "$REGION" \
    --query "FunctionName" \
    --output text > /dev/null

  rm -f "${FUNC}.zip"

  echo "Done"
}

# ─────────────────────────────────────────────
# Deploy core simulation lambdas
# ─────────────────────────────────────────────
deploy "seed-lambda"          "seed_lambda"
deploy "move-drivers-lambda"  "move_drivers_lambda"
deploy "expire-riders-lambda" "expire_riders_lambda"

echo ""
echo "Updating API Lambdas..."
echo ""

API_BASE="../phase3/api_lambdas"

deploy "drivers-lambda"        "$API_BASE/drivers"
deploy "riders-lambda"         "$API_BASE/riders"
deploy "demand-lambda"         "$API_BASE/demand"
deploy "price-lambda"          "$API_BASE/price"
deploy "driver-tips-lambda"    "$API_BASE/driver_tips"
deploy "predict-price-lambda"  "$API_BASE/predict_price"
deploy "explain-price-lambda"  "$API_BASE/explain_price"
deploy "traffic-lambda"        "$API_BASE/traffic"
deploy "weather-lambda"        "$API_BASE/weather"
deploy "s3-upload-lambda"      "$API_BASE/s3_upload"

echo ""
echo "Re-seeding DynamoDB..."

aws lambda invoke \
  --function-name seed-lambda \
  --region "$REGION" \
  /tmp/seed_result.json > /dev/null

cat /tmp/seed_result.json

echo ""
echo "Done."