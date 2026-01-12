#!/bin/bash

# Deploy script for Jani
# Usage: ./deploy.sh [frontend|backend|all]

# Load credentials from .deploy.env (gitignored)
if [ -f ".deploy.env" ]; then
    source .deploy.env
else
    echo "❌ .deploy.env not found!"
    echo "Create it with:"
    echo "  VPS_HOST=your-server-ip"
    echo "  VPS_USER=root"
    echo "  VPS_PASS=your-password"
    echo "  VPS_PATH=/home/jani/jani"
    exit 1
fi

SERVICE=${1:-all}

echo "🚀 Deploying to $VPS_HOST..."

# Commands to execute on VPS
COMMANDS="cd $VPS_PATH && git pull"

case $SERVICE in
    frontend)
        COMMANDS="$COMMANDS && docker compose --env-file .env.prod -f docker-compose.prod.yml build --no-cache frontend && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d frontend"
        ;;
    backend)
        COMMANDS="$COMMANDS && docker compose --env-file .env.prod -f docker-compose.prod.yml build --no-cache backend && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d backend"
        ;;
    all)
        COMMANDS="$COMMANDS && docker compose --env-file .env.prod -f docker-compose.prod.yml build --no-cache && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d"
        ;;
    *)
        echo "Usage: ./deploy.sh [frontend|backend|all]"
        exit 1
        ;;
esac

# Use sshpass for non-interactive password auth
if command -v sshpass &> /dev/null; then
    echo "📦 Copying .env.prod to server..."
    sshpass -p "$VPS_PASS" scp -o StrictHostKeyChecking=no .env.prod "$VPS_USER@$VPS_HOST:$VPS_PATH/.env.prod"
    sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" "$COMMANDS"
else
    echo "⚠️  sshpass not installed. Install with: sudo apt install sshpass"
    echo "Falling back to interactive SSH..."
    scp -o StrictHostKeyChecking=no .env.prod "$VPS_USER@$VPS_HOST:$VPS_PATH/.env.prod"
    ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" "$COMMANDS"
fi

echo "✅ Deploy complete!"
