#!/bin/bash
# Apply the schema to the Supabase project.
# Usage: SUPABASE_DB_URL="postgresql://postgres.xqyixujilhaozfvepbbd:<password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres" ./supabase/apply.sh
#
# Get your DB URL from: Supabase Dashboard > Settings > Database > Connection string (URI)
set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "Set SUPABASE_DB_URL to your Supabase database connection string."
    echo "Find it at: Supabase Dashboard > Settings > Database > Connection string (URI)"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
psql "$SUPABASE_DB_URL" -f "$SCRIPT_DIR/schema.sql"
echo "Schema applied."
