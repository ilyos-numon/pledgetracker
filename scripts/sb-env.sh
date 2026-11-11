#!/usr/bin/env bash
# 로컬 Supabase 접속값을 `supabase status` 에서 읽어 환경변수로 넣고 명령을 실행한다 (키를 파일에 저장하지 않는다).
set -euo pipefail
eval "$(supabase status -o env 2>/dev/null | sed -n -E 's/^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)="?([^"]*)"?$/\1=\2/p' | sed -E 's#//[0-9.]+:#//localhost:#')"
export SUPABASE_URL="${SUPABASE_URL:-${API_URL:?supabase not running: run supabase start}}"
export SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$ANON_KEY}" SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$SERVICE_ROLE_KEY}"
export VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-$SUPABASE_URL}" VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-$SUPABASE_ANON_KEY}"
export SUPABASE_URL_FOR_N8N="${SUPABASE_URL_FOR_N8N:-${SUPABASE_URL/localhost/host.docker.internal}}"
export PLEDGE_OFFICIAL_ID="${PLEDGE_OFFICIAL_ID:-daegu-mayor-2026}"
export EVIDENCE_FEED_URLS="${EVIDENCE_FEED_URLS-https://info.daegu.go.kr/rss/rss.php?sgidx=1}"
exec "$@"
