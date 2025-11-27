# Chronometry - Система хронометража магазина

Веб-приложение для отслеживания времени выполнения процессов в магазине с поддержкой PWA, оффлайн режима и детальной аналитики.

## Архитектура

```
chronometry/
├── server.js              # Express сервер с REST API
├── src/
│   └── database.js        # PostgreSQL слой (все методы БД)
├── public/
│   ├── index.html         # PWA приложение (для сотрудников)
│   ├── app.js             # Логика PWA + IndexedDB
│   ├── styles.css         # Стили приложения
│   ├── admin.html         # Админ-панель
│   ├── admin.js           # Логика админки
│   ├── admin-styles.css   # Стили админки
│   ├── sw.js              # Service Worker (оффлайн)
│   └── manifest.json      # PWA манифест
├── tests/
│   ├── unit/              # Jest юнит-тесты
│   │   ├── database.test.js
│   │   └── server.test.js
│   └── e2e/               # Playwright E2E тесты
│       ├── auth.spec.js
│       ├── pwa.spec.js
│       └── admin.spec.js
├── jest.config.js         # Конфигурация Jest
├── playwright.config.js   # Конфигурация Playwright
├── docker-compose.yml     # Docker для деплоя
└── Dockerfile
```

## Технологии

**Backend:**
- Node.js + Express
- PostgreSQL
- bcrypt для хеширования паролей

**Frontend:**
- PWA (Progressive Web App)
- IndexedDB для оффлайн хранения
- Service Worker для кэширования

**Тестирование:**
- Jest для юнит-тестов (141 тест, 99% покрытие database.js)
- Playwright для E2E тестов

## Функции

### PWA приложение (для сотрудников)
- Авторизация с регистрацией (требуется подтверждение админом)
- Запуск процессов (свободный или по назначениям)
- Многошаговые процессы с таймингом по шагам
- Прикрепление фото к процессам
- Оффлайн режим с автосинхронизацией
- Статистика за день

### Админ-панель
- Управление пользователями (подтверждение, роли)
- Управление процессами и категориями
- Управление группами пользователей
- Управление объектами (магазины/склады)
- Создание назначений (задания для сотрудников)
- Детальная аналитика

## Схема базы данных

```
users                    # Пользователи
  - id, username, password, first_name, role, status

process_categories       # Категории процессов
  - id, name, icon, color

processes               # Процессы
  - id, name, description, category_id, is_sequential

process_steps           # Шаги процессов
  - id, process_id, step_number, name, requires_photo

time_records            # Записи времени
  - id, user_id, process_id, object_id, assignment_id, start_time, end_time

step_timings            # Тайминги по шагам
  - id, time_record_id, step_id, start_time, end_time, duration

user_groups             # Группы пользователей
  - id, name, description, color

user_group_members      # Участники групп
  - user_id, group_id

objects                 # Объекты (магазины)
  - id, name, address, description

assignments             # Назначения (задания)
  - id, name, process_id, object_id, user_id/group_id, priority

photos                  # Фотографии
  - id, record_id, step_id, file_data
```

## Установка и запуск

### Локальная разработка

```bash
# Установка зависимостей
npm install

# Создание .env файла
cp .env.example .env
# Настройте DATABASE_URL для PostgreSQL

# Запуск сервера
npm start

# Или с автоперезагрузкой
npm run dev
```

### Docker деплой

```bash
docker-compose up -d --build
```

## Тестирование

```bash
# Юнит тесты
npm run test:unit

# E2E тесты
npm run test:e2e

# Все тесты
npm run test:all
```

## API Endpoints

### Авторизация
- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `POST /api/auth/logout` - Выход
- `GET /api/auth/me` - Текущий пользователь

### Пользовательские API
- `GET /api/processes` - Список процессов
- `GET /api/assignments` - Мои назначения
- `GET /api/objects` - Список объектов
- `POST /api/records/start` - Начать запись
- `POST /api/records/:id/stop` - Остановить запись
- `POST /api/records/:id/steps/:stepId/start` - Начать шаг
- `POST /api/step-timings/:id/stop` - Завершить шаг
- `POST /api/records/:id/photos` - Загрузить фото

### Админские API
- `GET/POST/PUT/DELETE /api/admin/processes` - CRUD процессов
- `GET/POST/PUT/DELETE /api/admin/users` - CRUD пользователей
- `GET/POST/PUT/DELETE /api/admin/groups` - CRUD групп
- `GET/POST/PUT/DELETE /api/admin/objects` - CRUD объектов
- `GET/POST/PUT/DELETE /api/admin/assignments` - CRUD назначений
- `GET /api/admin/analytics/*` - Аналитика

## Доступы

- **PWA**: http://localhost:5000
- **Админка**: http://localhost:5000/admin.html
- **Логин админа по умолчанию**: admin / admin

## Переменные окружения

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/chronometry
DATABASE_SSL=false  # true для внешних провайдеров
```

## Лицензия

ISC
