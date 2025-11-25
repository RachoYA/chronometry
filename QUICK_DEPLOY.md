# ⚡ Быстрый деплой на grachia.ru

## 🚀 Шпаргалка (5 минут)

### 1️⃣ На вашем Mac:

```bash
cd "/Users/grachyaalexanyan/Downloads/Игра"

# Загрузите архив (уже создан!)
scp chronometry.tar.gz racho@89.232.184.218:~/
# Пароль: cv7AE5HpRC
```

### 2️⃣ Подключитесь к серверу:

```bash
ssh racho@89.232.184.218
# Пароль: cv7AE5HpRC
```

### 3️⃣ На сервере - одной командой:

Скопируйте и вставьте весь блок целиком:

```bash
# Установка Node.js и PM2 (если еще не установлены)
command -v node || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs)
command -v pm2 || sudo npm install -g pm2

# Создание и настройка директории
sudo mkdir -p /var/www/chronometry && sudo chown $USER:$USER /var/www/chronometry
cd /var/www/chronometry
tar -xzf ~/chronometry.tar.gz
npm install
mkdir -p data photos

# Обновление bot.js с HTTPS URL
sed -i 's|//   web_app: { url: '\''https://ВАШ_ДОМЕН/telegram-app.html'\'' }|  web_app: { url: '\''https://grachia.ru/telegram-app.html'\'' }|g' src/bot.js
sed -i 's|// keyboard.inline_keyboard.push|keyboard.inline_keyboard.push|g' src/bot.js

# Запуск приложений
pm2 delete chronometry-bot chronometry-web 2>/dev/null || true
pm2 start src/bot.js --name "chronometry-bot"
pm2 start server.js --name "chronometry-web"
pm2 save
pm2 startup | tail -1 | bash

# Проверка статуса
pm2 status
echo ""
echo "✅ Приложения запущены!"
echo "📝 Теперь настройте Nginx (см. ниже)"
```

### 4️⃣ Настройка Nginx:

**A. Найдите ваши SSL сертификаты:**

```bash
# Для Let's Encrypt:
ls -la /etc/letsencrypt/live/grachia.ru/

# Если файлы найдены, используйте эти пути в конфигурации
```

**B. Создайте конфигурацию:**

```bash
sudo tee /etc/nginx/sites-available/chronometry > /dev/null <<'EOF'
server {
    listen 80;
    server_name grachia.ru www.grachia.ru;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name grachia.ru www.grachia.ru;

    # ВАЖНО: Замените пути на правильные!
    ssl_certificate /etc/letsencrypt/live/grachia.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/grachia.ru/privkey.pem;

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

    client_max_body_size 10M;
}
EOF

# Активация
sudo ln -sf /etc/nginx/sites-available/chronometry /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "✅ Nginx настроен!"
```

**C. Если сертификаты в другом месте:**

```bash
# Найдите их:
sudo find /etc/ssl -name "*grachia*" -o -name "*.crt" -o -name "*.pem" | grep -i grachia

# Обновите пути в конфигурации:
sudo nano /etc/nginx/sites-available/chronometry
```

### 5️⃣ Проверка:

```bash
# Статус приложений
pm2 status

# Логи
pm2 logs --lines 20

# Проверка сайта
curl -I https://grachia.ru

# Должно вернуть: HTTP/2 200
```

---

## ✅ Готово!

**Теперь протестируйте в Telegram:**

1. Откройте бота в Telegram
2. Нажмите `/menu`
3. Увидите кнопку "📱 Открыть приложение (оффлайн)"
4. Нажмите → приложение открывается!
5. Включите авиарежим → всё работает! ✈️

---

## 🔄 Быстрое обновление кода

### На Mac:

```bash
cd "/Users/grachyaalexanyan/Downloads/Игра"
tar -czf chronometry.tar.gz --exclude='node_modules' --exclude='.git' --exclude='bot.log' --exclude='*.tar.gz' --exclude='*.md' public/ src/ package.json server.js
scp chronometry.tar.gz racho@89.232.184.218:~/
```

### На сервере:

```bash
ssh racho@89.232.184.218
cd /var/www/chronometry
pm2 stop all
tar -xzf ~/chronometry.tar.gz
pm2 restart all
pm2 logs --lines 10
```

---

## 📋 Полезные команды

```bash
# Статус
pm2 status

# Логи
pm2 logs
pm2 logs chronometry-bot
pm2 logs chronometry-web

# Перезапуск
pm2 restart all

# Мониторинг
pm2 monit

# Проверка Nginx
sudo nginx -t
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

---

## ❌ Если что-то не работает

### Бот не запускается:
```bash
pm2 logs chronometry-bot --lines 50
cat /var/www/chronometry/.env  # Проверьте токен
```

### Сайт не открывается:
```bash
pm2 status  # Должно быть "online"
sudo systemctl status nginx  # Должно быть "active (running)"
curl http://localhost:5000  # Должно вернуть HTML
```

### 502 Bad Gateway:
```bash
pm2 restart chronometry-web
sudo systemctl reload nginx
pm2 logs chronometry-web
```

---

**📚 Полная инструкция:** [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md)

**Дата:** 25 ноября 2025
