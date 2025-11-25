#!/bin/bash

# Поиск SSL сертификатов
echo "🔍 Поиск SSL сертификатов для grachia.ru..."

SSL_CERT=""
SSL_KEY=""

# Проверка Let's Encrypt
if [ -f "/etc/letsencrypt/live/grachia.ru/fullchain.pem" ]; then
    SSL_CERT="/etc/letsencrypt/live/grachia.ru/fullchain.pem"
    SSL_KEY="/etc/letsencrypt/live/grachia.ru/privkey.pem"
    echo "✅ Найдены Let's Encrypt сертификаты"
# Проверка других путей
elif [ -f "/etc/ssl/certs/grachia.ru.crt" ]; then
    SSL_CERT="/etc/ssl/certs/grachia.ru.crt"
    SSL_KEY="/etc/ssl/private/grachia.ru.key"
    echo "✅ Найдены сертификаты в /etc/ssl"
else
    echo "⚠️ Сертификаты не найдены автоматически"
    echo "Ищем все файлы с grachia..."
    sudo find /etc/ssl /etc/letsencrypt -name "*grachia*" 2>/dev/null | head -20
    echo ""
    echo "Продолжаем с путями Let's Encrypt (отредактируйте конфигурацию вручную если нужно)"
    SSL_CERT="/etc/letsencrypt/live/grachia.ru/fullchain.pem"
    SSL_KEY="/etc/letsencrypt/live/grachia.ru/privkey.pem"
fi

# Создание конфигурации Nginx
echo "📝 Создание конфигурации Nginx..."

sudo tee /etc/nginx/sites-available/chronometry > /dev/null <<EOF
server {
    listen 80;
    server_name grachia.ru www.grachia.ru;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grachia.ru www.grachia.ru;

    # SSL сертификаты
    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Корневая локация - проксирование к Node.js
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Увеличиваем размер загружаемых файлов (для фото)
    client_max_body_size 10M;

    # Логи
    access_log /var/log/nginx/chronometry_access.log;
    error_log /var/log/nginx/chronometry_error.log;
}
EOF

echo "✅ Конфигурация создана"

# Активация конфигурации
echo "🔗 Создание символической ссылки..."
sudo ln -sf /etc/nginx/sites-available/chronometry /etc/nginx/sites-enabled/

# Проверка конфигурации
echo "🧪 Проверка конфигурации Nginx..."
if sudo nginx -t; then
    echo "✅ Конфигурация корректна"
    echo "🔄 Перезагрузка Nginx..."
    sudo systemctl reload nginx
    echo "✅ Nginx перезагружен!"
    echo ""
    echo "🎉 Деплой завершен!"
    echo ""
    echo "🌐 Приложение доступно: https://grachia.ru"
    echo "📱 Telegram Web App: https://grachia.ru/telegram-app.html"
    echo ""
    echo "📋 Проверьте логи приложений:"
    echo "   pm2 logs chronometry-bot"
    echo "   pm2 logs chronometry-web"
    echo ""
    echo "📋 Проверьте логи Nginx:"
    echo "   sudo tail -f /var/log/nginx/chronometry_error.log"
else
    echo "❌ Ошибка в конфигурации Nginx!"
    echo "Исправьте ошибки и выполните:"
    echo "   sudo nano /etc/nginx/sites-available/chronometry"
    echo "   sudo nginx -t"
    echo "   sudo systemctl reload nginx"
fi
