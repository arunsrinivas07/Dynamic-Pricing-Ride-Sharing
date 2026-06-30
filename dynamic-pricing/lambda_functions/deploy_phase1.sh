#!/bin/bash
# deploy_phase1.sh
# Run this from your project root
# Usage: bash deploy_phase1.sh YOUR_ACCOUNT_ID

ACCOUNT_ID=$1
REGION="ap-south-1"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/dynamic-price-lambda-role"

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Usage: bash deploy_phase1.sh YOUR_ACCOUNT_ID"
  exit 1
fi

echo "🚀 Deploying Phase 1 Lambda functions..."
echo "Account: $ACCOUNT_ID | Region: $REGION"

# ── Helper: zip and deploy a lambda ──────────────────────────────────────────
deploy_lambda() {
  FUNC_NAME=$1
  DIR=$2
  echo ""
  echo "📦 Packaging $FUNC_NAME..."
  cd "$DIR"
  zip -r "../${FUNC_NAME}.zip" lambda_function.py
  cd ..

  # Check if function exists
  aws lambda get-function --function-name "$FUNC_NAME" --region "$REGION" > /dev/null 2>&1

  if [ $? -eq 0 ]; then
    echo "🔄 Updating existing $FUNC_NAME..."
    aws lambda update-function-code \
      --function-name "$FUNC_NAME" \
      --zip-file "fileb://${FUNC_NAME}.zip" \
      --region "$REGION"
  else
    echo "✨ Creating new $FUNC_NAME..."
    aws lambda create-function \
      --function-name "$FUNC_NAME" \
      --runtime python3.11 \
      --role "$ROLE_ARN" \
      --handler lambda_function.lambda_handler \
      --zip-file "fileb://${FUNC_NAME}.zip" \
      --timeout 30 \
      --memory-size 256 \
      --environment "Variables={DRIVERS_TABLE=drivers,RIDERS_TABLE=riders,DRIVER_SESSIONS_TABLE=driver_sessions,AWS_REGION_NAME=$REGION}" \
      --region "$REGION"
  fi

  rm "${FUNC_NAME}.zip"
  echo "✅ $FUNC_NAME deployed"
}

# ── Navigate to lambda functions folder ───────────────────────────────────────
cd lambda_functions

# ── Deploy all 3 Phase 1 functions ───────────────────────────────────────────
deploy_lambda "seed-lambda"         "seed_lambda"
deploy_lambda "move-drivers-lambda" "move_drivers_lambda"
deploy_lambda "expire-riders-lambda" "expire_riders_lambda"

cd ..

echo ""
echo "🎉 Phase 1 deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Run seed:    aws lambda invoke --function-name seed-lambda --region $REGION response.json && cat response.json"
echo "  2. Verify DynamoDB tables have data in AWS Console"
echo "  3. Proceed to Phase 2: EventBridge scheduling"