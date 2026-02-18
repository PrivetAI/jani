#!/bin/bash
# Generate greeting messages for characters created before 2026-02-10
# Fixed version: queries each character individually to avoid delimiter issues

OPENROUTER_KEY="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"
MODEL="google/gemini-2.0-flash-001"
DB_CONTAINER="jani-postgres-1"
DB_USER="jani"
DB_NAME="jani_prod"

GREETING_PROMPT='Это первое сообщение диалога. Напиши приветствие строго в характере персонажа — сохрани его стиль речи, манеру и атмосферу. Создай незавершённую ситуацию или задай вопрос, на который пользователь физически захочет ответить. Не объясняй правила игры, не здоровайся формально. Просто начни сцену так, будто что-то уже происходит. Ответь ТОЛЬКО текстом приветствия, без пояснений и кавычек. Максимум 3-4 предложения.'

# Get only IDs (one per line, no multiline issues)
IDS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c \
  "SELECT id FROM characters WHERE created_at < '2026-02-10' ORDER BY id")

TOTAL=$(echo "$IDS" | grep -c '[0-9]')
echo "Found $TOTAL characters to process"

COUNT=0
ERRORS=0
SKIPPED=0

for ID in $IDS; do
  [ -z "$ID" ] && continue
  COUNT=$((COUNT + 1))

  # Get name and system_prompt as JSON to handle any special characters
  ROW_JSON=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c \
    "SELECT json_build_object('name', name, 'prompt', system_prompt) FROM characters WHERE id = $ID")

  NAME=$(echo "$ROW_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["name"])')
  SYSTEM_PROMPT=$(echo "$ROW_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["prompt"])')

  echo "[$COUNT/$TOTAL] $NAME (id=$ID)..."

  if [ -z "$SYSTEM_PROMPT" ]; then
    echo "  SKIP: no system_prompt"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Build system message and escape for JSON
  FULL_SYSTEM="Ты — $NAME. $SYSTEM_PROMPT"
  SYSTEM_ESCAPED=$(python3 -c "import json; print(json.dumps('$( echo "$FULL_SYSTEM" | sed "s/'/\\\\'/g")'))" 2>/dev/null)
  
  # Safer approach: use python3 to build the entire JSON payload
  PAYLOAD=$(python3 -c "
import json, sys
system_msg = '''$( echo "$FULL_SYSTEM" | sed "s/'''/\\'\\'\\'/" )'''
user_msg = '''$GREETING_PROMPT'''
payload = {
    'model': '$MODEL',
    'messages': [
        {'role': 'system', 'content': system_msg},
        {'role': 'user', 'content': user_msg}
    ],
    'temperature': 0.9,
    'max_tokens': 300
}
print(json.dumps(payload))
" 2>/dev/null)

  if [ -z "$PAYLOAD" ] || [ "$PAYLOAD" = "null" ]; then
    # Fallback: pipe through stdin
    PAYLOAD=$(echo "$ROW_JSON" | python3 -c "
import json, sys
d = json.load(sys.stdin)
system_msg = 'Ты — ' + d['name'] + '. ' + d['prompt']
user_msg = '''$GREETING_PROMPT'''
payload = {
    'model': '$MODEL',
    'messages': [
        {'role': 'system', 'content': system_msg},
        {'role': 'user', 'content': user_msg}
    ],
    'temperature': 0.9,
    'max_tokens': 300
}
print(json.dumps(payload))
")
  fi

  # Call OpenRouter API
  RESPONSE=$(echo "$PAYLOAD" | curl -s --max-time 30 "https://openrouter.ai/api/v1/chat/completions" \
    -H "Authorization: Bearer $OPENROUTER_KEY" \
    -H "Content-Type: application/json" \
    -d @-)

  # Extract reply
  GREETING=$(echo "$RESPONSE" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    msg = data["choices"][0]["message"]["content"].strip()
    if msg.startswith("\"") and msg.endswith("\""):
        msg = msg[1:-1]
    print(msg)
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
')

  if [ $? -ne 0 ] || [ -z "$GREETING" ]; then
    echo "  ERROR: Failed to generate"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Update DB using python3 to properly escape
  echo "$GREETING" | python3 -c "
import sys, subprocess
greeting = sys.stdin.read().strip().replace(\"'\", \"''\")
sql = f\"UPDATE characters SET greeting_message = '{greeting}' WHERE id = $ID\"
result = subprocess.run(
    ['docker', 'exec', '$DB_CONTAINER', 'psql', '-U', '$DB_USER', '-d', '$DB_NAME', '-c', sql],
    capture_output=True, text=True
)
if result.returncode != 0:
    print(f'DB ERROR: {result.stderr}', file=sys.stderr)
    sys.exit(1)
"

  if [ $? -eq 0 ]; then
    echo "  ✓ ${GREETING:0:80}..."
  else
    echo "  ERROR: DB update failed"
    ERRORS=$((ERRORS + 1))
  fi

  sleep 0.3
done

echo ""
echo "Done! Processed: $COUNT, Errors: $ERRORS, Skipped: $SKIPPED"
