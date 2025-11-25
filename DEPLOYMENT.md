# 🚀 Руководство по деплою Chronometry

## Быстрый старт

Система уже развернута на **https://grachia.ru** через Git!

### Обновление приложения

```bash
# Локально
git add .
git commit -m "Update features"
git push

# На сервере
ssh racho@89.232.184.218
cd /var/www/chronometry
git pull
npm install
pm2 restart all
```

---

## Деплой через Git

### 1. Первоначальная настройка на сервере

```bash
# Создание директории
sudo mkdir -p /var/www/chronometry
sudo chown $USER:$USER /var/www/chronometry

# Клонирование репозитория
cd /var/www/chronometry
git clone https://github.com/RachoYA/chronometry.git .

# Установка зависимостей
npm install

# Настройка .env
cat > .env << 'EOF'
TELEGRAM_BOT_TOKEN=your_token
DATABASE_PATH=./data/chronometry.db
PORT=5000
EOF

# Создание директорий
mkdir -p data photos
```

### 2. Запуск приложений

```bash
# Запуск через PM2
pm2 start src/bot.js --name chronometry-bot
pm2 start server.js --name chronometry-web

# Автозапуск
pm2 save
pm2 startup
```

### 3. Настройка Nginx с SSL

```bash
# Получение SSL сертификата
sudo systemctl stop nginx
sudo certbot certonly --standalone -d grachia.ru --agree-tos --email admin@grachia.ru

# Конфигурация Nginx
sudo tee /etc/nginx/sites-available/chronometry > /dev/null << 'NGINXEOF'
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

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 10M;
}
NGINXEOF

# Активация
sudo ln -sf /etc/nginx/sites-available/chronometry /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl start nginx
```

---

## Локальная разработка

### Установка

```bash
# Клонирование репозитория
git clone https://github.com/RachoYA/chronometry.git
cd chronometry

# Установка зависимостей
npm install

# Настройка .env
cp .env.example .env
# Отредактируйте .env и добавьте ваш TELEGRAM_BOT_TOKEN
```

### Запуск

```bash
# Telegram бот
npm start

# Веб-сервер (PWA + Админка)
npm run web

# Режим разработки
npm run dev       # Бот с автоперезагрузкой
npm run web:dev   # Веб с автоперезагрузкой
```

---

## Управление на сервере

### PM2 команды

```bash
# Статус
pm2 status

# Логи
pm2 logs chronometry-bot
pm2 logs chronometry-web

# Перезапуск
pm2 restart chronometry-bot
pm2 restart all

# Остановка
pm2 stop all

# Мониторинг
pm2 monit
```

### Обновление кода

```bash
cd /var/www/chronometry
git pull
npm install
pm2 restart all
```

### Просмотр логов Nginx

```bash
sudo tail -f /var/log/nginx/chronometry_access.log
sudo tail -f /var/log/nginx/chronometry_error.log
```

---

## Автоматизация через GitHub Actions

Создайте `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: 89.232.184.218
          username: racho
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /var/www/chronometry
            git pull
            npm install
            pm2 restart all
```

---

## Резервное копирование

### Backup базы данных

```bash
# На сервере
cd /var/www/chronometry
cp data/chronometry.db data/chronometry-backup-$(date +%Y%m%d).db

# Скачать локально
scp racho@89.232.184.218:/var/www/chronometry/data/chronometry.db ./backup/
```

### Backup фотографий

```bash
# Архивация
tar -czf photos-backup.tar.gz photos/

# Скачать
scp racho@89.232.184.218:/var/www/chronometry/photos-backup.tar.gz ./backup/
```

---

## Решение проблем

### Бот не работает

```bash
# Проверка логов
pm2 logs chronometry-bot

# Проверка токена
cat .env | grep TELEGRAM_BOT_TOKEN

# Перезапуск
pm2 restart chronometry-bot
```

### Веб-сервер не отвечает

```bash
# Проверка статуса
pm2 status
sudo systemctl status nginx

# Проверка порта
sudo netstat -tlnp | grep 5000

# Перезапуск
pm2 restart chronometry-web
sudo systemctl restart nginx
```

### 502 Bad Gateway

```bash
# Проверка, запущено ли приложение
pm2 status

# Проверка логов Nginx
sudo tail -f /var/log/nginx/error.log

# Перезапуск всех сервисов
pm2 restart all
sudo systemctl restart nginx
```

---

## Безопасность

### Обновление SSL сертификата

Certbot автоматически обновляет, но можно проверить:

```bash
# Ручное обновление
sudo certbot renew

# Проверка срока действия
sudo certbot certificates
```

### Firewall

```bash
# Разрешить HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Проверка правил
sudo ufw status
```

---

## Мониторинг

### Проверка доступности

```bash
# HTTPS
curl -I https://grachia.ru

# API
curl https://grachia.ru/api/processes
```

### Использование ресурсов

```bash
# Память и CPU
pm2 monit

# Диск
df -h

# Логи в реальном времени
pm2 logs --lines 100
```

---

## GitHub Repository

https://github.com/RachoYA/chronometry

Все обновления автоматически деплоятся через `git pull`.
