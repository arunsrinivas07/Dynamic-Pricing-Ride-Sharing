#!/bin/bash
# s3_setup.sh — Step 7: Create S3 bucket and upload pricing_model.pkl
# Usage: bash s3_setup.sh YOUR_ACCOUNT_ID /path/to/pricing_model.pkl

ACCOUNT_ID=$1
MODEL_PATH=$2
REGION="ap-south-1"
BUCKET_NAME="dynamic-price-models-${ACCOUNT_ID}"

if [ -z "$ACCOUNT_ID" ] || [ -z "$MODEL_PATH" ]; then
  echo "❌ Usage: bash s3_setup.sh YOUR_ACCOUNT_ID /path/to/pricing_model.pkl"
  exit 1
fi

echo "🪣 Creating S3 bucket: $BUCKET_NAME"

aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

# Block all public access (private bucket — only Lambda reads it)
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "📤 Uploading pricing_model.pkl..."
aws s3 cp "$MODEL_PATH" "s3://${BUCKET_NAME}/pricing_model.pkl"

echo "✅ Model uploaded to s3://${BUCKET_NAME}/pricing_model.pkl"
echo ""
echo "BUCKET_NAME=$BUCKET_NAME"
echo "Save this — needed for Lambda env vars in deploy_phase3.sh"
