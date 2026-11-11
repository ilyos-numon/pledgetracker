#!/usr/bin/env bash
# GitHub Actions Variables 7개를 넣는다 (deploy.yml 이 읽는다). 비밀이 아닌 값만 넣고, 값은 화면에 출력하지 않는다.
#   GCP_PROJECT_ID GCP_REGION ARTIFACT_REPO GCP_WIF_PROVIDER GCP_DEPLOY_SA VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY
#   값의 출처: .env.production (KEY=VALUE 줄만 읽는다. 셸로 실행하지 않는다) + 고정 이름(저장소·SA·WIF 프로바이더)
#   VITE_SUPABASE_URL = SUPABASE_URL, VITE_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY (브라우저 번들에 들어가는 공개 값)
#   값은 명령줄이 아니라 표준입력으로 gh 에 넘긴다.
#
# 사용: GH_TOKEN=$(gh auth token -u <계정>) [ENV_FILE=.env.production] [GCP_PROJECT_NUMBER=244257532456] bash deploy/gcp/gh-vars.sh [--dry-run]
#   --dry-run  gh 를 실행하지 않고 실행할 명령만 출력 (값 없이)
# 성공 마지막 줄: GH VARS OK 7
# shellcheck disable=SC2034  # 아래 변수들은 ${!name} 간접 참조로 읽는다
set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env.production}"
GCP_PROJECT_NUMBER="${GCP_PROJECT_NUMBER:-244257532456}"
SERVICE=pledgetracker
ARTIFACT_REPO=pledgetracker

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ 환경 파일이 없습니다: $ENV_FILE (deploy/env.production.example 을 복사해 채우세요)" >&2
  exit 1
fi
# 필요한 키만 읽는다 (export 하지 않는다). 값을 감싼 따옴표 한 쌍은 벗긴다
WANT=" GCP_PROJECT_ID GCP_REGION GITHUB_REPO SUPABASE_URL SUPABASE_ANON_KEY "
GCP_PROJECT_ID="" GCP_REGION="" GITHUB_REPO="" SUPABASE_URL="" SUPABASE_ANON_KEY=""
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

for n in GCP_PROJECT_ID GCP_REGION GITHUB_REPO SUPABASE_URL SUPABASE_ANON_KEY; do
  if [ -z "${!n}" ]; then echo "✗ $ENV_FILE 에 $n 이 비어 있습니다" >&2; exit 1; fi
done

GCP_WIF_PROVIDER="projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-pool/providers/github-${SERVICE}"
GCP_DEPLOY_SA="${SERVICE}-deploy@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
VITE_SUPABASE_URL="$SUPABASE_URL"
VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"

if [ "$DRY_RUN" -eq 0 ] && ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh CLI 가 없습니다" >&2
  exit 1
fi

count=0
for name in GCP_PROJECT_ID GCP_REGION ARTIFACT_REPO GCP_WIF_PROVIDER GCP_DEPLOY_SA VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "+ gh variable set $name -R $GITHUB_REPO   (값은 표준입력으로 전달, 출력하지 않음)"
  else
    printf '%s' "${!name}" | gh variable set "$name" -R "$GITHUB_REPO" >/dev/null
    echo "✓ $name"
  fi
  count=$((count + 1))
done
echo "GH VARS OK $count"
