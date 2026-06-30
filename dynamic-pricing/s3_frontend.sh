#!/bin/bash
# s3_frontend.sh — Step 10
# Creates S3 bucket for React static website and uploads build/
# Usage: bash s3_frontend.sh YOUR_ACCOUNT_ID
# Run from your React project root (where package.json is)

ACCOUNT_ID=$1
REGION="ap-south-1"
BUCKET_NAME="dynamic-price-frontend-${ACCOUNT_ID}"

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Usage: bash s3_frontend.sh YOUR_ACCOUNT_ID"
  exit 1
fi

if [ ! -d "build" ]; then
  echo "❌ build/ folder not found. Run 'npm run build' first."
  exit 1
fi

echo "🪣 Creating S3 frontend bucket: $BUCKET_NAME"

# Create bucket
aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

# Disable block public access (needed for static website hosting)
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Enable static website hosting
aws s3api put-bucket-website \
  --bucket "$BUCKET_NAME" \
  --website-configuration '{
    "IndexDocument": {"Suffix": "index.html"},
    "ErrorDocument": {"Key": "index.html"}
  }'

# Set bucket policy — public read for CloudFront
aws s3api put-bucket-policy \
  --bucket "$BUCKET_NAME" \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"PublicReadGetObject\",
        \"Effect\": \"Allow\",
        \"Principal\": \"*\",
        \"Action\": \"s3:GetObject\",
        \"Resource\": \"arn:aws:s3:::${BUCKET_NAME}/*\"
      }
    ]
  }"

echo "📤 Uploading build/ to s3://${BUCKET_NAME}..."

# Upload with correct cache headers
# HTML files — no cache (always fresh)
aws s3 sync build/ "s3://${BUCKET_NAME}/" \
  --exclude "*.js" \
  --exclude "*.css" \
  --exclude "*.png" \
  --exclude "*.ico" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --region "$REGION"

# JS/CSS/images — long cache (content-hashed filenames)
aws s3 sync build/ "s3://${BUCKET_NAME}/" \
  --exclude "*.html" \
  --cache-control "public, max-age=31536000, immutable" \
  --region "$REGION"

echo ""
echo "✅ Frontend uploaded to S3"
echo ""
S3_URL="http://${BUCKET_NAME}.s3-website.${REGION}.amazonaws.com"
echo "S3 website URL (direct, no HTTPS):"
echo "  $S3_URL"
echo ""
echo "BUCKET_NAME=$BUCKET_NAME"
echo "Save this — needed for CloudFront setup in step 11"
