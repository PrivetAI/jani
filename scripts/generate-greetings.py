#!/usr/bin/env python3
"""Generate greeting messages for characters created before 2026-02-10"""
import json
import subprocess
import time
import urllib.request

OPENROUTER_KEY = "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"
MODEL = "google/gemini-2.0-flash-001"
DB_CONTAINER = "jani-postgres-1"
DB_USER = "jani"
DB_NAME = "jani_prod"

GREETING_PROMPT = (
    "Это первое сообщение диалога. Напиши приветствие строго в характере персонажа — "
    "сохрани его стиль речи, манеру и атмосферу. Создай незавершённую ситуацию или задай "
    "вопрос, на который пользователь физически захочет ответить. Не объясняй правила игры, "
    "не здоровайся формально. Просто начни сцену так, будто что-то уже происходит. "
    "Ответь ТОЛЬКО текстом приветствия, без пояснений и кавычек. Максимум 3-4 предложения."
)

def db_query(sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-t", "-A", "-c", sql],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise Exception(f"DB error: {result.stderr}")
    return result.stdout.strip()

def db_exec(sql: str):
    result = subprocess.run(
        ["docker", "exec", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise Exception(f"DB error: {result.stderr}")

def generate_greeting(name: str, system_prompt: str) -> str:
    system_msg = f"Ты — {name}. {system_prompt}"
    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": GREETING_PROMPT}
        ],
        "temperature": 0.9,
        "max_tokens": 300
    }).encode()

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENROUTER_KEY}",
            "Content-Type": "application/json"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    
    msg = data["choices"][0]["message"]["content"].strip()
    if msg.startswith('"') and msg.endswith('"'):
        msg = msg[1:-1]
    return msg

def main():
    # Get IDs
    ids_raw = db_query("SELECT id FROM characters WHERE created_at < '2026-02-10' ORDER BY id")
    ids = [int(x) for x in ids_raw.split('\n') if x.strip()]
    total = len(ids)
    print(f"Found {total} characters to process")

    errors = 0
    for i, char_id in enumerate(ids, 1):
        # Get character data as JSON
        row_json = db_query(
            f"SELECT json_build_object('name', name, 'prompt', system_prompt) FROM characters WHERE id = {char_id}"
        )
        data = json.loads(row_json)
        name = data["name"]
        prompt = data["prompt"]

        print(f"[{i}/{total}] {name} (id={char_id})...", end=" ", flush=True)

        if not prompt:
            print("SKIP (no prompt)")
            continue

        try:
            greeting = generate_greeting(name, prompt)
        except Exception as e:
            print(f"LLM ERROR: {e}")
            errors += 1
            continue

        if not greeting:
            print("ERROR: empty response")
            errors += 1
            continue

        # Update DB
        escaped = greeting.replace("'", "''")
        try:
            db_exec(f"UPDATE characters SET greeting_message = '{escaped}' WHERE id = {char_id}")
            print(f"✓ {greeting[:70]}...")
        except Exception as e:
            print(f"DB ERROR: {e}")
            errors += 1

        time.sleep(0.3)

    print(f"\nDone! Processed: {total}, Errors: {errors}")

if __name__ == "__main__":
    main()
