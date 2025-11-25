#!/bin/bash

# Скрипт деплоя на сервер grachia.ru

SERVER="89.232.184.218"
USER="racho"
DOMAIN="grachia.ru"
APP_DIR="/var/www/chronometry"

echo "🚀 Деплой приложения на $DOMAIN"
echo "================================"

# Создаем архив проекта
echo "📦 Создание архива..."
tar -czf chronometry.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='bot.log' \
  --exclude='*.tar.gz' \
  public/ src/ data/ package.json package-lock.json server.js .env.example

echo "✅ Архив создан: chronometry.tar.gz"
echo ""
echo "📤 Загрузка на сервер..."
echo "Используйте команду:"
echo ""
echo "scp chronometry.tar.gz $USER@$SERVER:~/"
echo ""
echo "Затем подключитесь к серверу:"
echo "ssh $USER@$SERVER"
echo ""
echo "И выполните команды на сервере:"
echo ""
cat << 'EOF'
# 1. Установка Node.js (если еще не установлен)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Установка PM2 глобально
sudo npm install -g pm2

# 3. Создание директории приложения
sudo mkdir -p /var/www/chronometry
sudo chown $USER:$USER /var/www/chronometry

# 4. Распаковка архива
cd /var/www/chronometry
tar -xzf ~/chronometry.tar.gz

# 5. Установка зависимостей
npm install

# 6. Создание .env файла
cat > .env << 'ENVEOF'
TELEGRAM_BOT_TOKEN=6262479869:AAFFenO-M9qJ8qfP1TuFr3WDWPCdAOVk1k8
DB_PATH=./data/chronometry.db
PORT=5000
ENVEOF

# 7. Создание директории для базы данных
mkdir -p data
mkdir -p photos

# 8. Настройка Nginx
sudo tee /etc/nginx/sites-available/chronometry << 'NGINXEOF'
server {
    listen 80;
    server_name grachia.ru www.grachia.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grachia.ru www.grachia.ru;

    # SSL сертификаты (укажите пути к вашим сертификатам)
    ssl_certificate /etc/ssl/certs/grachia.ru.crt;
    ssl_certificate_key /etc/ssl/private/grachia.ru.key;

    # Если используете Let's Encrypt:
    # ssl_certificate /etc/letsencrypt/live/grachia.ru/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/grachia.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Увеличиваем размер загружаемых файлов (для фото)
    client_max_body_size 10M;
}
NGINXEOF

# 9. Активация конфигурации Nginx
sudo ln -sf /etc/nginx/sites-available/chronometry /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 10. Запуск приложений через PM2
pm2 start src/bot.js --name "chronometry-bot"
pm2 start server.js --name "chronometry-web"

# 11. Сохранение конфигурации PM2
pm2 save
pm2 startup

# 12. Проверка статуса
pm2 status
pm2 logs chronometry-bot --lines 10
pm2 logs chronometry-web --lines 10

echo "✅ Деплой завершен!"
echo "🌐 Приложение доступно: https://grachia.ru"
echo "🤖 Бот работает в фоне"
EOF

echo ""
echo "💡 Также создайте файл deploy-update.sh для быстрого обновления:"
