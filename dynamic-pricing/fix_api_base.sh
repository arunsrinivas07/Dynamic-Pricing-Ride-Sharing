#!/bin/bash
# fix_api_base.sh
# Replaces broken CloudFront API_BASE with direct API Gateway URL
# Run from your React project root (where src/ folder is)
# Usage: bash fix_api_base.sh YOUR_API_GATEWAY_ID
# Example: bash fix_api_base.sh abc123def

API_GW_ID=$1
REGION="ap-south-1"

if [ -z "$API_GW_ID" ]; then
  echo "❌ Usage: bash fix_api_base.sh YOUR_API_GATEWAY_ID"
  echo ""
  echo "   Find your API Gateway ID:"
  echo "   aws apigatewayv2 get-apis --region ap-south-1 --query 'Items[].{Name:Name,ApiId:ApiId}' --output table"
  exit 1
fi

NEW_URL="https://${API_GW_ID}.execute-api.${REGION}.amazonaws.com/prod"
echo "🔧 Fixing API_BASE in all React files"
echo "   New URL: $NEW_URL"
echo ""

FILES=(
  "src/DriverPanel.jsx"
  "src/RiderPanel.jsx"
  "src/WeatherCard.jsx"
  "src/TrafficCard.jsx"
  "src/ExplainCard.jsx"
  "src/DriverTipsCard.jsx"
  "src/config.js"
)

FIXED=0
NOT_FOUND=0
MANUAL=0

for FILE in "${FILES[@]}"; do
  if [ ! -f "$FILE" ]; then
    echo "  ⚪ $FILE — not found (skipping)"
    ((NOT_FOUND++))
    continue
  fi

  # Show current API_BASE value in this file
  CURRENT=$(grep -o "const API_BASE = ['\"].*['\"]" "$FILE" 2>/dev/null | head -1)

  if [ -z "$CURRENT" ]; then
    echo "  ⚪ $FILE — no API_BASE found (skipping)"
    ((NOT_FOUND++))
    continue
  fi

  echo "  Found: $CURRENT"

  # Try multiple sed patterns to catch all quote/URL variations
  # Pattern 1: double quotes with cloudfront
  sed -i "s|const API_BASE = \"https://.*cloudfront\.net.*\"|const API_BASE = \"${NEW_URL}\"|g" "$FILE"
  # Pattern 2: double quotes with execute-api (already set to some API GW)
  sed -i "s|const API_BASE = \"https://.*execute-api.*\"|const API_BASE = \"${NEW_URL}\"|g" "$FILE"
  # Pattern 3: double quotes with localhost
  sed -i "s|const API_BASE = \"http://localhost:8000\"|const API_BASE = \"${NEW_URL}\"|g" "$FILE"
  # Pattern 4: single quotes any URL
  sed -i "s|const API_BASE = 'https://.*'|const API_BASE = \"${NEW_URL}\"|g" "$FILE"
  sed -i "s|const API_BASE = 'http://localhost:8000'|const API_BASE = \"${NEW_URL}\"|g" "$FILE"

  # Verify replacement worked
  if grep -q "$NEW_URL" "$FILE"; then
    echo "  ✅ $FILE → fixed"
    ((FIXED++))
  else
    echo "  ❌ $FILE — sed did not match, needs manual fix"
    echo "     Open $FILE and replace the API_BASE line with:"
    echo "     const API_BASE = \"${NEW_URL}\";"
    ((MANUAL++))
  fi
  echo ""
done

# Also fix config.js isProd block if it exists
if [ -f "src/config.js" ]; then
  cat > src/config.js << EOF
// Central config — no CloudFront, direct API Gateway
const isProd = process.env.NODE_ENV === "production";

export const API_BASE = isProd
  ? "${NEW_URL}"
  : "http://localhost:8000";

export const TOMTOM_API_KEY = process.env.REACT_APP_TOMTOM_KEY || "AEHc0x6tS68gXO4SXNxJLJvSEYGiInVN";
export const POLL_INTERVAL  = 20_000;
export const RADIUS_KM      = 3;
EOF
  echo "  ✅ src/config.js rewritten"
  echo ""
fi

echo "════════════════════════════════════════════"
echo "  Fixed: $FIXED files"
echo "  Skipped: $NOT_FOUND files (no API_BASE)"
if [ $MANUAL -gt 0 ]; then
  echo "  ⚠  Manual fix needed: $MANUAL files"
fi
echo "════════════════════════════════════════════"
echo ""

if [ $MANUAL -eq 0 ]; then
  echo "✅ All done. Now run:"
  echo ""
  echo "   npm run build"
  echo "   aws s3 sync build/ s3://dynamic-price-frontend-YOUR_ACCOUNT_ID/ --delete --region ap-south-1"
  echo ""
  echo "Then open:"
  echo "   http://dynamic-price-frontend-YOUR_ACCOUNT_ID.s3-website.ap-south-1.amazonaws.com"
else
  echo "⚠  Fix the $MANUAL files manually, then run:"
  echo "   npm run build"
  echo "   aws s3 sync build/ s3://dynamic-price-frontend-YOUR_ACCOUNT_ID/ --delete --region ap-south-1"
fi
