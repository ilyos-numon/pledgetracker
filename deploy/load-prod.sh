#!/usr/bin/env bash
# 운영 Supabase 에 실데이터를 넣는다: 공약 6명(대구 + data/pledges-extra 5개) → 2026 당선자 목록. 여러 번 돌려도 행 수가 같다.
#   .env.production 의 SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 만 읽어 자식 프로세스 환경변수로 넘긴다 (scripts/sb-env.sh 를 거치지 않는다).
#   SUPABASE_URL 이 https://<ref>.supabase.co 형식이 아니면 멈춘다 (로컬 DB 에 잘못 넣는 것을 막는다).
#   샘플 데이터(tests/fixtures/*.sample.json)는 넣지 않는다. 키 값은 출력하지 않는다.
#
# 사용: [ENV_FILE=.env.production] bash deploy/load-prod.sh [--dry-run] [--reviewer-email <이메일>]
#   --dry-run                 적재하지 않고 실행할 명령만 출력 (URL 형식 검사는 한다)
#   --reviewer-email <이메일>  검수자 계정을 만든다. 비밀번호는 화면에 보이지 않게 입력받는다 (사람이 직접 실행할 때만)
# 성공 마지막 줄: LOAD OK officials=<샘플이 아닌 officials 행 수> catalog=<official_catalog 행 수>
set -euo pipefail

DRY_RUN=0
REVIEWER_EMAIL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --reviewer-email)
      if [ $# -lt 2 ] || [ -z "$2" ]; then echo "--reviewer-email 에 이메일이 필요합니다" >&2; exit 2; fi
      REVIEWER_EMAIL="$2"; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ 환경 파일이 없습니다: $ENV_FILE (deploy/env.production.example 을 복사해 채우세요)" >&2
  exit 1
fi
# 필요한 키만 읽는다 (export 하지 않는다). 값을 감싼 따옴표 한 쌍은 벗긴다
WANT=" SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY "
SUPABASE_URL="" SUPABASE_SERVICE_ROLE_KEY=""
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[2]}"
    val="${BASH_REMATCH[3]}"
    if [[ "$val" =~ ^\"(.*)\"$ || "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    case "$WANT" in *" $key "*) printf -v "$key" '%s' "$val" ;; esac
  fi
done < "$ENV_FILE"
unset line key val

for n in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!n}" ]; then echo "✗ $ENV_FILE 에 $n 이 비어 있습니다" >&2; exit 1; fi
done
if ! [[ "$SUPABASE_URL" =~ ^https://[a-z0-9]+\.supabase\.co$ ]]; then
  echo "✗ SUPABASE_URL 이 운영 주소(https://<ref>.supabase.co) 형식이 아닙니다. 로컬 DB 에는 npm run data:load 를 쓰세요" >&2
  exit 1
fi

DATASETS=("$ROOT/data/pledges/daegu-mayor-2026.json")
for f in "$ROOT"/data/pledges-extra/*.json; do
  [ -f "$f" ] && DATASETS+=("$f")
done
CATALOG="$ROOT/data/catalog/officials-2026.json"
for f in "${DATASETS[@]}" "$CATALOG"; do
  if [ ! -f "$f" ]; then echo "✗ 데이터 파일이 없습니다: $f" >&2; exit 1; fi
done

NODE=(node --no-warnings=ExperimentalWarning)
cd "$ROOT"

# SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 를 자식 프로세스 환경변수로만 넘긴다 (명령줄에 키가 보이지 않는다)
run_node() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "+ SUPABASE_URL=$SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY> ${NODE[*]} $*"
  else
    echo "▶ ${NODE[*]} $*"
    SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" "${NODE[@]}" "$@"
  fi
}

for f in "${DATASETS[@]}"; do
  run_node scripts/load-dataset.ts "${f#"$ROOT"/}"
done
run_node scripts/load-catalog.ts "${CATALOG#"$ROOT"/}"

if [ -n "$REVIEWER_EMAIL" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "+ (비밀번호 입력) SUPABASE_URL=$SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY> ${NODE[*]} scripts/create-reviewer.ts --email $REVIEWER_EMAIL --password <입력값>"
  else
    read -rs -p "검수자 비밀번호 ($REVIEWER_EMAIL): " REVIEWER_PASSWORD
    echo
    if [ -z "$REVIEWER_PASSWORD" ]; then echo "✗ 비밀번호가 비어 있습니다" >&2; exit 1; fi
    SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
      "${NODE[@]}" scripts/create-reviewer.ts --email "$REVIEWER_EMAIL" --password "$REVIEWER_PASSWORD"
    unset REVIEWER_PASSWORD
  fi
fi

# 행 수: REST HEAD + Prefer: count=exact → Content-Range 의 "/" 뒤 숫자. 키는 curl 설정을 표준입력으로 넘긴다
count_rows() {
  local query="$1" headers range
  headers="$({
    printf 'header = "apikey: %s"\n' "$SUPABASE_SERVICE_ROLE_KEY"
    # 새 형식 키(sb_secret_…)는 JWT 가 아니라 Authorization 에 넣지 않는다
    if [[ "$SUPABASE_SERVICE_ROLE_KEY" != sb_* ]]; then
      printf 'header = "Authorization: Bearer %s"\n' "$SUPABASE_SERVICE_ROLE_KEY"
    fi
    printf 'header = "Prefer: count=exact"\n'
  } | curl -sS -f -I -K - "$SUPABASE_URL/rest/v1/$query")"
  range="$(printf '%s\n' "$headers" | tr -d '\r' | sed -n -E 's/^[Cc]ontent-[Rr]ange:[[:space:]]*[^/]*\/([0-9]+).*$/\1/p' | head -1)"
  if [ -z "$range" ]; then echo "✗ 행 수를 읽지 못했습니다: $query" >&2; return 1; fi
  echo "$range"
}

if [ "$DRY_RUN" -eq 1 ]; then
  echo "+ curl -I $SUPABASE_URL/rest/v1/officials?select=id&is_sample=eq.false (Prefer: count=exact)"
  echo "+ curl -I $SUPABASE_URL/rest/v1/official_catalog?select=* (Prefer: count=exact)"
  echo "DRY RUN OK files=$(( ${#DATASETS[@]} + 1 ))"
  exit 0
fi

officials="$(count_rows 'officials?select=id&is_sample=eq.false')"
catalog="$(count_rows 'official_catalog?select=*')"
echo "LOAD OK officials=$officials catalog=$catalog"
