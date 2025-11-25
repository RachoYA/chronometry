#!/bin/bash

# Скрипт для выполнения на сервере

# Установка Node.js и PM2 (если еще не установлены)
if ! command -v node &> /dev/null; then
    echo "📦 Установка Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

if ! command -v pm2 &> /dev/null; then
    echo "📦 Установка PM2..."
    sudo npm install -g pm2
fi

echo "✅ Node.js $(node --version) и PM2 установлены"

# Создание и настройка директории
echo "📁 Создание директории приложения..."
sudo mkdir -p /var/www/chronometry
sudo chown $USER:$USER /var/www/chronometry

cd /var/www/chronometry

# Распаковка архива
echo "📦 Распаковка архива..."
tar -xzf ~/chronometry.tar.gz

# Установка зависимостей
echo "📦 Установка зависимостей..."
npm install --production

# Создание необходимых директорий
mkdir -p data photos

# Обновление bot.js с HTTPS URL
echo "🔧 Обновление URL в боте..."
sed -i 's|// keyboard.inline_keyboard.push(\[{|keyboard.inline_keyboard.push([{|g' src/bot.js
sed -i "s|//   text: '📱 Открыть приложение (оффлайн)',|  text: '📱 Открыть приложение (оффлайн)',|g" src/bot.js
sed -i "s|//   web_app: { url: 'https://ВАШ_ДОМЕН/telegram-app.html' }|  web_app: { url: 'https://grachia.ru/telegram-app.html' }|g" src/bot.js
sed -i 's|// }]\);|}]);|g' src/bot.js

# Проверка изменений
echo "✅ Проверка изменений в bot.js:"
grep -A 3 "web_app:" src/bot.js || echo "⚠️ Изменения не применились, требуется ручная правка"

# Остановка старых процессов
echo "🔄 Остановка старых процессов..."
pm2 delete chronometry-bot chronometry-web 2>/dev/null || true

# Запуск приложений
echo "🚀 Запуск приложений..."
pm2 start src/bot.js --name "chronometry-bot"
pm2 start server.js --name "chronometry-web"

# Сохранение конфигурации
pm2 save

# Настройка автозапуска
pm2 startup | tail -1 > /tmp/pm2-startup.sh
chmod +x /tmp/pm2-startup.sh
sudo /tmp/pm2-startup.sh

echo ""
echo "✅ Приложения запущены!"
pm2 status

echo ""
echo "📋 Проверьте логи:"
echo "pm2 logs chronometry-bot --lines 10"
echo "pm2 logs chronometry-web --lines 10"

echo ""
echo "⚠️ ВАЖНО: Теперь настройте Nginx!"
echo "Используйте конфигурацию из DEPLOY_GUIDE.md"
