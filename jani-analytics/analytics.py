"""
Jani Analytics - Product Analytics for Jani Backups

Парсит SQL дампы PostgreSQL и предоставляет аналитику по:
- Пользователи (DAU/WAU/MAU, retention, когорты)
- Сообщения (средние по типам пользователей)
- Персонажи (A/B тестирование промптов v1/v2)
- Финансы (revenue, ARPU, conversions)
- Рефералы
"""
import gzip
import re
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# SQL INSERT парсер
INSERT_PATTERN = re.compile(r"INSERT INTO (\w+) .*?VALUES\s*(.+?);$", re.IGNORECASE | re.MULTILINE | re.DOTALL)
VALUES_PATTERN = re.compile(r"\(([^)]+)\)")

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


def parse_value(val: str) -> any:
    """Парсит значение из SQL INSERT"""
    val = val.strip()
    if val.upper() == 'NULL':
        return None
    if val.upper() in ('TRUE', 'FALSE'):
        return val.upper() == 'TRUE'
    if val.startswith("'") and val.endswith("'"):
        return val[1:-1].replace("''", "'")
    try:
        if '.' in val:
            return float(val)
        return int(val)
    except ValueError:
        return val


def parse_sql_dump(sql_content: str) -> dict:
    """Парсит SQL дамп и возвращает данные таблиц"""
    tables = {}
    
    # Ищем все INSERT INTO
    for match in INSERT_PATTERN.finditer(sql_content):
        table_name = match.group(1).lower()
        values_str = match.group(2)
        
        if table_name not in tables:
            tables[table_name] = []
        
        # Парсим каждый набор значений
        for value_match in VALUES_PATTERN.finditer(values_str):
            row_str = value_match.group(1)
            # Разбиваем по запятым, учитывая строки в кавычках
            values = []
            current = ""
            in_quotes = False
            for char in row_str:
                if char == "'" and (not current or current[-1] != '\\'):
                    in_quotes = not in_quotes
                    current += char
                elif char == ',' and not in_quotes:
                    values.append(parse_value(current))
                    current = ""
                else:
                    current += char
            if current:
                values.append(parse_value(current))
            tables[table_name].append(values)
    
    return tables


def load_backup_to_sqlite(backup_path: Path, db_path: Path) -> sqlite3.Connection:
    """Загружает бэкап в SQLite для быстрых запросов"""
    # Распаковываем если gzip
    if str(backup_path).endswith('.gz'):
        with gzip.open(backup_path, 'rt', encoding='utf-8', errors='replace') as f:
            sql_content = f.read()
    else:
        with open(backup_path, 'r', encoding='utf-8', errors='replace') as f:
            sql_content = f.read()
    
    # Парсим
    tables = parse_sql_dump(sql_content)
    
    # Создаем SQLite БД
    if db_path.exists():
        db_path.unlink()
    
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    
    # Создаем таблицы
    _create_sqlite_schema(conn)
    
    # Заполняем данными
    _insert_data(conn, tables)
    
    conn.commit()
    return conn


def _create_sqlite_schema(conn: sqlite3.Connection):
    """Создает схему SQLite"""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            telegram_user_id INTEGER,
            username TEXT,
            created_at TEXT,
            display_name TEXT,
            gender TEXT,
            language TEXT,
            is_adult_confirmed INTEGER,
            last_active_at TEXT,
            nickname TEXT,
            voice_person INTEGER,
            bonus_messages INTEGER,
            limit_start_date TEXT,
            referred_by INTEGER,
            active_days_count INTEGER,
            last_activity_date TEXT,
            last_character_id INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY,
            name TEXT,
            description_long TEXT,
            avatar_url TEXT,
            system_prompt TEXT,
            access_type TEXT,
            is_active INTEGER,
            created_at TEXT,
            grammatical_gender TEXT,
            popularity_score INTEGER,
            messages_count INTEGER,
            unique_users_count INTEGER,
            llm_provider TEXT,
            llm_model TEXT,
            llm_temperature REAL,
            llm_top_p REAL,
            llm_repetition_penalty REAL,
            driver_prompt_version INTEGER,
            initial_attraction INTEGER,
            initial_trust INTEGER,
            initial_affection INTEGER,
            initial_dominance INTEGER,
            created_by INTEGER,
            is_private INTEGER,
            is_approved INTEGER,
            rejection_reason TEXT
        );
        
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            status TEXT,
            start_at TEXT,
            end_at TEXT,
            created_at TEXT
        );
        
        CREATE TABLE IF NOT EXISTS dialogs (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            character_id INTEGER,
            role TEXT,
            message_text TEXT,
            created_at TEXT,
            is_regenerated INTEGER,
            tokens_used INTEGER,
            model_used TEXT
        );
        
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            amount_stars INTEGER,
            telegram_payment_id TEXT,
            status TEXT,
            tier TEXT,
            charge_id TEXT,
            created_at TEXT
        );
        
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            character_id INTEGER,
            last_message_at TEXT,
            messages_count INTEGER,
            created_at TEXT,
            llm_model TEXT,
            llm_temperature REAL,
            llm_top_p REAL
        );
        
        CREATE TABLE IF NOT EXISTS character_ratings (
            user_id INTEGER,
            character_id INTEGER,
            rating INTEGER,
            created_at TEXT,
            PRIMARY KEY (user_id, character_id)
        );
        
        CREATE TABLE IF NOT EXISTS referral_rewards (
            id INTEGER PRIMARY KEY,
            referrer_id INTEGER,
            referred_id INTEGER,
            reward_type TEXT,
            messages_awarded INTEGER,
            created_at TEXT
        );
        
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY,
            name TEXT,
            created_at TEXT
        );
        
        CREATE TABLE IF NOT EXISTS character_tags (
            character_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (character_id, tag_id)
        );
        
        CREATE TABLE IF NOT EXISTS user_character_state (
            user_id INTEGER,
            character_id INTEGER,
            attraction INTEGER,
            trust INTEGER,
            affection INTEGER,
            dominance INTEGER,
            updated_at TEXT,
            PRIMARY KEY (user_id, character_id)
        );
        
        CREATE TABLE IF NOT EXISTS dialog_summaries (
            user_id INTEGER,
            character_id INTEGER,
            summary_text TEXT,
            updated_at TEXT,
            summarized_message_count INTEGER,
            PRIMARY KEY (user_id, character_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_dialogs_user ON dialogs(user_id);
        CREATE INDEX IF NOT EXISTS idx_dialogs_character ON dialogs(character_id);
        CREATE INDEX IF NOT EXISTS idx_dialogs_created ON dialogs(created_at);
        CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    """)


def _insert_data(conn: sqlite3.Connection, tables: dict):
    """Вставляет данные в SQLite"""
    # Маппинг колонок для каждой таблицы
    table_columns = {
        'users': ['id', 'telegram_user_id', 'username', 'created_at', 'display_name', 'gender', 
                  'language', 'is_adult_confirmed', 'last_active_at', 'nickname', 'voice_person',
                  'bonus_messages', 'limit_start_date', 'referred_by', 'active_days_count', 
                  'last_activity_date', 'last_character_id'],
        'characters': ['id', 'name', 'description_long', 'avatar_url', 'system_prompt', 'access_type',
                      'is_active', 'created_at', 'grammatical_gender', 'popularity_score', 
                      'messages_count', 'unique_users_count', 'llm_provider', 'llm_model',
                      'llm_temperature', 'llm_top_p', 'llm_repetition_penalty', 'driver_prompt_version',
                      'initial_attraction', 'initial_trust', 'initial_affection', 'initial_dominance',
                      'created_by', 'is_private', 'is_approved', 'rejection_reason'],
        'subscriptions': ['id', 'user_id', 'status', 'start_at', 'end_at', 'created_at'],
        'dialogs': ['id', 'user_id', 'character_id', 'role', 'message_text', 'created_at',
                   'is_regenerated', 'tokens_used', 'model_used'],
        'payments': ['id', 'user_id', 'amount_stars', 'telegram_payment_id', 'status', 'tier', 
                    'charge_id', 'created_at'],
        'chat_sessions': ['id', 'user_id', 'character_id', 'last_message_at', 'messages_count',
                         'created_at', 'llm_model', 'llm_temperature', 'llm_top_p'],
        'character_ratings': ['user_id', 'character_id', 'rating', 'created_at'],
        'referral_rewards': ['id', 'referrer_id', 'referred_id', 'reward_type', 'messages_awarded', 'created_at'],
        'tags': ['id', 'name', 'created_at'],
        'character_tags': ['character_id', 'tag_id'],
        'user_character_state': ['user_id', 'character_id', 'attraction', 'trust', 'affection', 
                                'dominance', 'updated_at'],
        'dialog_summaries': ['user_id', 'character_id', 'summary_text', 'updated_at', 'summarized_message_count'],
    }
    
    for table_name, rows in tables.items():
        if table_name not in table_columns:
            continue
        
        cols = table_columns[table_name]
        for row in rows:
            # Подгоняем количество значений под количество колонок
            values = list(row[:len(cols)])
            while len(values) < len(cols):
                values.append(None)
            
            placeholders = ','.join(['?' for _ in cols])
            try:
                conn.execute(
                    f"INSERT OR IGNORE INTO {table_name} ({','.join(cols)}) VALUES ({placeholders})",
                    values
                )
            except Exception as e:
                # Пропускаем ошибки вставки
                pass


class Analytics:
    """Класс для аналитических запросов"""
    
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
    
    def get_overview(self) -> dict:
        """Общий обзор"""
        cur = self.conn.cursor()
        
        total_users = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        total_messages = cur.execute("SELECT COUNT(*) FROM dialogs").fetchone()[0]
        total_characters = cur.execute("SELECT COUNT(*) FROM characters WHERE is_active = 1").fetchone()[0]
        total_payments = cur.execute("SELECT COUNT(*) FROM payments WHERE status = 'success'").fetchone()[0]
        total_revenue = cur.execute("SELECT COALESCE(SUM(amount_stars), 0) FROM payments WHERE status = 'success'").fetchone()[0]
        
        return {
            'total_users': total_users,
            'total_messages': total_messages,
            'total_characters': total_characters,
            'total_payments': total_payments,
            'total_revenue': total_revenue
        }
    
    def get_user_analytics(self) -> dict:
        """Аналитика пользователей"""
        cur = self.conn.cursor()
        
        # Общее количество
        total = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        
        # С подписками
        premium = cur.execute("""
            SELECT COUNT(DISTINCT user_id) FROM subscriptions 
            WHERE status = 'active'
        """).fetchone()[0]
        
        # По языкам
        languages = cur.execute("""
            SELECT COALESCE(language, 'unknown') as lang, COUNT(*) as cnt 
            FROM users GROUP BY lang ORDER BY cnt DESC
        """).fetchall()
        
        # По полу
        genders = cur.execute("""
            SELECT COALESCE(gender, 'unknown') as g, COUNT(*) as cnt 
            FROM users GROUP BY g ORDER BY cnt DESC
        """).fetchall()
        
        # 18+ подтверждение
        adult_confirmed = cur.execute("""
            SELECT COUNT(*) FROM users WHERE is_adult_confirmed = 1
        """).fetchone()[0]
        
        # Рефералы
        referred = cur.execute("""
            SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL
        """).fetchone()[0]
        
        # Новые пользователи по дням (последние 30 дней)
        new_users_by_day = cur.execute("""
            SELECT DATE(created_at) as day, COUNT(*) as cnt
            FROM users
            WHERE created_at >= DATE('now', '-30 days')
            GROUP BY day ORDER BY day
        """).fetchall()
        
        # DAU/WAU/MAU (по last_active_at)
        dau = cur.execute("""
            SELECT COUNT(*) FROM users 
            WHERE DATE(last_active_at) = DATE('now')
        """).fetchone()[0]
        
        wau = cur.execute("""
            SELECT COUNT(*) FROM users 
            WHERE last_active_at >= DATE('now', '-7 days')
        """).fetchone()[0]
        
        mau = cur.execute("""
            SELECT COUNT(*) FROM users 
            WHERE last_active_at >= DATE('now', '-30 days')
        """).fetchone()[0]
        
        return {
            'total': total,
            'premium': premium,
            'free': total - premium,
            'languages': [{'name': r[0], 'count': r[1]} for r in languages],
            'genders': [{'name': r[0], 'count': r[1]} for r in genders],
            'adult_confirmed': adult_confirmed,
            'adult_confirmed_pct': round(adult_confirmed / total * 100, 1) if total else 0,
            'referred': referred,
            'referred_pct': round(referred / total * 100, 1) if total else 0,
            'new_users_by_day': [{'date': r[0], 'count': r[1]} for r in new_users_by_day],
            'dau': dau,
            'wau': wau,
            'mau': mau
        }
    
    def get_message_analytics(self) -> dict:
        """Аналитика сообщений"""
        cur = self.conn.cursor()
        
        # Общее количество
        total = cur.execute("SELECT COUNT(*) FROM dialogs").fetchone()[0]
        total_user_msgs = cur.execute("SELECT COUNT(*) FROM dialogs WHERE role = 'user'").fetchone()[0]
        
        # Среднее на пользователя
        avg_per_user = cur.execute("""
            SELECT AVG(cnt) FROM (
                SELECT COUNT(*) as cnt FROM dialogs WHERE role = 'user' GROUP BY user_id
            )
        """).fetchone()[0] or 0
        
        # Среднее для бесплатных
        avg_per_free_user = cur.execute("""
            SELECT AVG(cnt) FROM (
                SELECT COUNT(*) as cnt FROM dialogs d
                WHERE d.role = 'user' 
                AND d.user_id NOT IN (SELECT DISTINCT user_id FROM subscriptions WHERE status = 'active')
                GROUP BY d.user_id
            )
        """).fetchone()[0] or 0
        
        # Среднее для premium
        avg_per_premium_user = cur.execute("""
            SELECT AVG(cnt) FROM (
                SELECT COUNT(*) as cnt FROM dialogs d
                WHERE d.role = 'user' 
                AND d.user_id IN (SELECT DISTINCT user_id FROM subscriptions WHERE status = 'active')
                GROUP BY d.user_id
            )
        """).fetchone()[0] or 0
        
        # Распределение сообщений
        distribution = cur.execute("""
            SELECT 
                CASE 
                    WHEN cnt <= 10 THEN '1-10'
                    WHEN cnt <= 50 THEN '11-50'
                    WHEN cnt <= 100 THEN '51-100'
                    WHEN cnt <= 500 THEN '101-500'
                    ELSE '500+'
                END as bucket,
                COUNT(*) as users
            FROM (
                SELECT user_id, COUNT(*) as cnt FROM dialogs WHERE role = 'user' GROUP BY user_id
            )
            GROUP BY bucket
            ORDER BY MIN(cnt)
        """).fetchall()
        
        # Среднее токенов
        avg_tokens = cur.execute("""
            SELECT AVG(tokens_used) FROM dialogs WHERE tokens_used IS NOT NULL
        """).fetchone()[0] or 0
        
        # По моделям
        models = cur.execute("""
            SELECT COALESCE(model_used, 'unknown') as model, COUNT(*) as cnt
            FROM dialogs WHERE model_used IS NOT NULL
            GROUP BY model ORDER BY cnt DESC
        """).fetchall()
        
        # По часам
        hourly = cur.execute("""
            SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as cnt
            FROM dialogs GROUP BY hour ORDER BY hour
        """).fetchall()
        
        # По дням недели
        daily = cur.execute("""
            SELECT CAST(strftime('%w', created_at) AS INTEGER) as dow, COUNT(*) as cnt
            FROM dialogs GROUP BY dow ORDER BY dow
        """).fetchall()
        
        # Сообщения по дням (последние 30 дней)
        msgs_by_day = cur.execute("""
            SELECT DATE(created_at) as day, COUNT(*) as cnt
            FROM dialogs
            WHERE created_at >= DATE('now', '-30 days')
            GROUP BY day ORDER BY day
        """).fetchall()
        
        return {
            'total': total,
            'total_user_messages': total_user_msgs,
            'avg_per_user': round(avg_per_user, 1),
            'avg_per_free_user': round(avg_per_free_user, 1),
            'avg_per_premium_user': round(avg_per_premium_user, 1),
            'distribution': [{'bucket': r[0], 'users': r[1]} for r in distribution],
            'avg_tokens': round(avg_tokens, 1),
            'models': [{'name': r[0], 'count': r[1]} for r in models],
            'hourly': [{'hour': r[0], 'count': r[1]} for r in hourly],
            'daily': [{'day': r[0], 'count': r[1]} for r in daily],
            'messages_by_day': [{'date': r[0], 'count': r[1]} for r in msgs_by_day]
        }
    
    def get_character_analytics(self) -> dict:
        """Аналитика персонажей"""
        cur = self.conn.cursor()
        
        # Топ персонажей
        top_characters = cur.execute("""
            SELECT c.id, c.name, c.messages_count, c.unique_users_count, 
                   c.driver_prompt_version, c.access_type,
                   COALESCE(c.created_by, 0) as is_ugc
            FROM characters c
            WHERE c.is_active = 1
            ORDER BY c.messages_count DESC
            LIMIT 20
        """).fetchall()
        
        # A/B тестирование по версии промпта
        ab_test = cur.execute("""
            SELECT 
                c.driver_prompt_version as version,
                COUNT(DISTINCT c.id) as characters,
                SUM(c.messages_count) as total_messages,
                SUM(c.unique_users_count) as total_users,
                AVG(CAST(c.messages_count AS FLOAT) / NULLIF(c.unique_users_count, 0)) as avg_msgs_per_user
            FROM characters c
            WHERE c.is_active = 1 AND c.driver_prompt_version IS NOT NULL
            GROUP BY c.driver_prompt_version
        """).fetchall()
        
        # Рейтинги
        ratings = cur.execute("""
            SELECT 
                c.driver_prompt_version,
                COUNT(*) as total_ratings,
                SUM(CASE WHEN cr.rating = 1 THEN 1 ELSE 0 END) as likes,
                SUM(CASE WHEN cr.rating = -1 THEN 1 ELSE 0 END) as dislikes
            FROM character_ratings cr
            JOIN characters c ON c.id = cr.character_id
            WHERE c.driver_prompt_version IS NOT NULL
            GROUP BY c.driver_prompt_version
        """).fetchall()
        
        # UGC vs Official
        ugc_stats = cur.execute("""
            SELECT 
                CASE WHEN created_by IS NOT NULL THEN 'UGC' ELSE 'Official' END as type,
                COUNT(*) as count,
                SUM(messages_count) as messages,
                SUM(unique_users_count) as users
            FROM characters
            WHERE is_active = 1
            GROUP BY type
        """).fetchall()
        
        # Emotional state distribution по версии промпта
        emotional_by_version = cur.execute("""
            SELECT 
                c.driver_prompt_version,
                AVG(ucs.attraction) as avg_attraction,
                AVG(ucs.trust) as avg_trust,
                AVG(ucs.affection) as avg_affection
            FROM user_character_state ucs
            JOIN characters c ON c.id = ucs.character_id
            WHERE c.driver_prompt_version IS NOT NULL
            GROUP BY c.driver_prompt_version
        """).fetchall()
        
        return {
            'top_characters': [
                {
                    'id': r[0], 'name': r[1], 'messages': r[2], 'users': r[3],
                    'prompt_version': r[4], 'access_type': r[5], 'is_ugc': bool(r[6])
                } for r in top_characters
            ],
            'ab_test': [
                {
                    'version': r[0], 'characters': r[1], 'messages': r[2],
                    'users': r[3], 'avg_msgs_per_user': round(r[4] or 0, 1)
                } for r in ab_test
            ],
            'ratings_by_version': [
                {
                    'version': r[0], 'total': r[1], 'likes': r[2], 'dislikes': r[3],
                    'like_ratio': round(r[2] / r[1] * 100, 1) if r[1] else 0
                } for r in ratings
            ],
            'ugc_stats': [
                {'type': r[0], 'count': r[1], 'messages': r[2], 'users': r[3]}
                for r in ugc_stats
            ],
            'emotional_by_version': [
                {
                    'version': r[0], 
                    'avg_attraction': round(r[1] or 0, 1),
                    'avg_trust': round(r[2] or 0, 1),
                    'avg_affection': round(r[3] or 0, 1)
                } for r in emotional_by_version
            ]
        }
    
    def get_financial_analytics(self) -> dict:
        """Финансовая аналитика"""
        cur = self.conn.cursor()
        
        total_users = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        
        # Общий доход
        total_revenue = cur.execute("""
            SELECT COALESCE(SUM(amount_stars), 0) FROM payments WHERE status = 'success'
        """).fetchone()[0]
        
        # Количество платящих
        paying_users = cur.execute("""
            SELECT COUNT(DISTINCT user_id) FROM payments WHERE status = 'success'
        """).fetchone()[0]
        
        # По тарифам
        by_tier = cur.execute("""
            SELECT COALESCE(tier, 'unknown') as tier, 
                   COUNT(*) as count, 
                   SUM(amount_stars) as revenue
            FROM payments 
            WHERE status = 'success'
            GROUP BY tier ORDER BY revenue DESC
        """).fetchall()
        
        # ARPU / ARPPU
        arpu = total_revenue / total_users if total_users else 0
        arppu = total_revenue / paying_users if paying_users else 0
        
        # Конверсия
        conversion = paying_users / total_users * 100 if total_users else 0
        
        # Активные подписки
        active_subs = cur.execute("""
            SELECT COUNT(*) FROM subscriptions WHERE status = 'active'
        """).fetchone()[0]
        
        # Статусы платежей
        payment_statuses = cur.execute("""
            SELECT status, COUNT(*) as cnt FROM payments GROUP BY status
        """).fetchall()
        
        # Доход по дням
        revenue_by_day = cur.execute("""
            SELECT DATE(created_at) as day, SUM(amount_stars) as revenue
            FROM payments 
            WHERE status = 'success' AND created_at >= DATE('now', '-30 days')
            GROUP BY day ORDER BY day
        """).fetchall()
        
        return {
            'total_revenue': total_revenue,
            'paying_users': paying_users,
            'arpu': round(arpu, 2),
            'arppu': round(arppu, 2),
            'conversion_rate': round(conversion, 2),
            'active_subscriptions': active_subs,
            'by_tier': [{'tier': r[0], 'count': r[1], 'revenue': r[2]} for r in by_tier],
            'payment_statuses': [{'status': r[0], 'count': r[1]} for r in payment_statuses],
            'revenue_by_day': [{'date': r[0], 'revenue': r[1]} for r in revenue_by_day]
        }
    
    def get_referral_analytics(self) -> dict:
        """Аналитика рефералов"""
        cur = self.conn.cursor()
        
        # Всего рефералов
        total_referred = cur.execute("""
            SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL
        """).fetchone()[0]
        
        # Активные рефереры
        active_referrers = cur.execute("""
            SELECT COUNT(DISTINCT referred_by) FROM users WHERE referred_by IS NOT NULL
        """).fetchone()[0]
        
        # Топ рефереров
        top_referrers = cur.execute("""
            SELECT u.id, u.username, u.nickname, COUNT(r.id) as referrals
            FROM users u
            JOIN users r ON r.referred_by = u.id
            GROUP BY u.id
            ORDER BY referrals DESC
            LIMIT 10
        """).fetchall()
        
        # Награды
        rewards = cur.execute("""
            SELECT reward_type, COUNT(*) as count, SUM(messages_awarded) as messages
            FROM referral_rewards
            GROUP BY reward_type
        """).fetchall()
        
        # Конверсия рефералов в платящих
        referred_paying = cur.execute("""
            SELECT COUNT(DISTINCT u.id) 
            FROM users u
            JOIN payments p ON p.user_id = u.id
            WHERE u.referred_by IS NOT NULL AND p.status = 'success'
        """).fetchone()[0]
        
        return {
            'total_referred': total_referred,
            'active_referrers': active_referrers,
            'top_referrers': [
                {'id': r[0], 'username': r[1] or r[2] or f'User {r[0]}', 'referrals': r[3]}
                for r in top_referrers
            ],
            'rewards': [{'type': r[0], 'count': r[1], 'messages': r[2]} for r in rewards],
            'referred_paying': referred_paying,
            'referred_conversion': round(referred_paying / total_referred * 100, 1) if total_referred else 0
        }
    
    def get_retention_analytics(self) -> dict:
        """Аналитика retention"""
        cur = self.conn.cursor()
        
        # Когорты по неделям регистрации
        cohorts = cur.execute("""
            SELECT 
                strftime('%Y-%W', created_at) as cohort_week,
                COUNT(*) as users,
                SUM(CASE WHEN active_days_count >= 1 THEN 1 ELSE 0 END) as d1,
                SUM(CASE WHEN active_days_count >= 7 THEN 1 ELSE 0 END) as d7,
                SUM(CASE WHEN active_days_count >= 30 THEN 1 ELSE 0 END) as d30
            FROM users
            GROUP BY cohort_week
            ORDER BY cohort_week DESC
            LIMIT 12
        """).fetchall()
        
        # Среднее active_days
        avg_active_days = cur.execute("""
            SELECT AVG(active_days_count) FROM users WHERE active_days_count > 0
        """).fetchone()[0] or 0
        
        return {
            'cohorts': [
                {
                    'week': r[0], 'users': r[1],
                    'd1': r[2], 'd1_pct': round(r[2] / r[1] * 100, 1) if r[1] else 0,
                    'd7': r[3], 'd7_pct': round(r[3] / r[1] * 100, 1) if r[1] else 0,
                    'd30': r[4], 'd30_pct': round(r[4] / r[1] * 100, 1) if r[1] else 0
                } for r in cohorts
            ],
            'avg_active_days': round(avg_active_days, 1)
        }
    
    def get_all_analytics(self) -> dict:
        """Получить всю аналитику"""
        return {
            'overview': self.get_overview(),
            'users': self.get_user_analytics(),
            'messages': self.get_message_analytics(),
            'characters': self.get_character_analytics(),
            'financial': self.get_financial_analytics(),
            'referrals': self.get_referral_analytics(),
            'retention': self.get_retention_analytics()
        }
