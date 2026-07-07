#!/usr/bin/env bash
# Ping IndexNow (Bing, Yandex, Seznam, Naver...) that zalturi.com has new or
# updated content, so they can recrawl without waiting for their next pass.
#
# Usage:
#   ./scripts/indexnow-ping.sh                          # submits every URL in sitemap.xml
#   ./scripts/indexnow-ping.sh https://zalturi.com/about/  # submits just the given URL(s)
set -euo pipefail

KEY="3e7066c8380b6c74f8bf648f0992ad4d"
HOST="zalturi.com"
KEY_LOCATION="https://zalturi.com/${KEY}.txt"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$#" -gt 0 ]; then
  urls=("$@")
else
  urls=()
  while IFS= read -r line; do
    urls+=("$line")
  done < <(grep -o '<loc>[^<]*</loc>' "$DIR/sitemap.xml" | sed 's#<loc>##g; s#</loc>##g')
fi

json_urls=$(printf '"%s",' "${urls[@]}")
json_urls="[${json_urls%,}]"

curl -sS -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"host\":\"${HOST}\",\"key\":\"${KEY}\",\"keyLocation\":\"${KEY_LOCATION}\",\"urlList\":${json_urls}}" \
  -w "\nHTTP %{http_code}\n"
