#!/bin/bash
# pre_build.sh — Step 9
# Updates API_BASE in all React components to point to API Gateway
# Run this BEFORE npm run build
# Usage: bash pre_build.sh YOUR_API_GATEWAY_URL
# Example: bash pre_build.sh https://abc123.execute-api.ap-south-1.amazonaws.com/prod

API_URL=$1

if [ -z "$API_URL" ]; then
  echo "❌ Usage: bash pre_build.sh YOUR_API_GATEWAY_URL"
  exit 1
fi

echo "🔧 Updating API_BASE in React components to:"
echo "   $API_URL"
echo ""

# Files that contain API_BASE
FILES=(
  "src/DriverPanel.jsx"
  "src/RiderPanel.jsx"
  "src/WeatherCard.jsx"
  "src/TrafficCard.jsx"
  "src/ExplainCard.jsx"
  "src/DriverTipsCard.jsx"
)

for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    # Replace any existing API_BASE value with the new URL
    sed -i "s|const API_BASE.*=.*\"http://localhost:8000\"|const API_BASE = \"${API_URL}\"|g" "$FILE"
    sed -i "s|const API_BASE.*=.*'http://localhost:8000'|const API_BASE = \"${API_URL}\"|g" "$FILE"
    echo "  ✅ Updated $FILE"
  else
    echo "  ⚠  $FILE not found — update manually"
  fi
done

echo ""
echo "✅ All API_BASE values updated"
echo ""
echo "Now run: npm run build"
