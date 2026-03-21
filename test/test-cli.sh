#!/bin/bash
# PicX CLI Test Suite
# Tests all CLI commands against localhost
# Usage: PICX_API_KEY=pxsk_... ./test/test-cli.sh
# Results saved to: test/results/

export PICX_API_URL="${PICX_API_URL:-http://localhost:8000}"
export PICX_API_KEY="${PICX_API_KEY:-pxsk_e838e94a45bb46abad32afbcd202e53b}"
CLI_BIN="$(dirname "$0")/../bin/picx.js"
RESULTS_DIR="$(dirname "$0")/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="$RESULTS_DIR/cli_test_run_$TIMESTAMP.txt"

PASSED=0
FAILED=0
TOTAL=0

mkdir -p "$RESULTS_DIR"

# Helper: run a CLI test
run_test() {
  local name="$1"
  local cmd="$2"
  local expect_success="$3" # "true" or "false"

  TOTAL=$((TOTAL + 1))

  echo "-------------------------------------------" | tee -a "$RESULT_FILE"
  echo "TEST $TOTAL: $name" | tee -a "$RESULT_FILE"
  echo "  Command: node $CLI_BIN $cmd" | tee -a "$RESULT_FILE"

  OUTPUT=$(node "$CLI_BIN" $cmd 2>&1)
  EXIT_CODE=$?

  # Truncate long output
  if [ ${#OUTPUT} -gt 600 ]; then
    OUTPUT_PREVIEW="${OUTPUT:0:600}..."
  else
    OUTPUT_PREVIEW="$OUTPUT"
  fi

  echo "  Exit code: $EXIT_CODE" | tee -a "$RESULT_FILE"
  echo "  Output:" | tee -a "$RESULT_FILE"
  echo "$OUTPUT_PREVIEW" | sed 's/^/    /' | tee -a "$RESULT_FILE"

  if [ "$expect_success" = "true" ] && [ $EXIT_CODE -eq 0 ]; then
    echo "  RESULT: PASS" | tee -a "$RESULT_FILE"
    PASSED=$((PASSED + 1))
  elif [ "$expect_success" = "false" ] && [ $EXIT_CODE -ne 0 ]; then
    echo "  RESULT: PASS (expected failure)" | tee -a "$RESULT_FILE"
    PASSED=$((PASSED + 1))
  else
    echo "  RESULT: FAIL" | tee -a "$RESULT_FILE"
    FAILED=$((FAILED + 1))
  fi
  echo "" | tee -a "$RESULT_FILE"
}

# ============================================================
echo "==========================================" | tee "$RESULT_FILE"
echo "PicX CLI Test Run - $(date)" | tee -a "$RESULT_FILE"
echo "API URL: $PICX_API_URL" | tee -a "$RESULT_FILE"
echo "API Key: ${PICX_API_KEY:0:10}...${PICX_API_KEY: -4}" | tee -a "$RESULT_FILE"
echo "CLI: $CLI_BIN" | tee -a "$RESULT_FILE"
echo "==========================================" | tee -a "$RESULT_FILE"
echo "" | tee -a "$RESULT_FILE"

# --- 1. picx --version ---
run_test "picx --version" \
  "--version" "true"

# --- 2. picx --help ---
run_test "picx --help" \
  "--help" "true"

# --- 3. picx models ---
run_test "picx models (list available models)" \
  "models" "true"

# --- 4. picx auth (show key status) ---
run_test "picx auth (show API key status)" \
  "auth" "true"

# --- 5. picx generate (basic prompt) ---
run_test "picx generate (basic prompt)" \
  'generate "a red circle on white background"' "true"

# --- 6. picx generate (with options) ---
run_test "picx generate (with --size and --aspect-ratio)" \
  'generate "a blue square" --size 1K --aspect-ratio 16:9' "true"

# --- 7. picx generate (with specific model) ---
run_test "picx generate (with --model)" \
  'generate "a green triangle" --model gemini-3.1-flash-image-preview' "true"

# --- 8. picx edit (basic) ---
run_test "picx edit (basic edit)" \
  'edit "make it darker" --image-url https://picsum.photos/id/237/200/300' "true"

# --- 9. picx usage (default) ---
run_test "picx usage (default period)" \
  "usage" "true"

# --- 10. picx usage (custom period) ---
run_test "picx usage --period 7d" \
  "usage --period 7d" "true"

# --- 11. picx generate (invalid model - should fail) ---
run_test "picx generate (invalid model - expect failure)" \
  'generate "test" --model fake-model-xyz' "false"

# --- 12. No API key test ---
echo "-------------------------------------------" | tee -a "$RESULT_FILE"
echo "TEST $((TOTAL + 1)): picx generate (no API key - expect failure)" | tee -a "$RESULT_FILE"
TOTAL=$((TOTAL + 1))
OUTPUT=$(PICX_API_KEY="" node "$CLI_BIN" generate "test no key" 2>&1)
EXIT_CODE=$?
echo "  Exit code: $EXIT_CODE" | tee -a "$RESULT_FILE"
echo "  Output:" | tee -a "$RESULT_FILE"
echo "$OUTPUT" | sed 's/^/    /' | tee -a "$RESULT_FILE"
if [ $EXIT_CODE -ne 0 ]; then
  echo "  RESULT: PASS (expected failure)" | tee -a "$RESULT_FILE"
  PASSED=$((PASSED + 1))
else
  echo "  RESULT: FAIL" | tee -a "$RESULT_FILE"
  FAILED=$((FAILED + 1))
fi
echo "" | tee -a "$RESULT_FILE"

# ============================================================
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
