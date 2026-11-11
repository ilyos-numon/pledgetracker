#!/usr/bin/env bash
# 첫 이미지(:bootstrap)를 빌드해 Artifact Registry 에 올린다. 서비스를 처음 만들 때 한 번만 쓴다.
#   :bootstrap 은 커밋 이미지가 아니므로 다음 deploy.yml(커밋 SHA 태그)이 반드시 교체한다.
#   Cloud Run 은 linux/amd64 만 돌리므로 플랫폼을 고정한다 (산출물이 정적 파일이라 빌드 단계는 에뮬레이션 없이 돈다).
#   VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY 는 .env.production 의 SUPABASE_URL·SUPABASE_ANON_KEY 에서 오고,
#   빌드 인자 값은 환경변수로만 넘긴다 (명령줄에 값이 보이지 않는다).
#
# 사용: [ENV_FILE=.env.production] [TAG=bootstrap] bash deploy/gcp/push-image.sh [--dry-run]
#   --dry-run  gcloud·docker 를 실행하지 않고 실행할 명령만 출력
# 성공 마지막 줄: IMAGE=<전체 이미지 주소>
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
TAG="${TAG:-bootstrap}"
SERVICE=pledgetracker
ARTIFACT_REPO=pledgetracker

if [ ! -f "$ENV_FILE" ]; then
  echo "✗ 환경 파일이 없습니다: $ENV_FILE (deploy/env.production.example 을 복사해 채우세요)" >&2
  exit 1
fi
# 필요한 키만 읽는다 (export 하지 않는다). 값을 감싼 따옴표 한 쌍은 벗긴다
WANT=" GCP_PROJECT_ID GCP_REGION SUPABASE_URL SUPABASE_ANON_KEY "
GCP_PROJECT_ID="" GCP_REGION="" SUPABASE_URL="" SUPABASE_ANON_KEY=""
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

for n in GCP_PROJECT_ID GCP_REGION SUPABASE_URL SUPABASE_ANON_KEY; do
  if [ -z "${!n}" ]; then echo "✗ $ENV_FILE 에 $n 이 비어 있습니다" >&2; exit 1; fi
done

REGISTRY="${GCP_REGION}-docker.pkg.dev"
IMAGE="${REGISTRY}/${GCP_PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE}:${TAG}"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "+ gcloud auth configure-docker $REGISTRY --quiet"
  echo "+ VITE_SUPABASE_URL=<SUPABASE_URL> VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY> docker buildx build --platform linux/amd64 --build-arg VITE_SUPABASE_URL --build-arg VITE_SUPABASE_ANON_KEY -t $IMAGE --push $ROOT"
  echo "IMAGE=$IMAGE"
  exit 0
fi

for c in gcloud docker; do
  if ! command -v "$c" >/dev/null 2>&1; then echo "✗ $c 가 없습니다" >&2; exit 1; fi
done
if [ ! -f "$ROOT/Dockerfile" ]; then
  echo "✗ Dockerfile 이 없습니다: $ROOT/Dockerfile" >&2
  exit 1
fi

gcloud auth configure-docker "$REGISTRY" --quiet
cd "$ROOT"
VITE_SUPABASE_URL="$SUPABASE_URL" VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  docker buildx build --platform linux/amd64 \
    --build-arg VITE_SUPABASE_URL --build-arg VITE_SUPABASE_ANON_KEY \
    -t "$IMAGE" --push .
echo "IMAGE=$IMAGE"
