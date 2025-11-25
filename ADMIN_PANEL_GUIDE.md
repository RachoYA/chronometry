# Админ-панель для управления процессами

## ✅ Что создано:

### 1. **Расширенная база данных** (`src/database-admin.js`)

Новые таблицы:
- `process_categories` - категории процессов
- `process_steps` - шаги последовательных процессов
- `step_completions` - отслеживание выполнения шагов

Новые поля в `processes`:
- `category_id` - категория процесса
- `estimated_duration` - ожидаемое время выполнения
- `priority` - приоритет (0-10)
- `is_sequential` - флаг последовательного процесса
- `is_active` - активен ли процесс

### 2. **Админ-панель** (`public/admin.html`)

Интерфейс для:
- Создания/редактирования/удаления процессов
- Добавления шагов к процессам
- Управления категориями
- Управления пользователями и ролями

### 3. **Как использовать:**

#### Запуск с обновленной БД:

```bash
# Остановите текущие процессы
pkill -f "node.*server.js"
pkill -f "node.*bot.js"

# Обновите server.js чтобы использовать DatabaseAdmin вместо Database
# Перезапустите сервисы
npm run web  # PWA с админ-панелью
npm start    # Telegram бот
```

#### Доступ к админ-панели:

```
http://localhost:5000/admin.html
```

## Структура сложного процесса:

### Пример: "Приемка товара" (последовательный)

```javascript
{
  name: "Приемка товара",
  description: "Полный цикл приемки",
  category: "Логистика",
  estimated_duration: 45, // минут
  priority: 8,
  is_sequential: true,
  steps: [
    {
      step_number: 1,
      name: "Проверка документов",
      description: "Сверка накладной с заказом",
      estimated_duration: 5,
      requires_photo: true,
      photo_instructions: "Сфотографируйте накладную",
      is_required: true
    },
    {
      step_number: 2,
      name: "Разгрузка товара",
      description: "Выгрузка из транспорта",
      estimated_duration: 15,
      requires_photo: false,
      is_required: true
    },
    {
      step_number: 3,
      name: "Проверка качества",
      description: "Осмотр товара на повреждения",
      estimated_duration: 10,
      requires_photo: true,
      photo_instructions: "Сфотографируйте товар",
      is_required: true
    },
    {
      step_number: 4,
      name: "Размещение на складе",
      description: "Распределение по зонам хранения",
      estimated_duration: 10,
      requires_photo: false,
      is_required: true
    },
    {
      step_number: 5,
      name: "Внесение в систему",
      description: "Обновление базы данных склада",
      estimated_duration: 5,
      requires_photo: false,
      is_required: true
    }
  ]
}
```

## API Endpoints (нужно добавить в server.js):

### Процессы:
- `GET /api/admin/processes` - все процессы с шагами
- `GET /api/admin/processes/:id` - один процесс
- `POST /api/admin/processes` - создать процесс
- `PUT /api/admin/processes/:id` - обновить процесс
- `DELETE /api/admin/processes/:id` - удалить процесс

### Шаги:
- `POST /api/admin/process-steps` - добавить шаг
- `PUT /api/admin/process-steps/:id` - обновить шаг
- `DELETE /api/admin/process-steps/:id` - удалить шаг

### Категории:
- `GET /api/admin/categories` - все категории
- `POST /api/admin/categories` - создать категорию

### Пользователи:
- `GET /api/admin/users` - все пользователи
- `PUT /api/admin/users/:id/role` - изменить роль

## Интеграция с PWA:

В `public/app.js` процессы теперь будут загружаться с шагами:

```javascript
// При запуске процесса
const process = await getProcessWithSteps(processId);

if (process.is_sequential && process.steps.length > 0) {
  // Показываем чек-лист шагов
  showStepChecklist(process.steps);
} else {
  // Обычный процесс без шагов
  startSimpleProcess(process);
}
```

## Интеграция с Telegram ботом:

При выборе последовательного процесса бот будет:

1. Показывать список шагов
2. Отмечать выполненные шаги
3. Требовать фото на определенных этапах
4. Показывать прогресс (Шаг 2/5)

```javascript
// В bot.js
if (process.is_sequential) {
  const steps = await db.getProcessSteps(process.id);
  showProcessSteps(chatId, steps, record.id);
} else {
  startRegularProcess(chatId, process);
}
```

## Система ролей:

- **admin** - полный доступ к админ-панели
- **user** - только работа с процессами

Первый зарегистрированный пользователь автоматически становится админом.

## TODO для полной реализации:

1. ✅ Создана расширенная БД (`database-admin.js`)
2. ✅ Создан HTML админ-панели (`admin.html`)
3. ⏳ Нужно создать `public/admin.js` - JavaScript для админ-панели
4. ⏳ Нужно обновить `server.js` - добавить API endpoints
5. ⏳ Нужно обновить `public/app.js` - поддержка шагов в PWA
6. ⏳ Нужно обновить `src/bot.js` - поддержка шагов в Telegram

## Быстрый старт:

1. Обновите `server.js`, заменив:
```javascript
const Database = require('./src/database');
```
на:
```javascript
const DatabaseAdmin = require('./src/database-admin');
```

2. Перезапустите сервер:
```bash
npm run web
```

3. Откройте админ-панель:
```
http://localhost:5000/admin.html
```

4. Создайте процесс с шагами!

---

**Примечание:** Из-за ограничений длины ответа, полный код JavaScript админ-панели и обновленный server.js нужно будет создать отдельно. Основная структура и логика уже готовы в database-admin.js.
