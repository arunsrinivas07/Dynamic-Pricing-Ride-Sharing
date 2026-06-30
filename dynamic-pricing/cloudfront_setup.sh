#!/bin/bash
# cloudfront_setup.sh — Step 11
# Creates CloudFront distribution:
#   /* → S3 frontend bucket
#   /api/* → API Gateway (strips /api prefix)
# Usage: bash cloudfront_setup.sh YOUR_ACCOUNT_ID YOUR_API_GATEWAY_ID
# Example: bash cloudfront_setup.sh 123456789012 abc123def

ACCOUNT_ID=$1
API_GW_ID=$2
REGION="ap-south-1"
BUCKET_NAME="dynamic-price-frontend-${ACCOUNT_ID}"
S3_ORIGIN="${BUCKET_NAME}.s3-website.${REGION}.amazonaws.com"
API_ORIGIN="${API_GW_ID}.execute-api.${REGION}.amazonaws.com"

if [ -z "$ACCOUNT_ID" ] || [ -z "$API_GW_ID" ]; then
  echo "❌ Usage: bash cloudfront_setup.sh YOUR_ACCOUNT_ID YOUR_API_GATEWAY_ID"
  echo "   API Gateway ID is the part before .execute-api in your URL"
  echo "   e.g. for https://abc123def.execute-api.ap-south-1.amazonaws.com/prod"
  echo "        the ID is: abc123def"
  exit 1
fi

echo "☁️  Creating CloudFront distribution..."
echo "  S3 origin:  $S3_ORIGIN"
echo "  API origin: $API_ORIGIN"

# Build CloudFront config JSON
cat > /tmp/cf_config.json << EOF
{
  "CallerReference": "dynamic-price-$(date +%s)",
  "Comment": "Dynamic Pricing App - Frontend + API",
  "DefaultRootObject": "index.html",
  "Enabled": true,
  "PriceClass": "PriceClass_All",
  "HttpVersion": "http2",
  "Origins": {
    "Quantity": 2,
    "Items": [
      {
        "Id": "S3-frontend",
        "DomainName": "${S3_ORIGIN}",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      },
      {
        "Id": "API-Gateway",
        "DomainName": "${API_ORIGIN}",
        "OriginPath": "/prod",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only",
          "OriginSslProtocols": {
            "Quantity": 1,
            "Items": ["TLSv1.2"]
          }
        }
      }
    ]
  },
  "CacheBehaviors": {
    "Quantity": 1,
    "Items": [
      {
        "PathPattern": "/api/*",
        "TargetOriginId": "API-Gateway",
        "ViewerProtocolPolicy": "https-only",
        "AllowedMethods": {
          "Quantity": 7,
          "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
          "CachedMethods": {
            "Quantity": 2,
            "Items": ["GET","HEAD"]
          }
        },
        "ForwardedValues": {
          "QueryString": true,
          "Cookies": {"Forward": "none"},
          "Headers": {
            "Quantity": 2,
            "Items": ["Content-Type","Authorization"]
          }
        },
        "DefaultTTL": 0,
        "MinTTL": 0,
        "MaxTTL": 0,
        "Compress": true
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-frontend",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET","HEAD"]
    },
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": {"Forward": "none"}
    },
    "DefaultTTL": 86400,
    "MinTTL": 0,
    "MaxTTL": 31536000,
    "Compress": true
  },
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 0
      }
    ]
  }
}
EOF

# Create the distribution
DISTRIBUTION=$(aws cloudfront create-distribution \
  --distribution-config file:///tmp/cf_config.json \
  --query "Distribution.[Id,DomainName,Status]" \
  --output json)

DIST_ID=$(echo "$DISTRIBUTION" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0])")
CF_DOMAIN=$(echo "$DISTRIBUTION" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[1])")
CF_STATUS=$(echo "$DISTRIBUTION" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[2])")

rm /tmp/cf_config.json

echo ""
echo "🎉 CloudFront distribution created!"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  CloudFront Domain:  https://${CF_DOMAIN}"
echo "  Distribution ID:    ${DIST_ID}"
echo "  Status:             ${CF_STATUS} (takes 5-15 min to deploy)"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Route mapping:"
echo "  https://${CF_DOMAIN}/*       → S3 frontend (React app)"
echo "  https://${CF_DOMAIN}/api/*   → API Gateway (FastAPI endpoints)"
echo ""
echo "⏳ Wait for status to become 'Deployed' before testing:"
echo "  aws cloudfront get-distribution --id ${DIST_ID} --query 'Distribution.Status' --output text"
echo ""
echo "Once deployed, update API_BASE in React to use /api prefix:"
echo "  const API_BASE = \"https://${CF_DOMAIN}/api\""
echo ""
echo "Then rebuild and re-upload:"
echo "  npm run build"
echo "  aws s3 sync build/ s3://${BUCKET_NAME}/ --delete"
echo "  aws cloudfront create-invalidation --distribution-id ${DIST_ID} --paths '/*'"
