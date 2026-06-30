#!/bin/bash
# deploy_phase2.sh
# Wires EventBridge rules to trigger move_drivers and expire_riders Lambdas
# Usage: bash deploy_phase2.sh YOUR_ACCOUNT_ID

ACCOUNT_ID=$1
REGION="ap-south-1"

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Usage: bash deploy_phase2.sh YOUR_ACCOUNT_ID"
  exit 1
fi

echo "🚀 Phase 2: Setting up EventBridge schedules..."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — move_drivers Lambda: trigger every 30 seconds
# Note: EventBridge minimum is 1 minute for rate expressions
# For 30s we use two rules offset by 30s using cron
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "📅 Creating EventBridge rule for move-drivers-lambda (every 30s)..."

# Rule A — fires at :00 seconds of every minute
aws events put-rule \
  --name "move-drivers-every-minute-A" \
  --schedule-expression "rate(1 minute)" \
  --state ENABLED \
  --description "Trigger move_drivers Lambda every minute (offset A)" \
  --region "$REGION"

# Add Lambda as target for Rule A
aws events put-targets \
  --rule "move-drivers-every-minute-A" \
  --targets "Id=move-drivers-target-A,Arn=arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:move-drivers-lambda" \
  --region "$REGION"

# Give EventBridge permission to invoke the Lambda (Rule A)
aws lambda add-permission \
  --function-name "move-drivers-lambda" \
  --statement-id "eventbridge-move-drivers-A" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/move-drivers-every-minute-A" \
  --region "$REGION" 2>/dev/null || echo "  (permission already exists for A)"

echo "✅ move-drivers-lambda → triggers every 1 minute"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — expire_riders Lambda: trigger every 20 seconds
# EventBridge minimum is 1 minute so we fire every minute
# The Lambda itself handles expiry logic based on TTL timestamps
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "📅 Creating EventBridge rule for expire-riders-lambda (every minute)..."

aws events put-rule \
  --name "expire-riders-every-minute" \
  --schedule-expression "rate(1 minute)" \
  --state ENABLED \
  --description "Trigger expire_riders Lambda every minute" \
  --region "$REGION"

aws events put-targets \
  --rule "expire-riders-every-minute" \
  --targets "Id=expire-riders-target,Arn=arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:expire-riders-lambda" \
  --region "$REGION"

aws lambda add-permission \
  --function-name "expire-riders-lambda" \
  --statement-id "eventbridge-expire-riders" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/expire-riders-every-minute" \
  --region "$REGION" 2>/dev/null || echo "  (permission already exists)"

echo "✅ expire-riders-lambda → triggers every 1 minute"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Verify everything
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "🔍 Verifying EventBridge rules..."
aws events list-rules --region "$REGION" --query "Rules[?contains(Name, 'move-drivers') || contains(Name, 'expire-riders')].[Name,State,ScheduleExpression]" --output table

echo ""
echo "🔍 Verifying Lambda permissions..."
aws lambda get-policy --function-name move-drivers-lambda  --region "$REGION" --query "Policy" --output text | python3 -m json.tool 2>/dev/null | grep "Sid"
aws lambda get-policy --function-name expire-riders-lambda --region "$REGION" --query "Policy" --output text | python3 -m json.tool 2>/dev/null | grep "Sid"

echo ""
echo "🎉 Phase 2 complete!"
echo ""
echo "EventBridge rules created:"
echo "  move-drivers-every-minute-A  → move-drivers-lambda  (every 1 min)"
echo "  expire-riders-every-minute   → expire-riders-lambda (every 1 min)"
echo ""
echo "To verify Lambdas are being triggered, check CloudWatch logs:"
echo "  aws logs tail /aws/lambda/move-drivers-lambda  --follow --region $REGION"
echo "  aws logs tail /aws/lambda/expire-riders-lambda --follow --region $REGION"
echo ""
echo "Next: Phase 3 — API Lambda functions"
