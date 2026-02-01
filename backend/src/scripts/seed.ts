import { query, endPool } from '../db/pool.js';
import { popularCharacters } from '../db/seeds/popular_characters.js';

// Character to tags mapping
const characterTags: Record<string, string[]> = {
    "Мигель О'Хара": ['Герой', 'Доминант', 'Защитник'],
    "Саймон 'Гоуст' Райли": ['Военный', 'Холодный', 'Загадочный'],
    "Кёниг": ['Военный', 'Дружелюбный'],
    "Сатору Годжо": ['Аниме', 'Игривый', 'Флирт'],
    "Леон С. Кеннеди": ['Игровой персонаж', 'Герой', 'Защитник'],
    "Скарамучча": ['Аниме', 'Цундере', 'Холодный'],
    "Тодзи Фушигуро": ['Аниме', 'Злодей', 'Холодный'],
    "Кацуки Бакуго": ['Аниме', 'Цундере', 'Доминант'],
    "Нанами Кенто": ['Аниме', 'Наставник', 'Дружелюбный'],
    "Артур Морган": ['Игровой персонаж', 'Защитник', 'Дружелюбный'],
    "Люцифер": ['Демон', 'Доминант', 'Холодный'],
    "Малбонте": ['Романтика', 'Загадочный', 'Демон'],
    "Кадзу": ['Романтика', 'Защитник', 'Наставник'],
    "Влад": ['Вампир', 'Романтика', 'Доминант'],
    "Александр": ['Романтика', 'Загадочный', 'Доминант'],
    "Ратан": ['Демон', 'Доминант', 'Флирт'],
    "Роб": ['Романтика', 'Защитник', 'Дружелюбный'],
    "Райнхольд": ['Романтика', 'Защитник', 'Наставник'],
    "Амэн": ['Романтика', 'Доминант', 'Загадочный'],
    "Себастьян": ['Романтика', 'Флирт', 'Игривый'],
};

// All required tags
const requiredTags = [
    'Романтика', 'Аниме', 'Фентези', 'Наставник', 'Дружелюбный', 'Флирт',
    'Загадочный', 'Игривый', 'Военный', 'Игровой персонаж', 'Герой', 'Злодей',
    'Демон', 'Вампир', 'Доминант', 'Защитник', 'Цундере', 'Холодный'
];

async function runSeed() {
    console.log('🌱 Starting seed...');

    const existing = await query<{ count: string }>('SELECT COUNT(*) as count FROM characters');
    const count = parseInt(existing.rows[0].count);

    if (count > 0) {
        console.log(`⚠️  Database has ${count} characters. Skipping.`);
        console.log('   To reseed: DELETE FROM character_tags; DELETE FROM characters;');
        await endPool();
        return;
    }

    // Insert tags
    console.log('\n📌 Creating tags...');
    for (const tag of requiredTags) {
        await query('INSERT INTO tags (name) VALUES ($1) ON CONFLICT DO NOTHING', [tag]);
    }
    console.log(`   ✅ ${requiredTags.length} tags ready`);

    // Insert characters
    console.log('\n👥 Creating characters...');
    for (const char of popularCharacters) {
        const result = await query<{ id: number }>(
            `INSERT INTO characters (
                name, description_long, avatar_url, system_prompt, 
                access_type, grammatical_gender,
                initial_attraction, initial_trust, initial_affection, initial_dominance,
                is_active, llm_provider, llm_model
            ) VALUES ($1, $2, $3, $4, 'free', $5, $6, $7, $8, $9, true, 'gemini', 'gemini-3-flash-preview')
            RETURNING id`,
            [
                char.name, char.description_long, char.avatar_url, char.system_prompt,
                char.grammatical_gender,
                char.initial_attraction, char.initial_trust, char.initial_affection, char.initial_dominance
            ]
        );
        const charId = result.rows[0].id;

        // Assign tags
        const tags = characterTags[char.name] || [];
        for (const tagName of tags) {
            await query(
                `INSERT INTO character_tags (character_id, tag_id) 
                 SELECT $1, id FROM tags WHERE name = $2`,
                [charId, tagName]
            );
        }
        console.log(`   ✅ ${char.name} (${tags.join(', ')})`);
    }

    console.log(`\n🎉 Seeded ${popularCharacters.length} characters!`);
    await endPool();
}

runSeed().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
