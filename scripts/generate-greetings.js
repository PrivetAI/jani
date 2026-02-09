#!/usr/bin/env node
/**
 * Generate greeting messages for all characters using OpenRouter
 */

const fs = require('fs');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const MODEL = 'google/gemini-2.0-flash-001';

async function generateGreeting(character) {
  const systemPrompt = character.system_prompt;
  
  const prompt = `${systemPrompt}

---
Пользователь только что открыл чат. Это ваше первое сообщение — поприветствуй его в характере персонажа. Сообщение должно быть коротким (1-3 предложения), атмосферным и соответствовать стилю персонажа. Можно использовать *действия в звёздочках*. Не задавай слишком много вопросов. Начни диалог естественно.

Ответь ТОЛЬКО текстом сообщения, без пояснений.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 300,
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter error: ${response.status} ${err}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    
    if (!text) {
      throw new Error('Empty response');
    }
    
    return text;
  } catch (err) {
    console.error(`Error for ${character.name}:`, err.message);
    return null;
  }
}

async function main() {
  const inputFile = process.argv[2] || '/tmp/prod_characters.json';
  const outputFile = process.argv[3] || '/tmp/greetings_result.json';
  
  const characters = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  console.log(`Loaded ${characters.length} characters`);
  
  // Load existing results if any
  let results = [];
  let processedIds = new Set();
  try {
    results = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    processedIds = new Set(results.map(r => r.id));
    console.log(`Resuming: ${results.length} already done`);
  } catch {}
  
  const sqlStatements = results.map(r => {
    const escaped = r.greeting.replace(/'/g, "''");
    return `UPDATE characters SET greeting_message = '${escaped}' WHERE id = ${r.id};`;
  });
  
  const remaining = characters.filter(c => !processedIds.has(c.id));
  console.log(`Remaining: ${remaining.length}`);
  
  for (let i = 0; i < remaining.length; i++) {
    const char = remaining[i];
    console.log(`[${results.length + 1}/${characters.length}] ${char.name}...`);
    
    const greeting = await generateGreeting(char);
    
    if (greeting) {
      results.push({ id: char.id, name: char.name, greeting });
      const escaped = greeting.replace(/'/g, "''");
      sqlStatements.push(`UPDATE characters SET greeting_message = '${escaped}' WHERE id = ${char.id};`);
      console.log(`  ✓ "${greeting.slice(0, 50)}..."`);
      
      // Save after each success
      fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
      fs.writeFileSync('/tmp/greetings.sql', sqlStatements.join('\n'));
    } else {
      console.log(`  ✗ Failed`);
    }
    
    // 1 second delay
    if (i < remaining.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\nDone! ${results.length}/${characters.length} greetings generated`);
  console.log(`SQL saved to: /tmp/greetings.sql`);
}

main().catch(console.error);
