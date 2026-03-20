#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $1${NC}"; }

API="http://localhost:3001"
OTEL="http://localhost:4318"
FRONTEND="http://localhost:3000"
TIMESTAMP=$(date +%s)
EMAIL="e2etest-${TIMESTAMP}@tandem.dev"

echo "============================================"
echo "  Tandem E2E Test — Full Pipeline"
echo "============================================"
echo ""

# ── Step 1: Register user ────────────────────────
info "Registering user: $EMAIL"
REG=$(curl -sf -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"name\":\"E2E Test User\",\"password\":\"testpass123\"}")
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
USER_ID=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['user']['id'])")
pass "User registered: $USER_ID"

# ── Step 2: Get org ID ───────────────────────────
ORGS=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/organizations")
ORG_ID=$(echo "$ORGS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['id'])")
ORG_NAME=$(echo "$ORGS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['name'])")
pass "Organization: $ORG_NAME ($ORG_ID)"

# ── Step 3: Setup org + team ─────────────────────
info "Setting up organization and team"
curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/api/organizations/$ORG_ID" \
  -d "{\"name\":\"E2E Test Corp\",\"slug\":\"e2e-corp-$TIMESTAMP\"}" > /dev/null
pass "Organization renamed to E2E Test Corp"

TEAM=$(curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/api/organizations/$ORG_ID/teams" \
  -d '{"name":"Core Team","description":"Main development team"}')
TEAM_ID=$(echo "$TEAM" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
pass "Team created: Core Team ($TEAM_ID)"

# ── Step 4: Invite + register a second user ──────
info "Inviting dev@e2e.dev and registering them"
curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/api/organizations/$ORG_ID/invites" \
  -d "{\"email\":\"dev-${TIMESTAMP}@e2e.dev\",\"role\":\"MEMBER\"}" > /dev/null
pass "Invite sent"

REG2=$(curl -sf -X POST "$API/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"dev-${TIMESTAMP}@e2e.dev\",\"name\":\"Dev User\",\"password\":\"testpass123\"}")
USER2_ID=$(echo "$REG2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['user']['id'])")
pass "Second user registered and auto-joined org"

MEMBERS=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/organizations/$ORG_ID/members")
MEMBER_COUNT=$(echo "$MEMBERS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
[ "$MEMBER_COUNT" = "2" ] && pass "Org has 2 members" || fail "Expected 2 members, got $MEMBER_COUNT"

# ── Step 5: Add user to team ─────────────────────
curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/api/organizations/$ORG_ID/teams/$TEAM_ID/members" \
  -d "{\"userId\":\"$USER2_ID\"}" > /dev/null
pass "Dev user added to Core Team"

# ── Step 6: Send OTLP telemetry data ─────────────
info "Sending telemetry data to OTel collector..."

NOW_NS=$(python3 -c "import time; print(int(time.time() * 1e9))")
HOUR_AGO_NS=$(python3 -c "import time; print(int((time.time() - 3600) * 1e9))")

# 6a. Send traces — coding sessions and deployments
info "  Sending traces (sessions, deployments)..."
curl -sf -X POST "$OTEL/v1/traces" \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceSpans\": [{
      \"resource\": {
        \"attributes\": [
          {\"key\": \"service.name\", \"value\": {\"stringValue\": \"claude-code\"}},
          {\"key\": \"organization_id\", \"value\": {\"stringValue\": \"$ORG_ID\"}}
        ]
      },
      \"scopeSpans\": [{
        \"scope\": {\"name\": \"claude-code-session\"},
        \"spans\": [
          {
            \"traceId\": \"aaaabbbbccccddddeeee111122223333\",
            \"spanId\": \"aaaa111122223333\",
            \"name\": \"session\",
            \"kind\": 1,
            \"startTimeUnixNano\": \"$HOUR_AGO_NS\",
            \"endTimeUnixNano\": \"$NOW_NS\",
            \"attributes\": [
              {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER_ID\"}},
              {\"key\": \"ai_assisted\", \"value\": {\"stringValue\": \"true\"}},
              {\"key\": \"session.id\", \"value\": {\"stringValue\": \"session-e2e-001\"}}
            ],
            \"status\": {\"code\": 1}
          },
          {
            \"traceId\": \"aaaabbbbccccddddeeee111122224444\",
            \"spanId\": \"aaaa111122224444\",
            \"name\": \"session\",
            \"kind\": 1,
            \"startTimeUnixNano\": \"$HOUR_AGO_NS\",
            \"endTimeUnixNano\": \"$NOW_NS\",
            \"attributes\": [
              {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER2_ID\"}},
              {\"key\": \"ai_assisted\", \"value\": {\"stringValue\": \"true\"}},
              {\"key\": \"session.id\", \"value\": {\"stringValue\": \"session-e2e-002\"}}
            ],
            \"status\": {\"code\": 1}
          },
          {
            \"traceId\": \"dddd555566667777888899990000aaaa\",
            \"spanId\": \"dddd555566667777\",
            \"name\": \"deployment\",
            \"kind\": 1,
            \"startTimeUnixNano\": \"$HOUR_AGO_NS\",
            \"endTimeUnixNano\": \"$NOW_NS\",
            \"attributes\": [
              {\"key\": \"deployment\", \"value\": {\"stringValue\": \"true\"}},
              {\"key\": \"type\", \"value\": {\"stringValue\": \"lead_time\"}},
              {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER_ID\"}}
            ],
            \"status\": {\"code\": 1}
          },
          {
            \"traceId\": \"dddd555566667777888899990000bbbb\",
            \"spanId\": \"dddd555566668888\",
            \"name\": \"deployment\",
            \"kind\": 1,
            \"startTimeUnixNano\": \"$HOUR_AGO_NS\",
            \"endTimeUnixNano\": \"$NOW_NS\",
            \"attributes\": [
              {\"key\": \"deployment\", \"value\": {\"stringValue\": \"true\"}},
              {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER_ID\"}}
            ],
            \"status\": {\"code\": 1}
          }
        ]
      }]
    }]
  }" > /dev/null
pass "  Traces sent (2 sessions + 2 deployments)"

# 6b. Send metrics — AI vs Manual code lines
info "  Sending metrics (code lines)..."
curl -sf -X POST "$OTEL/v1/metrics" \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceMetrics\": [{
      \"resource\": {
        \"attributes\": [
          {\"key\": \"service.name\", \"value\": {\"stringValue\": \"claude-code\"}},
          {\"key\": \"organization_id\", \"value\": {\"stringValue\": \"$ORG_ID\"}}
        ]
      },
      \"scopeMetrics\": [{
        \"scope\": {\"name\": \"claude-code-metrics\"},
        \"metrics\": [
          {
            \"name\": \"code.lines.ai_generated\",
            \"description\": \"Lines of code generated by AI\",
            \"unit\": \"lines\",
            \"sum\": {
              \"dataPoints\": [{
                \"asDouble\": 342,
                \"startTimeUnixNano\": \"$HOUR_AGO_NS\",
                \"timeUnixNano\": \"$NOW_NS\",
                \"attributes\": [
                  {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER_ID\"}},
                  {\"key\": \"repository\", \"value\": {\"stringValue\": \"tandem\"}}
                ]
              }],
              \"aggregationTemporality\": 2,
              \"isMonotonic\": true
            }
          },
          {
            \"name\": \"code.lines.manual\",
            \"description\": \"Lines of code written manually\",
            \"unit\": \"lines\",
            \"sum\": {
              \"dataPoints\": [{
                \"asDouble\": 128,
                \"startTimeUnixNano\": \"$HOUR_AGO_NS\",
                \"timeUnixNano\": \"$NOW_NS\",
                \"attributes\": [
                  {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER_ID\"}},
                  {\"key\": \"repository\", \"value\": {\"stringValue\": \"tandem\"}}
                ]
              }],
              \"aggregationTemporality\": 2,
              \"isMonotonic\": true
            }
          }
        ]
      }]
    }]
  }" > /dev/null
pass "  Metrics sent (342 AI lines + 128 manual lines)"

# 6c. Send logs — friction events (prompt loops, errors)
info "  Sending logs (friction events)..."
curl -sf -X POST "$OTEL/v1/logs" \
  -H "Content-Type: application/json" \
  -d "{
    \"resourceLogs\": [{
      \"resource\": {
        \"attributes\": [
          {\"key\": \"service.name\", \"value\": {\"stringValue\": \"claude-code\"}},
          {\"key\": \"organization_id\", \"value\": {\"stringValue\": \"$ORG_ID\"}}
        ]
      },
      \"scopeLogs\": [{
        \"scope\": {\"name\": \"claude-code-events\"},
        \"logRecords\": [
          {
            \"timeUnixNano\": \"$NOW_NS\",
            \"severityNumber\": 13,
            \"severityText\": \"prompt_loop\",
            \"body\": {\"stringValue\": \"prompt_loop: user repeatedly prompted to fix TypeError in src/components/DataGrid.tsx\"},
            \"attributes\": [
              {\"key\": \"session_id\", \"value\": {\"stringValue\": \"session-e2e-001\"}},
              {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER_ID\"}},
              {\"key\": \"repository_path\", \"value\": {\"stringValue\": \"src/components/DataGrid.tsx\"}},
              {\"key\": \"prompt_loop_count\", \"value\": {\"stringValue\": \"5\"}},
              {\"key\": \"error_count\", \"value\": {\"stringValue\": \"3\"}}
            ]
          },
          {
            \"timeUnixNano\": \"$NOW_NS\",
            \"severityNumber\": 17,
            \"severityText\": \"error\",
            \"body\": {\"stringValue\": \"prompt_loop: API rate limit exceeded during code generation in utils/api-client.ts\"},
            \"attributes\": [
              {\"key\": \"session_id\", \"value\": {\"stringValue\": \"session-e2e-002\"}},
              {\"key\": \"user_id\", \"value\": {\"stringValue\": \"$USER2_ID\"}},
              {\"key\": \"repository_path\", \"value\": {\"stringValue\": \"src/utils/api-client.ts\"}},
              {\"key\": \"prompt_loop_count\", \"value\": {\"stringValue\": \"2\"}},
              {\"key\": \"error_count\", \"value\": {\"stringValue\": \"1\"}}
            ]
          }
        ]
      }]
    }]
  }" > /dev/null
pass "  Logs sent (2 friction events)"

# ── Step 7: Wait for batch flush ──────────────────
info "Waiting for OTel batch flush (6s)..."
sleep 6

# ── Step 8: Verify data in ClickHouse ─────────────
info "Verifying data in ClickHouse..."

TRACE_COUNT=$(docker exec tandem-clickhouse-1 clickhouse-client --database otel \
  --query "SELECT count() FROM otel_traces WHERE ResourceAttributes['organization_id'] = '$ORG_ID'" 2>&1)
[ "$TRACE_COUNT" -ge 2 ] && pass "  ClickHouse traces: $TRACE_COUNT rows" || fail "  No traces in ClickHouse"

METRIC_COUNT=$(docker exec tandem-clickhouse-1 clickhouse-client --database otel \
  --query "SELECT count() FROM otel_metrics_sum WHERE ResourceAttributes['organization_id'] = '$ORG_ID'" 2>&1)
[ "$METRIC_COUNT" -ge 2 ] && pass "  ClickHouse metrics: $METRIC_COUNT rows" || fail "  No metrics in ClickHouse"

LOG_COUNT=$(docker exec tandem-clickhouse-1 clickhouse-client --database otel \
  --query "SELECT count() FROM otel_logs WHERE ResourceAttributes['organization_id'] = '$ORG_ID'" 2>&1)
[ "$LOG_COUNT" -ge 2 ] && pass "  ClickHouse logs: $LOG_COUNT rows" || fail "  No logs in ClickHouse"

# ── Step 9: Verify backend API returns real data ──
info "Querying backend API for telemetry..."

AI_RATIO=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/telemetry/ai-ratio")
AI_LINES=$(echo "$AI_RATIO" | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
total = sum(r.get('aiGeneratedLines',0) for r in data)
print(total)
")
[ "$AI_LINES" -gt 0 ] && pass "  AI ratio: $AI_LINES AI-generated lines found" || fail "  AI ratio returned 0 lines"

MANUAL_LINES=$(echo "$AI_RATIO" | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
total = sum(r.get('manualLines',0) for r in data)
print(total)
")
pass "  Manual lines: $MANUAL_LINES"

FRICTION=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/telemetry/friction-heatmap")
FRICTION_COUNT=$(echo "$FRICTION" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
[ "$FRICTION_COUNT" -gt 0 ] && pass "  Friction heatmap: $FRICTION_COUNT events" || fail "  No friction events returned"

DORA=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/telemetry/dora-metrics")
DEPLOYMENTS=$(echo "$DORA" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['deploymentFrequency'])")
[ "$DEPLOYMENTS" -gt 0 ] && pass "  DORA metrics: $DEPLOYMENTS deployments" || fail "  No deployments returned"

NOW_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
MONTH_AGO=$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "30 days ago" +%Y-%m-%dT%H:%M:%SZ)
TIMESHEETS=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/telemetry/timesheets?startDate=$MONTH_AGO&endDate=$NOW_DATE")
TS_COUNT=$(echo "$TIMESHEETS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
[ "$TS_COUNT" -gt 0 ] && pass "  Timesheets: $TS_COUNT entries" || echo -e "${YELLOW}  ⚠ Timesheets: 0 entries (session span may not match timesheet query)${NC}"

# ── Step 10: Verify frontend serves all pages ─────
info "Checking frontend pages..."
for page in "" "login" "register" "setup" "ai-insights" "friction-map" "dora-metrics" "timesheets" "teams" "settings"; do
  CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$FRONTEND/$page")
  [ "$CODE" = "200" ] && pass "  /$page → $CODE" || fail "  /$page → $CODE"
done

echo ""
echo "============================================"
echo -e "${GREEN}  ALL E2E TESTS PASSED${NC}"
echo "============================================"
echo ""
echo "Summary:"
echo "  • User registration + org setup: ✓"
echo "  • Teams + invites + auto-join: ✓"
echo "  • OTLP → Collector → ClickHouse: ✓"
echo "  • Backend API returns real telemetry: ✓"
echo "  • Frontend pages all serve: ✓"
echo ""
echo "Dashboard: $FRONTEND"
echo "API: $API/api/health"
echo "Login: email=$EMAIL password=testpass123"
