# Используем официальный Node.js образ
FROM node:20-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Создаем non-root пользователя для безопасности
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Меняем владельца файлов
RUN chown -R nodejs:nodejs /app

# Переключаемся на non-root пользователя
USER nodejs

# Открываем порт
EXPOSE 5000

# Переменные окружения по умолчанию
ENV NODE_ENV=production
ENV PORT=5000

# Запускаем приложение
CMD ["node", "server.js"]
