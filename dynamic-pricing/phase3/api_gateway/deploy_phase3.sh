#!/bin/bash
# deploy_phase3.sh — Packages all API Lambdas + creates API Gateway
# Usage: bash deploy_phase3.sh YOUR_ACCOUNT_ID YOUR_TOMTOM_KEY YOUR_OWM_KEY YOUR_GROQ_KEY

ACCOUNT_ID=$1
TOMTOM_KEY=$2
OWM_KEY=$3
GROQ_KEY=$4
REGION="ap-south-1"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/dynamic-price-lambda-role"
MODEL_BUCKET="dynamic-price-models-${ACCOUNT_ID}"

if [ -z "$ACCOUNT_ID" ] || [ -z "$TOMTOM_KEY" ] || [ -z "$OWM_KEY" ] || [ -z "$GROQ_KEY" ]; then
  echo "❌ Usage: bash deploy_phase3.sh ACCOUNT_ID TOMTOM_KEY OWM_KEY GROQ_KEY"
  exit 1
fi

echo "🚀 Phase 3: Deploying API Lambda functions..."

# ── Common env vars for all Lambdas ──────────────────────────────────────────
ENV_VARS="Variables={\
DRIVERS_TABLE=drivers,\
RIDERS_TABLE=riders,\
DRIVER_SESSIONS_TABLE=driver_sessions,\
AWS_REGION_NAME=${REGION},\
TOMTOM_API_KEY=${TOMTOM_KEY},\
OWM_API_KEY=${OWM_KEY},\
GROQ_API_KEY=${GROQ_KEY},\
MODEL_BUCKET=${MODEL_BUCKET},\
MODEL_KEY=pricing_model.pkl\
}"

# ── Package shared utils into every Lambda zip ────────────────────────────────
package_lambda() {
  FUNC_NAME=$1
  DIR="api_lambdas/$2"
  echo ""
  echo "📦 Packaging $FUNC_NAME..."

  # Copy shared utils into lambda folder
  cp api_lambdas/shared/utils.py "$DIR/utils.py"

  cd "$DIR"
  zip -r "../../${FUNC_NAME}.zip" . -x "*.pyc" "__pycache__/*"
  cd ../..
  rm -f "$DIR/utils.py"
  echo "  ✅ $FUNC_NAME.zip created"
}

# ── Deploy or update a Lambda function ───────────────────────────────────────
deploy_lambda() {
  FUNC_NAME=$1
  TIMEOUT=${2:-30}
  MEMORY=${3:-256}

  aws lambda get-function --function-name "$FUNC_NAME" --region "$REGION" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "  🔄 Updating $FUNC_NAME..."
    aws lambda update-function-code \
      --function-name "$FUNC_NAME" \
      --zip-file "fileb://${FUNC_NAME}.zip" \
      --region "$REGION" > /dev/null

    # Wait until code update finishes
    aws lambda wait function-updated \
      --function-name "$FUNC_NAME" \
      --region "$REGION"

    aws lambda update-function-configuration \
      --function-name "$FUNC_NAME" \
      --environment "$ENV_VARS" \
      --timeout "$TIMEOUT" \
      --memory-size "$MEMORY" \
      --region "$REGION" > /dev/null

    # Wait until config update finishes
    aws lambda wait function-updated \
      --function-name "$FUNC_NAME" \
      --region "$REGION"
  else
    echo "  ✨ Creating $FUNC_NAME..."
    aws lambda create-function \
      --function-name "$FUNC_NAME" \
      --runtime python3.11 \
      --role "$ROLE_ARN" \
      --handler lambda_function.lambda_handler \
      --zip-file "fileb://${FUNC_NAME}.zip" \
      --timeout "$TIMEOUT" \
      --memory-size "$MEMORY" \
      --environment "$ENV_VARS" \
      --region "$REGION" > /dev/null
  fi
  rm -f "${FUNC_NAME}.zip"
  echo "  ✅ $FUNC_NAME deployed"
}

# ── Step 6: Package and deploy all 9 API Lambdas ─────────────────────────────
package_lambda "drivers-lambda"       "drivers"
package_lambda "riders-lambda"        "riders"
package_lambda "demand-lambda"        "demand"
package_lambda "weather-lambda"       "weather"
package_lambda "traffic-lambda"       "traffic"
package_lambda "price-lambda"         "price"
package_lambda "predict-price-lambda" "predict_price"
package_lambda "explain-price-lambda" "explain_price"
package_lambda "driver-tips-lambda"   "driver_tips"

deploy_lambda "drivers-lambda"        15  128
deploy_lambda "riders-lambda"         15  128
deploy_lambda "demand-lambda"         20  128
deploy_lambda "weather-lambda"        15  128
deploy_lambda "traffic-lambda"        20  128
deploy_lambda "price-lambda"          30  256
deploy_lambda "predict-price-lambda"  30  512   # needs more RAM for XGBoost
deploy_lambda "explain-price-lambda"  30  256
deploy_lambda "driver-tips-lambda"    45  256

# ── Step 8: Create API Gateway HTTP API ───────────────────────────────────────
echo ""
echo "🌐 Creating API Gateway HTTP API..."

API_ID=$(aws apigatewayv2 create-api \
  --name "dynamic-price-api" \
  --protocol-type HTTP \
  --cors-configuration \
    AllowOrigins="*",AllowMethods="GET,POST,OPTIONS",AllowHeaders="Content-Type" \
  --region "$REGION" \
  --query "ApiId" --output text)

echo "  API ID: $API_ID"

# Create default stage with auto-deploy
aws apigatewayv2 create-stage \
  --api-id "$API_ID" \
  --stage-name "prod" \
  --auto-deploy \
  --region "$REGION" > /dev/null

echo "  Stage 'prod' created"

# ── Wire routes to Lambda functions ──────────────────────────────────────────
wire_route() {
  METHOD=$1
  ROUTE=$2
  FUNC_NAME=$3

  FUNC_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNC_NAME}"

  # Create Lambda integration
  INTEGRATION_ID=$(aws apigatewayv2 create-integration \
    --api-id "$API_ID" \
    --integration-type AWS_PROXY \
    --integration-uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${FUNC_ARN}/invocations" \
    --payload-format-version "2.0" \
    --region "$REGION" \
    --query "IntegrationId" --output text)

  # Create route
  aws apigatewayv2 create-route \
    --api-id "$API_ID" \
    --route-key "${METHOD} ${ROUTE}" \
    --target "integrations/${INTEGRATION_ID}" \
    --region "$REGION" > /dev/null

  # Grant API Gateway permission to invoke Lambda
  aws lambda add-permission \
    --function-name "$FUNC_NAME" \
    --statement-id "apigw-${FUNC_NAME}-$(date +%s)" \
    --action "lambda:InvokeFunction" \
    --principal "apigateway.amazonaws.com" \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*${ROUTE}" \
    --region "$REGION" > /dev/null 2>&1

  echo "  ✅ $METHOD $ROUTE → $FUNC_NAME"
}

echo ""
echo "🔗 Wiring API routes..."
wire_route "GET"  "/drivers"       "drivers-lambda"
wire_route "GET"  "/riders"        "riders-lambda"
wire_route "GET"  "/demand"        "demand-lambda"
wire_route "GET"  "/weather"       "weather-lambda"
wire_route "GET"  "/traffic"       "traffic-lambda"
wire_route "GET"  "/price"         "price-lambda"
wire_route "POST" "/predict-price" "predict-price-lambda"
wire_route "POST" "/explain-price" "explain-price-lambda"
wire_route "GET"  "/driver-tips"   "driver-tips-lambda"

# ── Print final API URL ───────────────────────────────────────────────────────
API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
echo ""
echo "🎉 Phase 3 complete!"
echo ""
echo "════════════════════════════════════════════════════"
echo "  API Gateway URL:"
echo "  $API_URL"
echo "════════════════════════════════════════════════════"
echo ""
echo "Test endpoints:"
echo "  curl \"${API_URL}/drivers?lat=11.9139&lng=79.8145\""
echo "  curl \"${API_URL}/demand?lat=11.9139&lng=79.8145\""
echo "  curl \"${API_URL}/weather?lat=11.9139&lng=79.8145\""
echo ""
echo "Next step: Update API_BASE in your React components to:"
echo "  const API_BASE = \"${API_URL}\""
echo ""
echo "Save your API Gateway URL for Phase 4 (CloudFront + S3 frontend)"
echo "API_ID=$API_ID"
echo "API_URL=$API_URL"
