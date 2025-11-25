#!/bin/bash

echo "🔧 Исправление конфигурации и получение SSL..."

# Удаляем сломанную конфигурацию
echo "1. Удаление старой конфигурации..."
sudo rm -f /etc/nginx/sites-enabled/chronometry
sudo rm -f /etc/nginx/sites-available/chronometry

# Проверка Nginx
echo "2. Проверка Nginx..."
sudo nginx -t && sudo systemctl reload nginx

# Получение SSL сертификата standalone
echo "3. Получение SSL сертификата..."
sudo certbot certonly --standalone -d grachia.ru -d www.grachia.ru --non-interactive --agree-tos --email admin@grachia.ru --preferred-challenges http

if [ $? -eq 0 ]; then
    echo "✅ Сертификат получен!"

    # Создание правильной конфигурации
    echo "4. Создание конфигурации Nginx..."

    sudo tee /etc/nginx/sites-available/chronometry > /dev/null <<'EOF'
server {
    listen 80;
    server_name grachia.ru www.grachia.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grachia.ru www.grachia.ru;

    # SSL сертификаты
    ssl_certificate /etc/letsencrypt/live/grachia.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grachia.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Проксирование к Node.js
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
    sudo ln -s /etc/nginx/sites-available/chronometry /etc/nginx/sites-enabled/

    # Проверка и перезагрузка
    if sudo nginx -t; then
        sudo systemctl reload nginx
        echo "✅ Nginx настроен!"
    fi
fi

# Исправление бота
echo "5. Исправление bot.js..."
cd /var/www/chronometry

# Правильное раскомментирование
sed -i '/TODO: Раскомментируйте после настройки HTTPS URL/d' src/bot.js
sed -i 's|^  // keyboard.inline_keyboard.push(\[{|  keyboard.inline_keyboard.push([{|' src/bot.js
sed -i "s|^  //   text: '📱 Открыть приложение (оффлайн)',|    text: '📱 Открыть приложение (оффлайн)',|" src/bot.js
sed -i "s|^  //   web_app: { url: 'https://ВАШ_ДОМЕН/telegram-app.html' }|    web_app: { url: 'https://grachia.ru/telegram-app.html' }|" src/bot.js
sed -i 's|^  // }]);|  }]);|' src/bot.js

echo "6. Перезапуск приложений..."
pm2 delete chronometry-bot 2>/dev/null || true
pm2 start src/bot.js --name "chronometry-bot"
pm2 save

echo ""
echo "✅ Все исправлено!"
echo ""
echo "📋 Статус приложений:"
pm2 status

echo ""
echo "🧪 Проверка сайта:"
sleep 2
curl -I https://grachia.ru

echo ""
echo "📋 Логи бота:"
pm2 logs chronometry-bot --lines 5 --nostream
