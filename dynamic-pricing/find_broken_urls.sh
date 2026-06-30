#!/bin/bash
# find_broken_urls.sh
# Scans all React source files for any CloudFront or localhost API_BASE
# Run this first to see exactly what needs fixing
# Usage: bash find_broken_urls.sh

echo "🔍 Scanning src/ for API_BASE values..."
echo ""

# Find every API_BASE occurrence across all jsx/js files
grep -rn "API_BASE" src/ --include="*.jsx" --include="*.js" 2>/dev/null | while IFS= read -r line; do
  FILE=$(echo "$line" | cut -d: -f1)
  LINENUM=$(echo "$line" | cut -d: -f2)
  CONTENT=$(echo "$line" | cut -d: -f3-)

  if echo "$CONTENT" | grep -q "cloudfront"; then
    echo "  ❌ BROKEN (CloudFront) — $FILE:$LINENUM"
    echo "     $CONTENT"
  elif echo "$CONTENT" | grep -q "localhost"; then
    echo "  ⚠  LOCAL — $FILE:$LINENUM"
    echo "     $CONTENT"
  elif echo "$CONTENT" | grep -q "execute-api"; then
    echo "  ✅ API GW  — $FILE:$LINENUM"
    echo "     $CONTENT"
  else
    echo "  ❓ OTHER   — $FILE:$LINENUM"
    echo "     $CONTENT"
  fi
  echo ""
done

echo ""
echo "Legend:"
echo "  ❌ BROKEN   = points to CloudFront (broken without CF)"
echo "  ⚠  LOCAL    = points to localhost (broken in production)"
echo "  ✅ API GW   = correctly points to API Gateway"
echo "  ❓ OTHER    = unknown, check manually"
echo ""
echo "To fix all broken ones run:"
echo "  bash fix_api_base.sh YOUR_API_GATEWAY_ID"
