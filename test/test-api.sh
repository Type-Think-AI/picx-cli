#!/bin/bash
# PicX API Test Suite
# Tests all API endpoints against localhost
# Usage: ./test/test-api.sh
# Results saved to: test/results/

API_URL="${PICX_API_URL:-http://localhost:8000}"
API_KEY="${PICX_API_KEY:-pxsk_e838e94a45bb46abad32afbcd202e53b}"
RESULTS_DIR="$(dirname "$0")/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="$RESULTS_DIR/test_run_$TIMESTAMP.txt"

# Counters
PASSED=0
FAILED=0
TOTAL=0

mkdir -p "$RESULTS_DIR"

# Helper: run a test case
run_test() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  local expect_status="$5"

  TOTAL=$((TOTAL + 1))

  echo "-------------------------------------------" | tee -a "$RESULT_FILE"
  echo "TEST $TOTAL: $name" | tee -a "$RESULT_FILE"
  echo "  $method $API_URL$endpoint" | tee -a "$RESULT_FILE"

  if [ "$method" = "GET" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      -H "Authorization: Bearer $API_KEY" \
      "$API_URL$endpoint" 2>&1)
  elif [ "$method" = "GET_PUBLIC" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      "$API_URL$endpoint" 2>&1)
  elif [ "$method" = "POST" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST \
      -H "Authorization: Bearer $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$API_URL$endpoint" 2>&1)
  elif [ "$method" = "DELETE" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X DELETE \
      -H "Authorization: Bearer $API_KEY" \
      "$API_URL$endpoint" 2>&1)
  elif [ "$method" = "POST_NO_AUTH" ]; then
    RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$API_URL$endpoint" 2>&1)
  fi

  # Split response body and status code
  HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  echo "  Status: $HTTP_STATUS (expected: $expect_status)" | tee -a "$RESULT_FILE"

  # Pretty print JSON body (truncate if too long)
  BODY_PREVIEW=$(echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY")
  if [ ${#BODY_PREVIEW} -gt 500 ]; then
    BODY_PREVIEW="${BODY_PREVIEW:0:500}..."
  fi
  echo "  Response:" | tee -a "$RESULT_FILE"
  echo "$BODY_PREVIEW" | sed 's/^/    /' | tee -a "$RESULT_FILE"

  if [ "$HTTP_STATUS" = "$expect_status" ]; then
    echo "  RESULT: PASS" | tee -a "$RESULT_FILE"
    PASSED=$((PASSED + 1))
  else
    echo "  RESULT: FAIL" | tee -a "$RESULT_FILE"
    FAILED=$((FAILED + 1))
  fi
  echo "" | tee -a "$RESULT_FILE"
}

# ============================================================
echo "==========================================" | tee "$RESULT_FILE"
echo "PicX API Test Run - $(date)" | tee -a "$RESULT_FILE"
echo "API URL: $API_URL" | tee -a "$RESULT_FILE"
echo "API Key: ${API_KEY:0:10}...${API_KEY: -4}" | tee -a "$RESULT_FILE"
echo "==========================================" | tee -a "$RESULT_FILE"
echo "" | tee -a "$RESULT_FILE"

# --- 1. Models endpoint (public, no auth) ---
run_test "GET /v1/models (public, no auth)" \
  "GET_PUBLIC" "/v1/models" "" "200"

# --- 2. Models endpoint (with auth) ---
run_test "GET /v1/models (with auth)" \
  "GET" "/v1/models" "" "200"

# --- 3. Generate image (basic prompt) ---
run_test "POST /v1/images/generate (basic)" \
  "POST" "/v1/images/generate" \
  '{"prompt": "a simple red circle on white background"}' \
  "200"

# --- 4. Generate image (with all options) ---
run_test "POST /v1/images/generate (with model, size, aspect_ratio)" \
  "POST" "/v1/images/generate" \
  '{"prompt": "a blue square on black background", "model": "gemini-3.1-flash-image-preview", "size": "1K", "aspect_ratio": "16:9"}' \
  "200"

# --- 5. Generate image (no auth - should fail 401) ---
run_test "POST /v1/images/generate (no auth - expect 401)" \
  "POST_NO_AUTH" "/v1/images/generate" \
  '{"prompt": "test no auth"}' \
  "401"

# --- 6. Generate image (empty prompt - should fail 422) ---
run_test "POST /v1/images/generate (empty prompt - expect 422)" \
  "POST" "/v1/images/generate" \
  '{"prompt": ""}' \
  "422"

# --- 7. Generate image (invalid model - expect 400) ---
run_test "POST /v1/images/generate (invalid model - expect 400)" \
  "POST" "/v1/images/generate" \
  '{"prompt": "test", "model": "fake-model-xyz"}' \
  "400"

# --- 8. Edit image (basic) ---
run_test "POST /v1/images/edit (basic)" \
  "POST" "/v1/images/edit" \
  '{"instruction": "make the background blue", "image_urls": ["https://picsum.photos/id/237/200/300"]}' \
  "200"

# --- 9. Edit image (no auth - expect 401) ---
run_test "POST /v1/images/edit (no auth - expect 401)" \
  "POST_NO_AUTH" "/v1/images/edit" \
  '{"instruction": "make it blue", "image_urls": ["https://picsum.photos/200"]}' \
  "401"

# --- 10. Account usage ---
run_test "GET /v1/account/usage (default period)" \
  "GET" "/v1/account/usage" "" "200"

# --- 11. Account usage (custom period) ---
run_test "GET /v1/account/usage?period=7d" \
  "GET" "/v1/account/usage?period=7d" "" "200"

# --- 12. Account usage (no auth - expect 401) ---
run_test "GET /v1/account/usage (no auth - expect 401)" \
  "GET_PUBLIC" "/v1/account/usage" "" "401"

# --- 13. API key management - get current key ---
run_test "GET /user/api-key (get masked key)" \
  "GET" "/user/api-key" "" "200"

# ============================================================
# Special test: bad API key
echo "-------------------------------------------" | tee -a "$RESULT_FILE"
echo "TEST $((TOTAL + 1)): POST /v1/images/generate (invalid key - expect 401)" | tee -a "$RESULT_FILE"
TOTAL=$((TOTAL + 1))
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer pxsk_invalidkey000000000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test"}' \
  "$API_URL/v1/images/generate" 2>&1)
HTTP_STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')
echo "  Status: $HTTP_STATUS (expected: 401)" | tee -a "$RESULT_FILE"
BODY_PREVIEW=$(echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY")
echo "  Response:" | tee -a "$RESULT_FILE"
echo "$BODY_PREVIEW" | sed 's/^/    /' | tee -a "$RESULT_FILE"
if [ "$HTTP_STATUS" = "401" ]; then
  echo "  RESULT: PASS" | tee -a "$RESULT_FILE"
  PASSED=$((PASSED + 1))
else
  echo "  RESULT: FAIL" | tee -a "$RESULT_FILE"
  FAILED=$((FAILED + 1))
fi
echo "" | tee -a "$RESULT_FILE"

# ============================================================
# Summary
echo "==========================================" | tee -a "$RESULT_FILE"
echo "SUMMARY" | tee -a "$RESULT_FILE"
echo "  Total:  $TOTAL" | tee -a "$RESULT_FILE"
echo "  Passed: $PASSED" | tee -a "$RESULT_FILE"
echo "  Failed: $FAILED" | tee -a "$RESULT_FILE"
if [ $FAILED -eq 0 ]; then
  echo "  ALL TESTS PASSED" | tee -a "$RESULT_FILE"
else
  echo "  SOME TESTS FAILED" | tee -a "$RESULT_FILE"
fi
echo "==========================================" | tee -a "$RESULT_FILE"
echo ""
echo "Results saved to: $RESULT_FILE"
