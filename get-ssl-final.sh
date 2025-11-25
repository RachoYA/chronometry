#!/bin/bash

echo "🔐 Получение SSL сертификата для grachia.ru..."

# Останавливаем Nginx
echo "1. Остановка Nginx..."
sudo systemctl stop nginx

# Получаем сертификат
echo "2. Получение сертификата (standalone mode)..."
sudo certbot certonly --standalone -d grachia.ru -d www.grachia.ru --non-interactive --agree-tos --email admin@grachia.ru

if [ $? -eq 0 ]; then
    echo "✅ Сертификат получен успешно!"

    # Создаем правильную конфигурацию
    echo "3. Создание конфигурации Nginx..."

    sudo tee /etc/nginx/sites-available/chronometry > /dev/null <<'EOF'
server {
    listen 80;
    server_name grachia.ru www.grachia.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grachia.ru www.grachia.ru;

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
EOF

    # Активация
    sudo ln -sf /etc/nginx/sites-available/chronometry /etc/nginx/sites-enabled/

    # Проверка и запуск
    if sudo nginx -t; then
        sudo systemctl start nginx
        echo "✅ Nginx запущен с SSL!"
        echo ""
        echo "🎉 ДЕПЛОЙ ЗАВЕРШЕН УСПЕШНО!"
        echo ""
        echo "🌐 Сайт: https://grachia.ru"
        echo "📱 Telegram Web App: https://grachia.ru/telegram-app.html"
        echo ""
        echo "📋 Проверка:"
        sleep 2
        curl -I https://grachia.ru | head -5
        echo ""
        echo "📋 Статус приложений:"
        pm2 status
    else
        echo "❌ Ошибка конфигурации Nginx"
        sudo systemctl start nginx
    fi
else
    echo "❌ Не удалось получить сертификат"
    echo "Запускаем Nginx обратно..."
    sudo systemctl start nginx
fi
