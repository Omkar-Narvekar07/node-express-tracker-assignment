#!/usr/bin/env bash
# Expense tracker demo: CRUD, filtering, summary, error handling.
#
# Usage:
#   1. Start the server in another terminal:  pnpm dev
#   2. bash demo.sh
#
# Options (environment variables):
#   PORT=3000      server port (default 3000)
#   PAUSE=1        wait for Enter between sections (useful for live narration)
#   RESET=0        skip restoring src/data/expenses.seed.json before the run

set -u

PORT="${PORT:-3000}"
BASE="http://localhost:${PORT}"
SEED="src/data/expenses.seed.json"
DATA="src/data/expenses.json"
PAUSE="${PAUSE:-0}"
RESET="${RESET:-1}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

STATUS=""
BODY=""
PASS=0
FAIL=0

section() {
  echo
  echo "=================================================="
  echo " $1"
  echo "=================================================="
  if [[ "$PAUSE" == "1" ]]; then
    read -r -p "Press Enter to run... " _
  fi
}

# req METHOD PATH [JSON_BODY] -> sets STATUS and BODY, prints the exchange
req() {
  local method="$1" path="$2" data="${3-}"
  local args=(-s -o "$TMP" -w '%{http_code}' -X "$method" "${BASE}${path}")
  if [[ -n "$data" ]]; then
    args+=(-H 'content-type: application/json' --data "$data")
  fi
  STATUS="$(curl "${args[@]}")"
  BODY="$(<"$TMP")"
  echo "> ${method} ${path} ${data}"
  if (( ${#BODY} > 300 )); then
    echo "< ${STATUS} ${BODY:0:300}..."
  else
    echo "< ${STATUS} ${BODY}"
  fi
}

# json_get PATH -> value at a dot path in BODY (e.g. "id", "byCategory.0.total")
json_get() {
  printf '%s' "$BODY" | node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try {
        const o = JSON.parse(s);
        const v = process.argv[1].split(".").reduce((a, k) => (a == null ? a : a[k]), o);
        console.log(v === undefined ? "" : v);
      } catch { console.log(""); }
    });' "$1"
}

# json_len -> length of the JSON array in BODY (-1 if not an array)
json_len() {
  printf '%s' "$BODY" | node -e '
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => {
      try { const o = JSON.parse(s); console.log(Array.isArray(o) ? o.length : -1); }
      catch { console.log(-1); }
    });'
}

# check LABEL ACTUAL EXPECTED
check() {
  if [[ "$2" == "$3" ]]; then
    echo "  [PASS] $1"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $1 (expected '$3', got '$2')"
    FAIL=$((FAIL + 1))
  fi
}

# ---------------------------------------------------------------- setup

section "0. Setup: reset data and verify the server is up"

if [[ "$RESET" == "1" ]]; then
  if [[ -f "$SEED" ]]; then
    cp "$SEED" "$DATA"
    echo "Restored $DATA from $SEED"
  else
    echo "WARNING: $SEED not found. Counts and totals below assume the 14-record seed data."
  fi
fi

if ! curl -s -o /dev/null "${BASE}/health"; then
  echo "Server is not reachable at ${BASE}. Start it with: pnpm dev"
  exit 2
fi

# ---------------------------------------------------------------- 1. health

section "1. Health check"
req GET /health
check "status is 200" "$STATUS" "200"

# ---------------------------------------------------------------- 2. create

section "2. Create an expense (server assigns id and createdAt)"
# The body deliberately includes id, createdAt and an unknown field.
# They must be ignored, not stored.
req POST /expenses '{"title":"Demo coffee","amount":250,"category":"Food","date":"2026-10-25","id":"hacker","createdAt":"1999-01-01T00:00:00.000Z","extra":"nope"}'
check "status is 201" "$STATUS" "201"
ID="$(json_get id)"
CREATED_AT="$(json_get createdAt)"
check "client-supplied id ignored" "$([[ "$ID" != "hacker" && -n "$ID" ]] && echo yes || echo no)" "yes"
check "client-supplied createdAt ignored" "$([[ "$CREATED_AT" != "1999-01-01T00:00:00.000Z" && -n "$CREATED_AT" ]] && echo yes || echo no)" "yes"
check "unknown field not stored" "$(json_get extra)" ""
echo "Created id: ${ID}"

if [[ -z "$ID" ]]; then
  echo "No id returned, cannot continue."
  exit 1
fi

# ---------------------------------------------------------------- 3. read

section "3. Read: list all and get by id"
req GET /expenses
check "status is 200" "$STATUS" "200"
check "15 expenses (14 seed + 1 new)" "$(json_len)" "15"

req GET "/expenses/${ID}"
check "status is 200" "$STATUS" "200"
check "title matches" "$(json_get title)" "Demo coffee"

# ---------------------------------------------------------------- 4. update

section "4. Update (PATCH only the amount)"
req PATCH "/expenses/${ID}" '{"amount":300}'
check "status is 200" "$STATUS" "200"
check "amount updated" "$(json_get amount)" "300"
check "title unchanged" "$(json_get title)" "Demo coffee"
check "id unchanged" "$(json_get id)" "$ID"
check "createdAt unchanged" "$(json_get createdAt)" "$CREATED_AT"

# ---------------------------------------------------------------- 5. filter

section "5. Filtering by category and date range"
req GET "/expenses?category=food"
check "category=food (case-insensitive): 5 records" "$(json_len)" "5"

req GET "/expenses?startDate=2026-10-12&endDate=2026-10-20"
check "date range 12th to 20th inclusive: 7 records" "$(json_len)" "7"

req GET "/expenses?category=Food&startDate=2026-10-12&endDate=2026-10-20"
check "category + range: 2 records" "$(json_len)" "2"

req GET "/expenses?startDate=2026-10-24"
check "startDate only (24th onward): 2 records" "$(json_len)" "2"

req GET "/expenses?category=Nothing"
check "unknown category: 0 records" "$(json_len)" "0"

# ---------------------------------------------------------------- 6. summary

section "6. Spending summary (with the demo expense at 300)"
req GET /summary
check "status is 200" "$STATUS" "200"
check "total" "$(json_get total)" "15343.9"
check "count" "$(json_get count)" "15"
check "Food total (first category)" "$(json_get byCategory.0.total)" "4996.5"

# ---------------------------------------------------------------- 7. delete

section "7. Delete the demo expense"
req DELETE "/expenses/${ID}"
check "status is 200" "$STATUS" "200"

req GET "/expenses/${ID}"
check "deleted expense now returns 404" "$STATUS" "404"

req GET /expenses
check "back to 14 expenses" "$(json_len)" "14"

req GET /summary
check "total back to seed value" "$(json_get total)" "15043.9"
check "Food back to seed value" "$(json_get byCategory.0.total)" "4696.5"

# ---------------------------------------------------------------- 8. errors

section "8. Error handling"
req POST /expenses '{"title":"x"}'
check "missing fields -> 400" "$STATUS" "400"

req POST /expenses '{"title":"x","amount":0,"category":"Food","date":"2026-10-25"}'
check "amount of 0 -> 400" "$STATUS" "400"

req POST /expenses '{"title":"x","amount":-5,"category":"Food","date":"2026-10-25"}'
check "negative amount -> 400" "$STATUS" "400"

req POST /expenses '{"title":"x","amount":"10","category":"Food","date":"2026-10-25"}'
check "amount as string -> 400" "$STATUS" "400"

req POST /expenses '{"title":"x","amount":10,"category":"Food","date":"25-10-2026"}'
check "bad date format -> 400" "$STATUS" "400"

req POST /expenses '{bad json'
check "invalid JSON -> 400" "$STATUS" "400"

req PATCH "/expenses/does-not-exist" '{"amount":5}'
check "PATCH unknown id -> 404" "$STATUS" "404"

SEED_ID="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[0].id)' "$DATA")"
req PATCH "/expenses/${SEED_ID}" '{"id":"new-id"}'
check "PATCH with only read-only fields -> 400" "$STATUS" "400"

req DELETE "/expenses/does-not-exist"
check "DELETE unknown id -> 404" "$STATUS" "404"

req GET "/expenses?startDate=18-10-2026"
check "malformed startDate -> 400" "$STATUS" "400"

req GET "/expenses?startDate=2026-10-30&endDate=2026-10-01"
check "startDate after endDate -> 400" "$STATUS" "400"

req GET /nope
check "unknown route -> 404" "$STATUS" "404"

# ---------------------------------------------------------------- results

section "Results"
echo "Passed: ${PASS}"
echo "Failed: ${FAIL}"
echo
echo "Persistence check (manual): stop the server, restart it, then run"
echo "  curl ${BASE}/expenses"
echo "The data survives because it lives in ${DATA}."

if (( FAIL > 0 )); then
  exit 1
fi