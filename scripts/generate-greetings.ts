/**
 * Generate greeting messages for all characters without one.
 * 
 * Usage: npx tsx scripts/generate-greetings.ts [--dry-run] [--limit N]
 * 
 * This script:
 * 1. Fetches characters without greeting_message
 * 2. For each character, generates a greeting using their LLM model
 * 3. Updates the character with the generated greeting
 * 
 * Run from backend directory with DATABASE_URL and OPENROUTER_API_KEY set.
 */

import 'dotenv/config';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

if (!OPENROUTER_API_KEY && !GEMINI_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY or GEMINI_API_KEY');
  process.exit(1);
}

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: DATABASE_URL });

interface Character {
  id: number;
  name: string;
  system_prompt: string;
  llm_model: string | null;
  llm_provider: string | null;
  llm_temperature: number | null;
}

// Simple driver prompt for greeting generation
const GREETING_DRIVER = `Ты — персонаж в ролевой игре. Сгенерируй первое сообщение для нового пользователя.
Это сообщение увидит пользователь при первом входе в чат.
Создай атмосферу и начни диалог — опиши действие/обстановку и скажи что-то от лица персонажа.
Пиши от первого лица. Используй *звёздочки* для действий.
Сообщение должно быть 2-5 предложений.`;

async function generateWithOpenRouter(
  systemPrompt: string, 
  model: string,
  temperature: number = 0.8
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://jani.chat',
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: `${GREETING_DRIVER}\n\n${systemPrompt}` },
        { role: 'user', content: '.' }
      ],
      max_tokens: 400,
      temperature: temperature,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function generateWithGemini(
  systemPrompt: string,
  model: string,
  temperature: number = 0.8
): Promise<string> {
  // Map model name to API model
  const apiModel = model.includes('flash') ? 'gemini-2.0-flash' : 'gemini-2.0-pro';
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: '.' }] }
        ],
        systemInstruction: { parts: [{ text: `${GREETING_DRIVER}\n\n${systemPrompt}` }] },
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: 400,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function generateGreeting(char: Character): Promise<string> {
  const temperature = char.llm_temperature ?? 0.8;
  
  // Use character's model or fallback
  if (char.llm_provider === 'gemini' && GEMINI_API_KEY) {
    return generateWithGemini(char.system_prompt, char.llm_model || 'gemini-2.0-flash', temperature);
  }
  
  // Use OpenRouter for everything else
  const model = char.llm_model || 'deepseek/deepseek-chat-v3-0324';
  return generateWithOpenRouter(char.system_prompt, model, temperature);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 1000;

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}, Limit: ${limit}`);
  console.log('Connecting to database...\n');
  
  // Get characters without greeting
  const result = await pool.query<Character>(`
    SELECT id, name, system_prompt, llm_model, llm_provider, llm_temperature 
    FROM characters 
    WHERE is_active = true 
      AND (greeting_message IS NULL OR greeting_message = '')
    ORDER BY id
    LIMIT $1
  `, [limit]);

  console.log(`Found ${result.rows.length} characters without greeting message\n`);

  let processed = 0;
  let failed = 0;

  for (const char of result.rows) {
    const provider = char.llm_provider || 'openrouter';
    const model = char.llm_model || 'deepseek/deepseek-chat-v3-0324';
    
    console.log(`[${processed + failed + 1}/${result.rows.length}] ${char.name} (id=${char.id}) via ${provider}/${model}...`);

    try {
      const greeting = await generateGreeting(char);
      
      if (!greeting || greeting.length < 10) {
        console.log(`  ⚠️ Empty or too short greeting, skipping`);
        failed++;
        continue;
      }

      const truncated = greeting.substring(0, 1000);

      if (dryRun) {
        console.log(`  [DRY RUN] Would save (${truncated.length} chars): "${truncated.substring(0, 80)}..."`);
      } else {
        await pool.query(
          'UPDATE characters SET greeting_message = $1 WHERE id = $2',
          [truncated, char.id]
        );
        console.log(`  ✅ Saved (${truncated.length} chars): "${truncated.substring(0, 60)}..."`);
      }
      
      processed++;

      // Rate limit - wait between requests
      await new Promise(r => setTimeout(r, 300));

    } catch (error) {
      console.log(`  ❌ Error: ${(error as Error).message}`);
      failed++;
      // Continue on error
    }
  }

  console.log(`\n✅ Done! Processed: ${processed}, Failed: ${failed}`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
