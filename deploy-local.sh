#!/bin/bash

# Chronometry Local Deploy Script
# Запускать локально: ./deploy-local.sh

set -e  # Остановка при ошибке

SERVER="89.232.184.218"
USER="racho"
PASSWORD="cv7AE5HpRC"

echo "========================================"
echo "   Chronometry Deployment Script"
echo "========================================"

# 1. Проверяем что тесты прошли
echo ""
echo "[1/5] Запуск юнит-тестов..."
npm run test:unit --silent
if [ $? -ne 0 ]; then
    echo "ОШИБКА: Юнит-тесты не прошли! Деплой отменён."
    exit 1
fi
echo "✅ Юнит-тесты пройдены (141 тест)"

# 2. Коммитим изменения если есть
echo ""
echo "[2/5] Проверка git статуса..."
if [[ -n $(git status -s) ]]; then
    echo "Есть незакоммиченные изменения, коммитим..."
    git add .
    git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || true
fi
echo "✅ Git готов"

# 3. Пушим в репозиторий
echo ""
echo "[3/5] Пуш в GitHub..."
git push origin main || echo "Ничего не запушено (up to date)"
echo "✅ Код синхронизирован"

# 4. Деплой на сервер через SSH
echo ""
echo "[4/5] Деплой на сервер $SERVER..."
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $USER@$SERVER << 'ENDSSH'
    cd ~/chronometry

    echo "📥 Pulling latest changes..."
    git pull origin main

    echo "📦 Installing dependencies..."
    npm install --production

    echo "🔄 Restarting with Docker Compose..."
    docker-compose down || true
    docker-compose up -d --build

    echo "⏳ Waiting for services..."
    sleep 5

    echo "📊 Checking status..."
    docker-compose ps

    echo "📋 App logs:"
    docker-compose logs --tail=10 app
ENDSSH

echo "✅ Деплой завершён"

# 5. Проверка доступности
echo ""
echo "[5/5] Проверка доступности сервера..."
sleep 3
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$SERVER:5000/ 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Сервер доступен!"
else
    echo "⚠️  Статус HTTP: $HTTP_STATUS (может требоваться время для запуска)"
fi

echo ""
echo "========================================"
echo "   Деплой успешно завершён!"
echo "========================================"
echo ""
echo "🌐 PWA:    http://$SERVER:5000"
echo "👑 Admin:  http://$SERVER:5000/admin.html"
echo ""
