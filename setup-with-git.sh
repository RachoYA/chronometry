#!/bin/bash

echo "🚀 Первоначальная настройка с Git"
echo ""

# Создаем директорию если её нет
sudo mkdir -p /var/www/chronometry
sudo chown $USER:$USER /var/www/chronometry
cd /var/www/chronometry

# Клонируем репозиторий (замените URL на ваш)
echo "📥 Клонирование репозитория..."
if [ ! -d .git ]; then
    # Здесь нужно будет указать URL вашего git репозитория
    git clone YOUR_GIT_REPO_URL .
else
    echo "Git репозиторий уже существует"
    git pull
fi

# Создаем .env файл (если его нет)
if [ ! -f .env ]; then
    echo "📝 Создание .env файла..."
    cat > .env << 'ENVEOF'
# Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Database
DATABASE_PATH=./data/chronometry.db

# Server
PORT=5000
ENVEOF
    echo "⚠️  Не забудьте заполнить .env файл!"
fi

# Создаем директории для данных
mkdir -p data
mkdir -p photos

# Устанавливаем зависимости
echo "📦 Установка зависимостей..."
npm install

# Настройка SSL (если ещё не настроен)
echo ""
echo "🔐 Настройка SSL..."

# Останавливаем Nginx
sudo systemctl stop nginx

# Получаем сертификат
sudo certbot certonly --standalone -d grachia.ru --non-interactive --agree-tos --email admin@grachia.ru

if [ $? -eq 0 ]; then
    echo "✅ Сертификат получен!"
    
    # Создаем конфигурацию Nginx
    sudo tee /etc/nginx/sites-available/chronometry > /dev/null <<'NGINXEOF'
server {
    listen 80;
    server_name grachia.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grachia.ru;

    ssl_certificate /etc/letsencrypt/live/grachia.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grachia.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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

    client_max_body_size 10M;

    access_log /var/log/nginx/chronometry_access.log;
    error_log /var/log/nginx/chronometry_error.log;
}
NGINXEOF

    sudo ln -sf /etc/nginx/sites-available/chronometry /etc/nginx/sites-enabled/
    
    if sudo nginx -t; then
        sudo systemctl start nginx
        echo "✅ Nginx настроен и запущен"
    else
        echo "❌ Ошибка в конфигурации Nginx"
        sudo systemctl start nginx
    fi
else
    echo "❌ Не удалось получить сертификат"
    sudo systemctl start nginx
fi

# Запускаем приложения
echo ""
echo "🚀 Запуск приложений..."

pm2 start src/bot.js --name "chronometry-bot"
pm2 start server.js --name "chronometry-web"

# Настраиваем автозапуск
pm2 save
pm2 startup

echo ""
echo "✅ Установка завершена!"
echo ""
echo "🌐 Сайт: https://grachia.ru"
echo "📱 Telegram Web App: https://grachia.ru/telegram-app.html"
echo ""

pm2 status
