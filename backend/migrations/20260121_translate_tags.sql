-- Migration: Translate default tags to Russian
-- Run this manually or via your migration tool

-- Step 1: If Russian tags already exist (from previous partial migration),
-- transfer character_tags from English to Russian versions, then delete English tags
DO $$
DECLARE
    eng_tag TEXT;
    rus_tag TEXT;
    eng_id INT;
    rus_id INT;
BEGIN
    -- List of English -> Russian translations
    FOR eng_tag, rus_tag IN VALUES
        ('romance', 'Романтика'),
        ('anime', 'Аниме'),
        ('fantasy', 'Фентези'),
        ('mentor', 'Наставник'),
        ('friendly', 'Дружелюбный'),
        ('flirty', 'Флирт'),
        ('mysterious', 'Загадочный'),
        ('playful', 'Игривый'),
        ('dominant', 'Доминант'),
        ('protective', 'Защитник'),
        ('cold', 'Холодный'),
        ('demon', 'Демон'),
        ('military', 'Военный'),
        ('hero', 'Герой'),
        ('villain', 'Злодей'),
        ('vampire', 'Вампир'),
        ('tsundere', 'Цундере'),
        ('game', 'Игра')
    LOOP
        SELECT id INTO eng_id FROM tags WHERE name = eng_tag;
        SELECT id INTO rus_id FROM tags WHERE name = rus_tag;
        
        IF eng_id IS NOT NULL AND rus_id IS NOT NULL THEN
            -- If both exist, transfer character_tags and delete English
            UPDATE character_tags SET tag_id = rus_id 
            WHERE tag_id = eng_id 
            AND NOT EXISTS (SELECT 1 FROM character_tags ct2 WHERE ct2.character_id = character_tags.character_id AND ct2.tag_id = rus_id);
            DELETE FROM character_tags WHERE tag_id = eng_id;
            DELETE FROM tags WHERE id = eng_id;
        ELSIF eng_id IS NOT NULL THEN
            -- If only English exists, rename it
            UPDATE tags SET name = rus_tag WHERE id = eng_id;
        END IF;
    END LOOP;
END $$;

-- Add comprehensive list of NEW tags (translated to Russian)
-- Note: Using ON CONFLICT DO NOTHING so this is safe to re-run
-- Removed duplicates that are already handled by UPDATE above
INSERT INTO tags (name) VALUES
    -- Gender/Type
    ('Мужчина'),
    ('Женщина'),
    ('Небинарный'),
    ('Фурри'),
    ('Монстр'),
    ('Пришелец'),
    ('Робот'),
    
    -- Archetypes (removed Злодей, Герой - already in UPDATE)
    ('Детектив'),
    ('Королевская особа'),
    ('Знаменитость'),
    ('Студент'),
    ('Учитель'),
    
    -- Genres
    ('RPG'),
    ('Сценарий'),
    ('Исторический'),
    ('Научная фантастика'),
    ('Киберпанк'),
    ('Стимпанк'),
    ('Постапокалипсис'),
    ('Ужасы'),
    ('Мистика'),
    ('Повседневность'),
    ('Юмор'),
    ('Приключения'),
    
    -- Themes/Mood (removed Романтика, Доминант - already in UPDATE)
    ('Драма'),
    ('Сабмиссив'),
    ('Свитч'),

    -- Roles & Professions (removed Вампир, Демон - already in UPDATE)
    ('Медсестра'),
    ('Врач'),
    ('Офисный работник'),
    ('Босс'),
    ('Секретарь'),
    ('Горничная'),
    ('Принцесса'),
    ('Королева'),
    ('Императрица'),
    ('Рыцарь'),
    ('Воин'),
    ('Маг'),
    ('Ведьма'),
    ('Оборотень'),
    ('Ангел'),
    ('Суккуб'),
    ('Эльф'),
    ('Орк'),
    ('Гоблин'),
    ('Слайм'),
    ('Призрак'),
    ('Божество'),
    ('Айдол'),
    ('Стример'),
    ('Геймер'),

    -- Relationships
    ('Подруга детства'),
    ('Соседка'),
    ('Одноклассница'),
    ('Коллега'),
    ('Жена'),
    ('Муж'),
    ('Бывшая'),
    ('Бывший'),
    ('Сводная сестра'),
    ('Сводный брат'),
    ('Мачеха'),
    ('Отчим'),
    ('Тётя'),
    ('Лучший друг'),
    ('Враг'),
    ('Соперник'),
    
    -- Personality & Traits (removed Холодный, Цундере - already in UPDATE)
    ('Застенчивый'),
    ('Строгий'),
    ('Дерзкий'),
    ('Добрый'),
    ('Злой'),
    ('Умный'),
    ('Глупый'),
    ('Богатый'),
    ('Бедный'),
    ('Популярный'),
    ('Одиночка'),
    ('Яндере'),
    ('Кудере'),
    ('Дандере'),
    
    -- Settings
    ('Школа'),
    ('Офис'),
    ('Дом'),
    ('Фэнтези мир'),
    ('Космос'),
    ('Подземелье'),
    ('Пляж'),
    ('Больница'),
    ('Тюрьма'),
    
    -- Meta
    ('Игровой персонаж'),
    ('Книжный персонаж'),
    ('OC') -- Original Character
ON CONFLICT (name) DO NOTHING;
