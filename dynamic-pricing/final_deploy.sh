#!/bin/bash
# final_deploy.sh
# Run after CloudFront is created and you have the CF domain
# Updates API_BASE to use CloudFront /api/* path, rebuilds, re-uploads
# Usage: bash final_deploy.sh YOUR_ACCOUNT_ID YOUR_CF_DOMAIN YOUR_DIST_ID
# Example: bash final_deploy.sh 123456789012 abc123.cloudfront.net E1ABCDEFGHIJKL

ACCOUNT_ID=$1
CF_DOMAIN=$2
DIST_ID=$3
REGION="ap-south-1"
BUCKET_NAME="dynamic-price-frontend-${ACCOUNT_ID}"

if [ -z "$ACCOUNT_ID" ] || [ -z "$CF_DOMAIN" ] || [ -z "$DIST_ID" ]; then
  echo "❌ Usage: bash final_deploy.sh YOUR_ACCOUNT_ID YOUR_CF_DOMAIN YOUR_DIST_ID"
  exit 1
fi

CF_URL="https://${CF_DOMAIN}"
API_URL="${CF_URL}/api"

echo "🔄 Final deploy with CloudFront URL..."
echo "  App URL: $CF_URL"
echo "  API URL: $API_URL"
echo ""

# Update API_BASE in all React components to use CloudFront /api path
FILES=(
  "src/DriverPanel.jsx"
  "src/RiderPanel.jsx"
  "src/WeatherCard.jsx"
  "src/TrafficCard.jsx"
  "src/ExplainCard.jsx"
  "src/DriverTipsCard.jsx"
)

echo "🔧 Updating API_BASE to CloudFront URL..."
for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    # Replace any existing API_BASE
    sed -i "s|const API_BASE = \".*\"|const API_BASE = \"${API_URL}\"|g" "$FILE"
    echo "  ✅ $FILE"
  fi
done

echo ""
echo "🏗  Building React app..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed — fix errors and try again"
  exit 1
fi

echo ""
echo "📤 Uploading to S3..."

# HTML — no cache
aws s3 sync build/ "s3://${BUCKET_NAME}/" \
  --exclude "*.js" --exclude "*.css" \
  --exclude "*.png" --exclude "*.ico" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --delete --region "$REGION"

# Assets — long cache
aws s3 sync build/ "s3://${BUCKET_NAME}/" \
  --exclude "*.html" \
  --cache-control "public, max-age=31536000, immutable" \
  --region "$REGION"

echo ""
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id "$DIST_ID" \
  --paths "/*" \
  --query "Invalidation.Status" \
  --output text

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  🌐 Your app is live at:"
echo "  $CF_URL"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Test your live app:"
echo "  curl \"${API_URL}/demand?lat=11.9139&lng=79.8145\""
echo "  curl \"${API_URL}/weather?lat=11.9139&lng=79.8145\""
