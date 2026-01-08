#!/bin/bash

# Script to trigger all Twitter API refresh endpoints
# 
# Usage:
#   ./scripts/refresh-all-twitter-apis.sh [avatars|sentiment|smart|all]
#
# Environment variables:
#   - NEXT_PUBLIC_BASE_URL: Base URL of your app (default: http://localhost:3000)
#   - AKARI_SESSION_TOKEN: Session token for SuperAdmin auth (for avatar refresh)
#   - CRON_SECRET: Secret for cron endpoints (for sentiment refresh)

set -e

BASE_URL="${NEXT_PUBLIC_BASE_URL:-http://localhost:3000}"
REFRESH_TYPE="${1:-all}"

echo "🚀 Starting Twitter API Refresh"
echo "=================================="
echo "Base URL: $BASE_URL"
echo "Refresh Type: $REFRESH_TYPE"
echo "=================================="

# Function to make API request
make_request() {
    local url=$1
    local method=${2:-GET}
    local body=${3:-}
    
    echo ""
    echo "📡 Making $method request to: $url"
    
    if [ -n "$body" ]; then
        curl -X "$method" \
            -H "Content-Type: application/json" \
            -H "Cookie: akari_session=${AKARI_SESSION_TOKEN}" \
            -d "$body" \
            "$url" | jq '.'
    else
        curl -X "$method" \
            -H "Content-Type: application/json" \
            -H "Cookie: akari_session=${AKARI_SESSION_TOKEN}" \
            "$url" | jq '.'
    fi
}

# Refresh avatars
refresh_avatars() {
    echo ""
    echo "=================================="
    echo "🖼️  REFRESHING AVATARS"
    echo "=================================="
    
    if [ -z "$AKARI_SESSION_TOKEN" ]; then
        echo "⚠️  AKARI_SESSION_TOKEN not set. Avatar refresh requires SuperAdmin auth."
        echo "   Set AKARI_SESSION_TOKEN environment variable or log in as SuperAdmin."
        return 1
    fi
    
    make_request "${BASE_URL}/api/portal/admin/arc/refresh-avatars?limit=500&batchSize=10" "POST"
}

# Refresh sentiment
refresh_sentiment() {
    echo ""
    echo "=================================="
    echo "📊 REFRESHING SENTIMENT DATA"
    echo "=================================="
    
    if [ -z "$CRON_SECRET" ]; then
        echo "⚠️  CRON_SECRET not set. Skipping sentiment refresh."
        return 1
    fi
    
    make_request "${BASE_URL}/api/portal/cron/sentiment-refresh-all?secret=${CRON_SECRET}" "GET"
}

# Smart refresh sentiment
smart_refresh_sentiment() {
    echo ""
    echo "=================================="
    echo "🧠 SMART REFRESH SENTIMENT DATA"
    echo "=================================="
    
    if [ -z "$CRON_SECRET" ]; then
        echo "⚠️  CRON_SECRET not set. Skipping smart refresh."
        return 1
    fi
    
    make_request "${BASE_URL}/api/portal/cron/sentiment-smart-refresh?secret=${CRON_SECRET}" "GET"
}

# Main logic
case "$REFRESH_TYPE" in
    avatars)
        refresh_avatars
        ;;
    sentiment)
        refresh_sentiment
        ;;
    smart)
        smart_refresh_sentiment
        ;;
    all)
        refresh_avatars
        if [ -n "$CRON_SECRET" ]; then
            echo ""
            echo "⏳ Waiting 5 seconds before sentiment refresh..."
            sleep 5
            smart_refresh_sentiment
        fi
        ;;
    *)
        echo "❌ Unknown refresh type: $REFRESH_TYPE"
        echo "Usage: $0 [avatars|sentiment|smart|all]"
        exit 1
        ;;
esac

echo ""
echo "=================================="
echo "✅ Refresh operations completed!"
echo "=================================="
