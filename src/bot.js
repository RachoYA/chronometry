require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');
const path = require('path');
const fs = require('fs');

const token = process.env.TELEGRAM_BOT_TOKEN;
const dbPath = process.env.DB_PATH || './data/chronometry.db';

if (!token) {
  console.error('ОШИБКА: Токен бота не найден! Создайте файл .env и добавьте TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const db = new Database(dbPath);

// Создаем папку для фотографий
const photosDir = './photos';
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

// Хранилище состояний пользователей
const userStates = new Map();

// Форматирование времени
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}ч ${minutes}м ${secs}с`;
  } else if (minutes > 0) {
    return `${minutes}м ${secs}с`;
  } else {
    return `${secs}с`;
  }
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Главное меню с инлайн кнопками
function getMainMenuKeyboard(hasActiveProcess = false) {
  const keyboard = {
    inline_keyboard: []
  };

  // Web App для работы оффлайн
  keyboard.inline_keyboard.push([{
    text: '📱 Открыть PWA (работает оффлайн)',
    web_app: { url: 'https://grachia.ru/telegram-app.html' }
  }]);

  if (hasActiveProcess) {
    keyboard.inline_keyboard.push(
      [{ text: '⏹ Завершить работу', callback_data: 'stop_work' }],
      [{ text: '⏱ Текущий статус', callback_data: 'status' }]
    );
  } else {
    keyboard.inline_keyboard.push(
      [{ text: '▶️ Начать работу', callback_data: 'start_work' }]
    );
  }

  keyboard.inline_keyboard.push(
    [
      { text: '📋 Процессы', callback_data: 'processes' },
      { text: '📜 История', callback_data: 'history' }
    ],
    [
      { text: '📊 Статистика', callback_data: 'stats' },
      { text: '❓ Помощь', callback_data: 'help' }
    ],
    [{ text: '🔄 Обновить меню', callback_data: 'menu' }]
  );

  return keyboard;
}

// Команда /start и главное меню
async function showMainMenu(chatId, user, messageText = null) {
  const activeRecord = await db.getActiveRecord(user.id);
  const hasActiveProcess = !!activeRecord;

  let message = messageText || `
👋 Система хронометража магазина

${hasActiveProcess ? '🟢 У вас есть активный процесс' : '⚪️ Нет активных процессов'}

Выберите действие:`;

  const keyboard = getMainMenuKeyboard(hasActiveProcess);

  return bot.sendMessage(chatId, message, {
    reply_markup: keyboard,
    parse_mode: 'HTML'
  });
}

bot.onText(/\/start/, async (msg) => {
  const user = await db.getOrCreateUser(msg.from);
  await showMainMenu(msg.chat.id, user, `
👋 Добро пожаловать в систему хронометража!

Этот бот поможет отслеживать время работы над процессами в магазине.

🔸 Работает оффлайн
🔸 Прикрепление фотографий
🔸 Автоматический расчет времени

Выберите действие:`);
});

bot.onText(/\/menu/, async (msg) => {
  const user = await db.getOrCreateUser(msg.from);
  await showMainMenu(msg.chat.id, user);
});

// Обработка всех callback запросов
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const user = await db.getOrCreateUser(query.from);
  const data = query.data;

  try {
    // Главное меню
    if (data === 'menu') {
      await bot.answerCallbackQuery(query.id);
      const activeRecord = await db.getActiveRecord(user.id);
      const hasActiveProcess = !!activeRecord;

      await bot.editMessageText(
        `👋 Главное меню\n\n${hasActiveProcess ? '🟢 У вас есть активный процесс' : '⚪️ Нет активных процессов'}\n\nВыберите действие:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getMainMenuKeyboard(hasActiveProcess)
        }
      );
    }

    // Список процессов
    else if (data === 'processes') {
      const processes = await db.getAllProcesses();
      let message = '📋 ДОСТУПНЫЕ ПРОЦЕССЫ:\n\n';
      processes.forEach((process) => {
        message += `${process.id}. ${process.name}\n`;
        if (process.description) {
          message += `   ${process.description}\n`;
        }
        message += '\n';
      });

      const keyboard = {
        inline_keyboard: [
          [{ text: '◀️ Назад в меню', callback_data: 'menu' }]
        ]
      };

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard
      });
      await bot.answerCallbackQuery(query.id);
    }

    // Начать работу
    else if (data === 'start_work') {
      const activeRecord = await db.getActiveRecord(user.id);
      if (activeRecord) {
        await bot.answerCallbackQuery(query.id, {
          text: '⚠️ У вас уже запущен процесс!',
          show_alert: true
        });
        return;
      }

      const processes = await db.getAllProcesses();
      const keyboard = {
        inline_keyboard: processes.map((process) => [
          {
            text: `${process.name}`,
            callback_data: `start_process_${process.id}`
          }
        ])
      };
      keyboard.inline_keyboard.push([
        { text: '◀️ Назад в меню', callback_data: 'menu' }
      ]);

      await bot.editMessageText('🎯 Выберите процесс для начала работы:', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard
      });
      await bot.answerCallbackQuery(query.id);
    }

    // Запуск конкретного процесса
    else if (data.startsWith('start_process_')) {
      const processId = parseInt(data.replace('start_process_', ''));
      const process = await db.getProcessById(processId);
      const record = await db.startTimeRecord(user.id, processId);

      userStates.set(user.telegram_id, {
        activeRecordId: record.id,
        processId: processId
      });

      const keyboard = getMainMenuKeyboard(true);

      await bot.editMessageText(
        `✅ Начата работа: ${process.name}\n\n` +
        `🕐 Время начала: ${formatDateTime(record.start_time)}\n\n` +
        `Можете отправлять фотографии в процессе работы.\n\n` +
        `Выберите действие:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard
        }
      );
      await bot.answerCallbackQuery(query.id, {
        text: `✅ Начата работа: ${process.name}`,
        show_alert: false
      });
    }

    // Текущий статус
    else if (data === 'status') {
      const activeRecord = await db.getActiveRecord(user.id);
      if (!activeRecord) {
        await bot.answerCallbackQuery(query.id, {
          text: '💤 Нет активного процесса',
          show_alert: true
        });
        return;
      }

      const elapsed = Math.floor((new Date() - new Date(activeRecord.start_time)) / 1000);
      const photos = await db.getRecordPhotos(activeRecord.id);

      let message = `⏱ ТЕКУЩИЙ ПРОЦЕСС\n\n`;
      message += `📌 ${activeRecord.process_name}\n`;
      message += `🕐 Начало: ${formatDateTime(activeRecord.start_time)}\n`;
      message += `⏳ Прошло: ${formatDuration(elapsed)}\n`;
      if (photos.length > 0) {
        message += `📷 Фото: ${photos.length}\n`;
      }
      message += '\n\nВыберите действие:';

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: getMainMenuKeyboard(true)
      });
      await bot.answerCallbackQuery(query.id);
    }

    // Завершить работу
    else if (data === 'stop_work') {
      const activeRecord = await db.getActiveRecord(user.id);
      if (!activeRecord) {
        await bot.answerCallbackQuery(query.id, {
          text: '⚠️ У вас нет активного процесса',
          show_alert: true
        });
        return;
      }

      const keyboard = {
        inline_keyboard: [
          [{ text: '💬 Добавить комментарий', callback_data: 'add_comment' }],
          [{ text: '✅ Завершить без комментария', callback_data: 'finish_no_comment' }],
          [{ text: '◀️ Отмена', callback_data: 'menu' }]
        ]
      };

      userStates.set(user.telegram_id, {
        awaitingComment: false,
        recordId: activeRecord.id,
        processName: activeRecord.process_name
      });

      await bot.editMessageText(
        `📝 Завершение процесса "${activeRecord.process_name}"\n\n` +
        `Хотите добавить комментарий?`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard
        }
      );
      await bot.answerCallbackQuery(query.id);
    }

    // Ожидание комментария
    else if (data === 'add_comment') {
      const state = userStates.get(user.telegram_id);
      if (!state || !state.recordId) {
        await bot.answerCallbackQuery(query.id, {
          text: '⚠️ Ошибка: нет активного процесса',
          show_alert: true
        });
        return;
      }

      userStates.set(user.telegram_id, {
        ...state,
        awaitingComment: true
      });

      await bot.editMessageText(
        `💬 Отправьте комментарий к выполненной работе\n\n` +
        `Или выберите действие:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Отмена', callback_data: 'menu' }]
            ]
          }
        }
      );
      await bot.answerCallbackQuery(query.id);
    }

    // Завершить без комментария
    else if (data === 'finish_no_comment') {
      const state = userStates.get(user.telegram_id);
      if (!state || !state.recordId) {
        await bot.answerCallbackQuery(query.id, {
          text: '⚠️ Ошибка: нет процесса для завершения',
          show_alert: true
        });
        return;
      }

      await finishTimeRecord(chatId, messageId, user, state.recordId, null);
      userStates.delete(user.telegram_id);
      await bot.answerCallbackQuery(query.id, { text: '✅ Работа завершена!' });
    }

    // История
    else if (data === 'history') {
      const records = await db.getUserRecords(user.id, 10);
      if (records.length === 0) {
        await bot.answerCallbackQuery(query.id, {
          text: '📭 История пуста',
          show_alert: true
        });
        return;
      }

      let message = `📜 ИСТОРИЯ РАБОТЫ (последние 10)\n\n`;
      for (const record of records) {
        message += `📌 ${record.process_name}\n`;
        message += `🕐 ${formatDateTime(record.start_time)}\n`;
        if (record.duration) {
          message += `⏱ ${formatDuration(record.duration)}\n`;
        } else {
          message += `⏱ В процессе...\n`;
        }
        if (record.comment) {
          message += `💬 ${record.comment}\n`;
        }
        message += '\n';
      }

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '◀️ Назад в меню', callback_data: 'menu' }]
          ]
        }
      });
      await bot.answerCallbackQuery(query.id);
    }

    // Статистика
    else if (data === 'stats') {
      const stats = await db.getRecordStats(user.id, 7);
      if (stats.length === 0) {
        await bot.answerCallbackQuery(query.id, {
          text: '📊 Нет данных за последние 7 дней',
          show_alert: true
        });
        return;
      }

      let totalDuration = 0;
      let message = `📊 СТАТИСТИКА ЗА 7 ДНЕЙ\n\n`;

      stats.forEach((stat) => {
        totalDuration += stat.total_duration;
        message += `📌 ${stat.name}\n`;
        message += `   Раз: ${stat.count}\n`;
        message += `   Время: ${formatDuration(stat.total_duration)}\n\n`;
      });

      message += `⏱ ОБЩЕЕ ВРЕМЯ: ${formatDuration(totalDuration)}`;

      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '◀️ Назад в меню', callback_data: 'menu' }]
          ]
        }
      });
      await bot.answerCallbackQuery(query.id);
    }

    // Помощь
    else if (data === 'help') {
      const helpMessage = `
📖 ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ

1️⃣ Начало работы:
   Нажмите "▶️ Начать работу" и выберите процесс

2️⃣ Во время работы:
   • Отправьте фото для документирования
   • Бот сохранит все фотографии
   • Проверяйте статус через "⏱ Текущий статус"

3️⃣ Завершение:
   Нажмите "⏹ Завершить работу"
   • Можно добавить комментарий
   • Или завершить без комментария

4️⃣ Просмотр данных:
   • 📜 История - последние записи
   • 📊 Статистика - аналитика за 7 дней

💡 ОФФЛАЙН РЕЖИМ:
Бот работает на сервере с локальной базой данных SQLite. Все данные сохраняются мгновенно на диске сервера. Вам нужен интернет только для отправки сообщений в Telegram, но данные хранятся локально и надежно.

📱 WEB APP (ОФФЛАЙН):
Нажмите "📱 Открыть приложение (оффлайн)" чтобы использовать полноценное PWA приложение прямо в Telegram! Оно работает даже без интернета благодаря Service Worker.

📷 Фотографии скачиваются и сохраняются на сервере автоматически.
`;

      await bot.editMessageText(helpMessage, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '◀️ Назад в меню', callback_data: 'menu' }]
          ]
        }
      });
      await bot.answerCallbackQuery(query.id);
    }

  } catch (error) {
    console.error('Ошибка обработки callback:', error);
    await bot.answerCallbackQuery(query.id, {
      text: '❌ Произошла ошибка',
      show_alert: true
    });
  }
});

// Функция завершения записи
async function finishTimeRecord(chatId, messageId, user, recordId, comment) {
  try {
    const result = await db.stopTimeRecord(recordId, comment);
    const photos = await db.getRecordPhotos(recordId);

    // Получаем завершенную запись
    const records = await db.getUserRecords(user.id, 1);
    const finishedRecord = records[0];

    let message = `✅ Работа завершена!\n\n`;
    message += `📌 ${finishedRecord.process_name}\n`;
    message += `📊 Длительность: ${formatDuration(result.duration)}\n`;
    if (comment) {
      message += `💬 Комментарий: ${comment}\n`;
    }
    if (photos.length > 0) {
      message += `📷 Фотографий: ${photos.length}\n`;
    }
    message += '\n\nВыберите действие:';

    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: getMainMenuKeyboard(false)
    });
  } catch (error) {
    console.error('Ошибка завершения записи:', error);
    await bot.sendMessage(chatId, '❌ Ошибка при завершении работы');
  }
}

// Обработка фотографий
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const user = await db.getOrCreateUser(msg.from);
  const state = userStates.get(user.telegram_id);

  // Если ожидаем комментарий, игнорируем фото
  if (state && state.awaitingComment) {
    return;
  }

  const activeRecord = await db.getActiveRecord(user.id);
  if (!activeRecord) {
    const keyboard = getMainMenuKeyboard(false);
    await bot.sendMessage(
      chatId,
      '⚠️ Нет активного процесса. Начните работу для прикрепления фото.\n\nВыберите действие:',
      { reply_markup: keyboard }
    );
    return;
  }

  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;

  try {
    // Скачиваем фото
    const file = await bot.getFile(fileId);
    const filePath = path.join(photosDir, `${Date.now()}_${file.file_path.split('/').pop()}`);
    const fileStream = fs.createWriteStream(filePath);

    const https = require('https');
    https.get(`https://api.telegram.org/file/bot${token}/${file.file_path}`, (response) => {
      response.pipe(fileStream);
      fileStream.on('finish', async () => {
        fileStream.close();

        // Сохраняем в БД
        const comment = msg.caption || null;
        await db.addPhoto(activeRecord.id, fileId, filePath, comment);

        const keyboard = getMainMenuKeyboard(true);
        await bot.sendMessage(
          chatId,
          `✅ Фото добавлено к процессу "${activeRecord.process_name}"\n\nВыберите действие:`,
          { reply_markup: keyboard }
        );
      });
    });
  } catch (error) {
    console.error('Ошибка сохранения фото:', error);
    await bot.sendMessage(chatId, '❌ Ошибка сохранения фото');
  }
});

// Обработка текстовых сообщений (для комментариев)
bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  if (msg.photo) return;

  const chatId = msg.chat.id;
  const user = await db.getOrCreateUser(msg.from);
  const state = userStates.get(user.telegram_id);

  if (state && state.awaitingComment && state.recordId) {
    // Отправляем новое сообщение с результатом
    const result = await db.stopTimeRecord(state.recordId, msg.text);
    const photos = await db.getRecordPhotos(state.recordId);

    let message = `✅ Работа завершена!\n\n`;
    message += `📌 ${state.processName}\n`;
    message += `📊 Длительность: ${formatDuration(result.duration)}\n`;
    message += `💬 Комментарий: ${msg.text}\n`;
    if (photos.length > 0) {
      message += `📷 Фотографий: ${photos.length}\n`;
    }
    message += '\n\nВыберите действие:';

    await bot.sendMessage(chatId, message, {
      reply_markup: getMainMenuKeyboard(false)
    });

    userStates.delete(user.telegram_id);
  }
});

// Quick commands для быстрого доступа
bot.onText(/\/quick(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const user = await db.getOrCreateUser(msg.from.id, msg.from.first_name);
  const processId = match[1];

  if (!processId) {
    bot.sendMessage(chatId, '❌ Укажите номер процесса: /quick 1');
    return;
  }

  const process = await db.getProcess(parseInt(processId));
  if (!process) {
    bot.sendMessage(chatId, '❌ Процесс не найден');
    return;
  }

  const activeRecord = await db.getActiveRecord(user.id);
  if (activeRecord) {
    bot.sendMessage(chatId, '❌ У вас уже есть активный процесс. Завершите его сначала.');
    return;
  }

  const recordId = await db.createRecord(user.id, process.id);
  const state = { activeRecordId: recordId, processName: process.name };
  userStates.set(user.id, state);

  await bot.sendMessage(chatId, `✅ Процесс "${process.name}" запущен!\n\n⏱ Время пошло. Успешной работы!`);
  await showMainMenu(chatId, user);
});

bot.onText(/\/done(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const user = await db.getOrCreateUser(msg.from.id, msg.from.first_name);
  const comment = match[1] || '';

  const activeRecord = await db.getActiveRecord(user.id);
  if (!activeRecord) {
    bot.sendMessage(chatId, '❌ Нет активного процесса');
    return;
  }

  await db.completeRecord(activeRecord.id, comment);
  userStates.delete(user.id);

  const duration = Math.floor((Date.now() - new Date(activeRecord.start_time).getTime()) / 1000);
  await bot.sendMessage(chatId,
    `✅ Процесс "${activeRecord.process_name}" завершен!\n\n` +
    `⏱ Время работы: ${formatDuration(duration)}\n` +
    (comment ? `💬 Комментарий: ${comment}` : '')
  );
  await showMainMenu(chatId, user);
});

console.log('🤖 Бот запущен и готов к работе!');
console.log('📱 Все управление через инлайн кнопки');
console.log('⚡️ Quick commands: /quick [номер], /done [комментарий]');
console.log('💾 Оффлайн режим: данные сохраняются в SQLite локально');

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Остановка бота...');
  db.close();
  process.exit(0);
});
