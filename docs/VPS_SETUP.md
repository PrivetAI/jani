# VPS Setup Guide

## Initial Server Setup

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Re-login or run: newgrp docker
```

### 2. Clone Repository

```bash
git clone https://github.com/PrivetAI/jani.git ~/jani
cd ~/jani
```

### 3. Configure Environment

```bash
cp .env.prod.example .env
nano .env
```

Fill in:
- `DOMAIN` — your domain (e.g., `jani.example.com`)
- `POSTGRES_PASSWORD` — strong password
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_BOT_USERNAME` — bot username
- `TELEGRAM_WEBHOOK_SECRET` — random string
- `ADMIN_TELEGRAM_IDS` — your Telegram ID
- `GEMINI_API_KEY` — API key for LLM
- `BACKUP_CHAT_ID` — Telegram ID for backup delivery

### 4. Point Domain to Server

Add DNS A record:
```
jani.example.com -> YOUR_SERVER_IP
```

Wait for DNS propagation (5-30 min).

### 5. Start Services

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

Caddy will automatically obtain SSL certificate.

---

## Caddy Configuration

Caddy — reverse proxy с автоматическим SSL от Let's Encrypt.

### Как работает

Файл `Caddyfile` в корне проекта определяет маршрутизацию:

| Путь | Направляется в |
|------|----------------|
| `/api/*` | Backend (порт 3000) |
| `/telegram/*` | Backend (webhook) |
| `/socket.io/*` | Backend (WebSocket) |
| `/uploads/*` | Backend (файлы) |
| Всё остальное | Frontend (порт 4173) |

### SSL сертификат

Caddy автоматически:
- Получает сертификат при первом запуске
- Обновляет его до истечения
- Редиректит HTTP → HTTPS

### Проверка работы Caddy

```bash
# Логи Caddy
docker-compose -f docker-compose.prod.yml logs caddy

# Проверить SSL
curl -vI https://your-domain.com

# Проверить что сертификат получен
docker-compose -f docker-compose.prod.yml exec caddy caddy list-certificates
```

### Troubleshooting

**Сертификат не получен:**
- Проверьте что домен указывает на IP сервера: `dig your-domain.com`
- Порты 80 и 443 должны быть открыты
- Подождите DNS propagation (до 30 мин)

**502 Bad Gateway:**
- Backend не запущен: `docker-compose -f docker-compose.prod.yml logs backend`
- Проверьте healthcheck postgres

---

## GitHub Actions Setup

Add these secrets in GitHub repo → Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `VPS_HOST` | Your server IP |
| `VPS_USER` | `root` or your username |
| `VPS_SSH_KEY` | Private SSH key (generate with `ssh-keygen`) |

### Generate SSH Key

On your local machine:
```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy  # Copy this to VPS_SSH_KEY secret
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys  # On VPS
```

---

## Telegram Bot Setup

1. Open @BotFather → `/mybots` → select bot
2. `Bot Settings` → `Menu Button` → `Configure menu button`
3. Enter URL: `https://your-domain.com`
4. Set Webhook:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-domain.com/telegram/webhook","secret_token":"YOUR_WEBHOOK_SECRET"}'
```

---

## Useful Commands

```bash
# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart services
docker-compose -f docker-compose.prod.yml restart

# Rebuild after changes
docker-compose -f docker-compose.prod.yml up -d --build

# Check SSL certificate
curl -vI https://your-domain.com

# Manual backup
docker-compose -f docker-compose.prod.yml exec backup /backup.sh

# View backup logs
docker-compose -f docker-compose.prod.yml logs backup
```

