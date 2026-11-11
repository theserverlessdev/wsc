#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Writing Style Checker — Full Manual Test Suite
# Run from the project root: ./scripts/test-all.sh
# Requires: npm, node, curl, python3
# ============================================================================

PASS=0
FAIL=0
SKIP=0
PORT=5199  # Use a non-standard port to avoid conflicts
DEV_PID=""
BASE="http://localhost:$PORT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

cleanup() {
  if [ -n "$DEV_PID" ]; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
  fi
  rm -f /tmp/wsc-test-*.txt /tmp/wsc-test-*.json
  rm -rf /tmp/wsc-test-dir-*
}
trap cleanup EXIT

# ── Helpers ──

section() {
  echo ""
  echo -e "${BOLD}${CYAN}=== $1 ===${NC}"
}

check() {
  local desc="$1"
  local result="$2"
  if [ "$result" = "true" ]; then
    echo -e "  ${GREEN}PASS${NC}  $desc"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}  $desc"
    FAIL=$((FAIL + 1))
  fi
}

skip() {
  local desc="$1"
  echo -e "  ${YELLOW}SKIP${NC}  $desc"
  SKIP=$((SKIP + 1))
}

json_field() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null
}

wait_for_server() {
  local max_attempts=30
  local attempt=0
  while [ $attempt -lt $max_attempts ]; do
    if curl -s -o /dev/null -w "" "$BASE" 2>/dev/null; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  echo -e "${RED}Server failed to start after ${max_attempts}s${NC}"
  return 1
}

# ============================================================================
section "1. Prerequisites & Build"
# ============================================================================

echo "  Installing dependencies..."
npm ci --silent 2>&1 | tail -1
check "npm ci succeeds" "true"

echo "  Type checking..."
if npm run check >/dev/null 2>&1; then
  check "npm run check — 0 errors" "true"
else
  check "npm run check — 0 errors" "false"
fi

echo "  Running tests..."
TEST_OUT=$(npx vitest run 2>&1)
TEST_PASS=$(echo "$TEST_OUT" | grep "Tests " | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')
TEST_FILES=$(echo "$TEST_OUT" | grep "Test Files" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')
check "All tests pass ($TEST_PASS tests, $TEST_FILES files)" "$(echo "$TEST_OUT" | grep -q "failed" && echo false || echo true)"

echo "  Building..."
BUILD_OUT=$(npm run build 2>&1)
check "npm run build succeeds" "$(echo "$BUILD_OUT" | grep -q "done" && echo true || echo false)"

# ============================================================================
section "2. MCP Server Build"
# ============================================================================

echo "  Installing mcp-server deps..."
(cd mcp-server && npm ci --silent 2>&1 | tail -1)
echo "  Building mcp-server..."
(cd mcp-server && npm run build 2>&1 >/dev/null)
check "mcp-server builds" "$([ -f mcp-server/dist/mcp-server/index.js ] && echo true || echo false)"

echo "  Smoke test mcp-server..."
MCP_SMOKE=$(timeout 2 node mcp-server/dist/mcp-server/index.js < /dev/null 2>&1 || true)
check "mcp-server starts without crash" "$(echo "$MCP_SMOKE" | grep -qv "Error\|FATAL\|Cannot find" && echo true || echo false)"

# ============================================================================
section "3. CLI Build"
# ============================================================================

echo "  Installing cli deps..."
(cd cli && npm install --silent 2>&1 | tail -1)
echo "  Building cli..."
(cd cli && npm run build 2>&1 >/dev/null)
check "cli builds" "$([ -f cli/dist/cli/index.js ] && echo true || echo false)"

CLI="node cli/dist/cli/index.js"

echo "  CLI stdin check..."
CLI_OUT=$(echo "The code was written very quickly." | $CLI check --stdin 2>&1)
check "cli check --stdin detects issues" "$(echo "$CLI_OUT" | grep -q "weasel-word\|passive-voice" && echo true || echo false)"

echo "  CLI clean text..."
CLI_CLEAN=$(echo "The team wrote good code." | $CLI check --stdin 2>&1)
check "cli reports no issues for clean text" "$(echo "$CLI_CLEAN" | grep -q "No issues" && echo true || echo false)"

echo "  CLI JSON format..."
CLI_JSON=$(echo "This is very good." | $CLI check --stdin --format json 2>&1)
check "cli --format json contains valid JSON array" "$(echo "$CLI_JSON" | python3 -c 'import sys,json; lines=sys.stdin.read(); json.loads(lines[:lines.rindex("]")+1]); print("true")' 2>/dev/null || echo false)"

echo "  CLI GitHub format..."
CLI_GH=$(echo "This is very good." | $CLI check --stdin --format github 2>&1)
check "cli --format github produces ::warning" "$(echo "$CLI_GH" | grep -q "::warning" && echo true || echo false)"

echo "  CLI list detectors..."
CLI_LIST=$($CLI list 2>&1)
check "cli list shows detectors" "$(echo "$CLI_LIST" | grep -q "weaselWords" && echo true || echo false)"

echo "  CLI list weaselWords..."
CLI_WW=$($CLI list weaselWords 2>&1)
check "cli list weaselWords shows words" "$(echo "$CLI_WW" | grep -q "very" && echo true || echo false)"

echo "  CLI list nominalizations..."
CLI_NOM=$($CLI list nominalizations 2>&1)
check "cli list nominalizations shows word + suggestion" "$(echo "$CLI_NOM" | grep -q "use" && echo true || echo false)"

echo "  CLI init..."
INIT_DIR=$(mktemp -d /tmp/wsc-test-dir-XXXXXX)
PROJECT_ROOT="$(pwd)"
(cd "$INIT_DIR" && node "$PROJECT_ROOT/cli/dist/cli/index.js" init 2>&1 >/dev/null)
check "cli init creates .wscrc.json" "$([ -f "$INIT_DIR/.wscrc.json" ] && echo true || echo false)"
check "cli init includes \$schema" "$(grep -q 'schema' "$INIT_DIR/.wscrc.json" 2>/dev/null && echo true || echo false)"
rm -rf "$INIT_DIR"

echo "  CLI with config..."
echo '{"detectors":{"weaselWords":{"enabled":false}}}' > /tmp/wsc-test-cfg.json
CLI_CFG=$(echo "This is very good." | $CLI check --stdin --config /tmp/wsc-test-cfg.json 2>&1)
check "cli --config disables detector" "$(echo "$CLI_CFG" | grep -q "No issues" && echo true || echo false)"
rm -f /tmp/wsc-test-cfg.json

# ============================================================================
section "4. Dev Server — Starting"
# ============================================================================

echo "  Starting dev server on port $PORT..."
npm run dev -- --port $PORT > /tmp/wsc-test-server.log 2>&1 &
DEV_PID=$!

if wait_for_server; then
  check "dev server starts" "true"
else
  check "dev server starts" "false"
  echo -e "${RED}Cannot continue without dev server. Aborting API/MCP tests.${NC}"
  # Jump to summary
  DEV_PID=""
  section "SUMMARY"
  echo ""
  echo -e "  ${GREEN}Passed: $PASS${NC}"
  echo -e "  ${RED}Failed: $FAIL${NC}"
  echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
  echo ""
  exit 1
fi

# ============================================================================
section "5. HTTP API"
# ============================================================================

echo "  POST /api/check — all 8 detectors..."
API_OUT=$(curl -s -X POST "$BASE/api/check" \
  -H "Content-Type: application/json" \
  -d '{"text":"The utilization was written very quickly. I think it is totally fine. The the code."}')

API_TOTAL=$(echo "$API_OUT" | json_field "d['summary']['total']")
API_WW=$(echo "$API_OUT" | json_field "d['summary']['weaselWords']")
API_PV=$(echo "$API_OUT" | json_field "d['summary']['passiveVoice']")
API_DW=$(echo "$API_OUT" | json_field "d['summary']['duplicateWords']")
API_NOM=$(echo "$API_OUT" | json_field "d['summary']['nominalizations']")
API_HED=$(echo "$API_OUT" | json_field "d['summary']['hedging']")
API_ADV=$(echo "$API_OUT" | json_field "d['summary']['adverbs']")
API_META=$(echo "$API_OUT" | json_field "str('characterCount' in d['meta']).lower()")
API_TIME=$(echo "$API_OUT" | json_field "str('processingTimeMs' in d['meta']).lower()")
API_SENT=$(echo "$API_OUT" | json_field "str('sentenceCount' in d['meta']).lower()")

check "API returns valid JSON" "$([ -n "$API_TOTAL" ] && echo true || echo false)"
check "API summary.total > 0" "$([ "$API_TOTAL" -gt 0 ] 2>/dev/null && echo true || echo false)"
check "API detects weasel words" "$([ "$API_WW" -gt 0 ] 2>/dev/null && echo true || echo false)"
check "API detects passive voice" "$([ "$API_PV" -gt 0 ] 2>/dev/null && echo true || echo false)"
check "API detects duplicate words" "$([ "$API_DW" -gt 0 ] 2>/dev/null && echo true || echo false)"
check "API detects nominalizations" "$([ "$API_NOM" -gt 0 ] 2>/dev/null && echo true || echo false)"
check "API detects hedging" "$([ "$API_HED" -gt 0 ] 2>/dev/null && echo true || echo false)"
check "API detects adverbs" "$([ "$API_ADV" -gt 0 ] 2>/dev/null && echo true || echo false)"
check "API meta has characterCount" "$API_META"
check "API meta has processingTimeMs" "$API_TIME"
check "API meta has sentenceCount" "$API_SENT"

echo "  POST /api/check — all 8 issue arrays present..."
API_KEYS=$(echo "$API_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sorted(d['issues'].keys()))" 2>/dev/null)
check "API issues has all 8 keys" "$(echo "$API_KEYS" | grep -q "adverbs.*aiTells.*duplicateWords.*hedging.*longSentences.*nominalizations.*passiveVoice.*weaselWords" && echo true || echo false)"

echo "  POST /api/check — with config..."
API_CFG=$(curl -s -X POST "$BASE/api/check" \
  -H "Content-Type: application/json" \
  -d '{"text":"This is very good.","config":{"detectors":{"weaselWords":{"enabled":false}}}}')
API_CFG_WW=$(echo "$API_CFG" | json_field "len(d['issues']['weaselWords'])")
check "API config disables weasel words" "$([ "$API_CFG_WW" = "0" ] && echo true || echo false)"

echo "  POST /api/check — invalid config..."
API_BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/check" \
  -H "Content-Type: application/json" \
  -d '{"text":"hi","config":{"unknown":true}}')
check "API returns 400 for invalid config" "$([ "$API_BAD" = "400" ] && echo true || echo false)"

echo "  POST /api/check — missing text..."
API_NOTEXT=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/check" \
  -H "Content-Type: application/json" \
  -d '{}')
check "API returns 400 for missing text" "$([ "$API_NOTEXT" = "400" ] && echo true || echo false)"

echo "  POST /api/check — invalid JSON..."
API_BADJSON=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/check" \
  -H "Content-Type: application/json" \
  -d 'not json')
check "API returns 400 for invalid JSON" "$([ "$API_BADJSON" = "400" ] && echo true || echo false)"

echo "  POST /api/check — clean text..."
API_CLEAN=$(curl -s -X POST "$BASE/api/check" \
  -H "Content-Type: application/json" \
  -d '{"text":"The team wrote good code."}')
API_CLEAN_TOTAL=$(echo "$API_CLEAN" | json_field "d['summary']['total']")
check "API returns 0 issues for clean text" "$([ "$API_CLEAN_TOTAL" = "0" ] && echo true || echo false)"

echo "  POST /api/check — CORS headers..."
API_CORS=$(curl -s -D- -o /dev/null --max-time 5 -X POST "$BASE/api/check" \
  -H "Content-Type: application/json" \
  -d '{"text":"hello"}' 2>&1)
check "API has Access-Control-Allow-Origin" "$(echo "$API_CORS" | grep -qi "access-control-allow-origin" && echo true || echo false)"

echo "  OPTIONS /api/check..."
API_OPT=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X OPTIONS "$BASE/api/check")
check "API OPTIONS returns 200 or 204" "$([ "$API_OPT" = "200" ] || [ "$API_OPT" = "204" ] && echo true || echo false)"

echo "  GET /api/check — docs..."
API_DOCS=$(curl -s "$BASE/api/check")
API_DOCS_DET=$(echo "$API_DOCS" | json_field "len(d['detectors'])")
check "GET /api/check lists 8 detectors" "$([ "$API_DOCS_DET" = "8" ] && echo true || echo false)"

echo "  GET /api/detectors..."
API_DET=$(curl -s "$BASE/api/detectors")
API_DET_COUNT=$(echo "$API_DET" | json_field "len(d['detectors'])")
check "GET /api/detectors returns 8 detectors" "$([ "$API_DET_COUNT" = "8" ] && echo true || echo false)"

echo "  GET /health..."
HEALTH=$(curl -s "$BASE/health")
HEALTH_STATUS=$(echo "$HEALTH" | json_field "d['status']")
check "GET /health returns healthy" "$([ "$HEALTH_STATUS" = "healthy" ] && echo true || echo false)"

# ============================================================================
section "6. Remote MCP"
# ============================================================================

echo "  GET /mcp — info..."
MCP_INFO=$(curl -s "$BASE/mcp")
MCP_TOOLS=$(echo "$MCP_INFO" | json_field "len(d['tools'])")
check "GET /mcp lists 3 tools" "$([ "$MCP_TOOLS" = "3" ] && echo true || echo false)"
check "GET /mcp description mentions detectors" "$(echo "$MCP_INFO" | grep -q "adverbs" && echo true || echo false)"

echo "  initialize..."
MCP_INIT=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}')
MCP_PROTO=$(echo "$MCP_INIT" | json_field "d['result']['protocolVersion']")
check "MCP initialize returns protocolVersion" "$([ -n "$MCP_PROTO" ] && echo true || echo false)"

echo "  tools/list..."
MCP_LIST=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
MCP_TOOL_COUNT=$(echo "$MCP_LIST" | json_field "len(d['result']['tools'])")
MCP_HAS_LWL=$(echo "$MCP_LIST" | json_field "str('list_word_lists' in [t['name'] for t in d['result']['tools']]).lower()")
check "MCP tools/list returns 3 tools" "$([ "$MCP_TOOL_COUNT" = "3" ] && echo true || echo false)"
check "MCP has list_word_lists tool" "$MCP_HAS_LWL"

echo "  check_text — all detectors..."
MCP_CHECK=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_text","arguments":{"text":"The utilization was written very quickly. I think it is totally fine."}}}')
MCP_TEXT=$(echo "$MCP_CHECK" | json_field "d['result']['content'][0]['text']")
check "MCP check_text has WEASEL WORDS" "$(echo "$MCP_TEXT" | grep -q "WEASEL WORDS" && echo true || echo false)"
check "MCP check_text has PASSIVE VOICE" "$(echo "$MCP_TEXT" | grep -q "PASSIVE VOICE" && echo true || echo false)"
check "MCP check_text has NOMINALIZATIONS" "$(echo "$MCP_TEXT" | grep -q "NOMINALIZATIONS" && echo true || echo false)"
check "MCP check_text has HEDGING" "$(echo "$MCP_TEXT" | grep -q "HEDGING" && echo true || echo false)"
check "MCP check_text has FILLER ADVERBS" "$(echo "$MCP_TEXT" | grep -q "FILLER ADVERBS" && echo true || echo false)"

echo "  check_text — with config..."
MCP_CFG=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"check_text","arguments":{"text":"This is very good.","config":{"detectors":{"weaselWords":{"enabled":false}}}}}}')
MCP_CFG_TEXT=$(echo "$MCP_CFG" | json_field "d['result']['content'][0]['text']")
check "MCP config disables weasel words" "$(echo "$MCP_CFG_TEXT" | grep -qv "WEASEL WORDS" && echo true || echo false)"

echo "  fix_duplicates..."
MCP_FIX=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"fix_duplicates","arguments":{"text":"The the code is is good."}}}')
MCP_FIX_TEXT=$(echo "$MCP_FIX" | json_field "d['result']['content'][0]['text']")
check "MCP fix_duplicates removes duplicates" "$(echo "$MCP_FIX_TEXT" | grep -q "Removed" && echo true || echo false)"

echo "  list_word_lists..."
MCP_LWLS=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"list_word_lists","arguments":{}}}')
MCP_LWLS_TEXT=$(echo "$MCP_LWLS" | json_field "d['result']['content'][0]['text']")
check "MCP list_word_lists returns info" "$(echo "$MCP_LWLS_TEXT" | grep -q "Detector" && echo true || echo false)"

echo "  unknown method..."
MCP_UNK=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":8,"method":"nonexistent"}')
MCP_UNK_CODE=$(echo "$MCP_UNK" | json_field "d['error']['code']")
check "MCP unknown method returns -32601" "$([ "$MCP_UNK_CODE" = "-32601" ] && echo true || echo false)"

echo "  parse error..."
MCP_PARSE=$(curl -s -X POST "$BASE/mcp" \
  -H "Content-Type: application/json" \
  -d 'broken{json')
MCP_PARSE_CODE=$(echo "$MCP_PARSE" | json_field "d['error']['code']")
check "MCP parse error returns -32700" "$([ "$MCP_PARSE_CODE" = "-32700" ] && echo true || echo false)"

echo "  OPTIONS /mcp..."
MCP_OPT_CORS=$(curl -s -D- -o /dev/null --max-time 5 -X OPTIONS "$BASE/mcp" 2>&1)
check "MCP OPTIONS has CORS headers" "$(echo "$MCP_OPT_CORS" | grep -qi "access-control" && echo true || echo false)"

# ============================================================================
section "7. Frontend"
# ============================================================================

echo "  Checking frontend loads..."
FE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE")
check "Frontend returns 200" "$([ "$FE_STATUS" = "200" ] && echo true || echo false)"

FE_HTML=$(curl -s "$BASE")
check "Frontend HTML contains 'Writing Style Checker'" "$(echo "$FE_HTML" | grep -q "Writing Style Checker" && echo true || echo false)"

# ============================================================================
section "8. File Existence"
# ============================================================================

FILES=(
  "src/core/config.ts"
  "src/core/config-node.ts"
  "src/core/analyzer.ts"
  "src/core/detector.ts"
  "src/core/words.ts"
  "src/core/index.ts"
  "src/mcp/handler.ts"
  "src/routes/api/check/+server.ts"
  "src/routes/api/detectors/+server.ts"
  "src/routes/mcp/+server.ts"
  "src/routes/health/+server.ts"
  "static/schema.json"
  "cli/index.ts"
  "cli/cli.ts"
  "cli/formatter.ts"
  "cli/package.json"
  "cli/tsconfig.json"
  "action/action.yml"
  "action/README.md"
  "cli/README.md"
  "mcp-server/README.md"
  ".github/workflows/ci.yml"
  ".github/workflows/health.yml"
  "TESTING.md"
  "CONTRIBUTING.md"
  "RELEASE-AND-DEPLOYMENT.md"
  "CLAUDE.md"
)

for f in "${FILES[@]}"; do
  check "exists: $f" "$([ -f "$f" ] && echo true || echo false)"
done

check "MANUAL-TESTING-INSTRUCTIONS.md removed" "$([ ! -f "MANUAL-TESTING-INSTRUCTIONS.md" ] && echo true || echo false)"

# ============================================================================
section "SUMMARY"
# ============================================================================

TOTAL=$((PASS + FAIL + SKIP))
echo ""
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Skipped: $SKIP${NC}"
echo -e "  Total:  $TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}${BOLD}Some checks failed.${NC}"
  exit 1
else
  echo -e "${GREEN}${BOLD}All checks passed!${NC}"
  exit 0
fi
