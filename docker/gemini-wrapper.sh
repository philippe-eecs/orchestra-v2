#!/bin/bash
# Gemini CLI wrapper
#
# This is a placeholder wrapper for the Gemini CLI.
# Replace with actual gemini CLI installation when available.
#
# Usage: gemini "prompt" -m model -o text

set -e

PROMPT=""
MODEL="gemini-3-pro-preview"
OUTPUT="text"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -m|--model)
            MODEL="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT="$2"
            shift 2
            ;;
        *)
            if [[ -z "$PROMPT" ]]; then
                PROMPT="$1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$PROMPT" ]]; then
    echo "Usage: gemini 'prompt' [-m model] [-o output]" >&2
    exit 1
fi

# Check for API key
if [[ -z "$GOOGLE_API_KEY" ]]; then
    echo "Error: GOOGLE_API_KEY environment variable is required" >&2
    exit 1
fi

# Make API request to Gemini
# Using curl to call the Gemini API directly
API_URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent"

RESPONSE=$(curl -s -X POST "${API_URL}?key=${GOOGLE_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
        \"contents\": [{
            \"parts\": [{
                \"text\": $(echo "$PROMPT" | jq -Rs .)
            }]
        }],
        \"generationConfig\": {
            \"temperature\": 0.7,
            \"maxOutputTokens\": 8192
        }
    }")

# Extract text from response
TEXT=$(echo "$RESPONSE" | jq -r '.candidates[0].content.parts[0].text // .error.message // "Unknown error"')

if [[ "$OUTPUT" == "text" ]]; then
    echo "$TEXT"
elif [[ "$OUTPUT" == "json" ]]; then
    echo "$RESPONSE"
else
    echo "$TEXT"
fi
