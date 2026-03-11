#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_KEY:-}" ]; then
    echo "Error: SUPABASE_URL and SUPABASE_KEY must be set in .env"
    exit 1
fi

API="$SUPABASE_URL/rest/v1/feedback"

mark_addressed() {
    local id="$1"
    shift
    local notes="${*:-}"
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    local payload="{\"is_addressed\":true,\"resolved_at\":\"$now\""
    if [ -n "$notes" ]; then
        local escaped_notes
        escaped_notes=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$notes")
        payload="$payload,\"resolution_notes\":$escaped_notes"
    fi
    payload="$payload}"

    curl -s -X PATCH "$API?id=eq.$id" \
        -H "apikey: $SUPABASE_KEY" \
        -H "Authorization: Bearer $SUPABASE_KEY" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null
    echo "Marked $id as addressed."
    if [ -n "$notes" ]; then
        echo "Notes: $notes"
    fi
}

if [ "${1:-}" = "--mark-addressed" ] && [ -n "${2:-}" ]; then
    local_id="$2"
    shift 2
    mark_addressed "$local_id" "$@"
    exit 0
fi

FILTER="is_addressed=eq.false"
if [ "${1:-}" = "--all" ]; then
    FILTER=""
fi

RESPONSE=$(curl -s "$API?${FILTER}&order=document_slug.asc,created_at.desc" \
    -H "apikey: $SUPABASE_KEY" \
    -H "Authorization: Bearer $SUPABASE_KEY")

COUNT=$(echo "$RESPONSE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$COUNT" = "0" ]; then
    echo "No pending feedback."
    exit 0
fi

echo "========================================="
echo "  PENDING FEEDBACK ($COUNT items)"
echo "========================================="
echo ""

echo "$RESPONSE" | python3 -c "
import sys, json
from datetime import datetime

items = json.load(sys.stdin)
current_doc = ''
status_icons = {'approved': 'APPROVED', 'needs_changes': 'NEEDS CHANGES', 'rejected': 'REJECTED'}

for item in items:
    if item['document_slug'] != current_doc:
        current_doc = item['document_slug']
        doc_items = [i for i in items if i['document_slug'] == current_doc]
        print(f'## {current_doc} ({len(doc_items)} pending)')
        print()

    status = status_icons.get(item['status'], item['status'])
    name = item['reviewer_name']
    company = f\" ({item['reviewer_company']})\" if item.get('reviewer_company') else ''
    dt = item['created_at'][:16].replace('T', ' ')
    comment = item['comment']
    fid = item['id'][:8]

    print(f'  [{status}] {name}{company} -- {dt}')
    print(f'  \"{comment}\"')
    print(f'  id: {item[\"id\"]}')
    print()
"
