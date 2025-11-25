#!/bin/bash

echo "🔍 Проверка существующей конфигурации samokat-game..."
sudo cat /etc/nginx/sites-available/samokat-game | grep -E "(ssl_certificate|server_name)" | head -10

echo ""
echo "🔧 Установка Certbot для Let's Encrypt..."

# Установка Certbot если еще не установлен
if ! command -v certbot &> /dev/null; then
    echo "📦 Установка certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot python3-certbot-nginx
else
    echo "✅ Certbot уже установлен"
fi

echo ""
echo "🔐 Получение SSL сертификата для grachia.ru..."
echo "Это займет около минуты..."

# Получение сертификата
sudo certbot certonly --nginx -d grachia.ru -d www.grachia.ru --non-interactive --agree-tos --email admin@grachia.ru

if [ $? -eq 0 ]; then
    echo "✅ Сертификат получен!"

    # Обновление конфигурации Nginx
    echo "🔧 Обновление конфигурации Nginx..."

    sudo tee /etc/nginx/sites-available/chronometry > /dev/null <<'EOF'
server {
    listen 80;
    server_name grachia.ru www.grachia.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grachia.ru www.grachia.ru;

    # SSL сертификаты от Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/grachia.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grachia.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Корневая локация - проксирование к Node.js
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

    # Логи
    access_log /var/log/nginx/chronometry_access.log;
    error_log /var/log/nginx/chronometry_error.log;
}
EOF

    # Проверка и перезагрузка Nginx
    echo "🧪 Проверка конфигурации..."
    if sudo nginx -t; then
        echo "✅ Конфигурация корректна"
        sudo systemctl reload nginx
        echo "✅ Nginx перезагружен!"
        echo ""
        echo "🎉 SSL настроен успешно!"
        echo "🌐 Сайт доступен: https://grachia.ru"
    else
        echo "❌ Ошибка в конфигурации Nginx"
    fi
else
    echo "❌ Не удалось получить сертификат"
    echo ""
    echo "Попробуйте вручную:"
    echo "sudo certbot certonly --nginx -d grachia.ru -d www.grachia.ru"
fi
