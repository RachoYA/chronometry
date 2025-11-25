const express = require('express');
const path = require('path');
const DatabaseAdmin = require('./src/database-admin');

const app = express();
const PORT = process.env.PORT || 5000;
const dbPath = process.env.DB_PATH || './data/chronometry.db';
const db = new DatabaseAdmin(dbPath);

// Делаем первого пользователя админом
setTimeout(() => {
  db.makeFirstUserAdmin().then(() => {
    console.log('✅ Первый пользователь установлен как админ');
  });
}, 1000);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// API для синхронизации (когда появится интернет)
app.post('/api/sync/records', async (req, res) => {
    try {
        const { userId, records } = req.body;

        // Сохраняем записи в SQLite
        for (const record of records) {
            if (!record.synced) {
                await db.startTimeRecord(userId, record.processId);
                // TODO: обновить запись с временем окончания и комментарием
            }
        }

        res.json({ success: true, message: 'Данные синхронизированы' });
    } catch (error) {
        console.error('Ошибка синхронизации:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для получения статистики
app.get('/api/stats/:userId', async (req, res) => {
    try {
        const { userId} = req.params;
        const stats = await db.getRecordStats(parseInt(userId), 7);
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ADMIN API ============

// Процессы
app.get('/api/admin/processes', async (req, res) => {
    try {
        const processes = await db.getAllProcessesWithSteps();
        res.json(processes);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/processes/:id', async (req, res) => {
    try {
        const process = await db.getProcessWithSteps(parseInt(req.params.id));
        res.json(process);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/processes', async (req, res) => {
    try {
        const result = await db.createProcess(req.body);
        const processId = result.id;

        // Создаем шаги если есть
        if (req.body.steps && req.body.steps.length > 0) {
            for (const step of req.body.steps) {
                await db.createProcessStep({ ...step, process_id: processId });
            }
        }

        res.json({ success: true, id: processId });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/processes/:id', async (req, res) => {
    try {
        const processId = parseInt(req.params.id);
        await db.updateProcess(processId, req.body);

        // Удаляем старые шаги и создаем новые
        if (req.body.steps) {
            // TODO: можно оптимизировать через обновление существующих
            const oldSteps = await db.getProcessSteps(processId);
            for (const step of oldSteps) {
                await db.deleteProcessStep(step.id);
            }

            for (const step of req.body.steps) {
                await db.createProcessStep({ ...step, process_id: processId });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/processes/:id', async (req, res) => {
    try {
        await db.deleteProcess(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Категории
app.get('/api/admin/categories', async (req, res) => {
    try {
        const categories = await db.getAllCategories();
        res.json(categories);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/categories', async (req, res) => {
    try {
        const { name, icon, color } = req.body;
        const result = await db.createCategory(name, icon, color);
        res.json({ success: true, id: result.id });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Пользователи
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/users/:id/role', async (req, res) => {
    try {
        const { role } = req.body;
        await db.setUserRole(parseInt(req.params.id), role);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Все остальные запросы отправляем на index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🌐 Веб-сервер запущен: http://localhost:${PORT}`);
    console.log(`👤 PWA приложение: http://localhost:${PORT}`);
    console.log(`👑 Админ-панель: http://localhost:${PORT}/admin.html`);
    console.log(`💾 Работает с оффлайн режимом через Service Worker`);
    console.log(`📊 База данных: ${dbPath}`);
    console.log('');
    console.log('💡 Для установки на телефон:');
    console.log('   1. Откройте в браузере (Chrome/Safari)');
    console.log('   2. Нажмите "Добавить на главный экран"');
    console.log('   3. Приложение будет работать как нативное!');
    console.log('');
    console.log('🔧 Админ-панель:');
    console.log('   - Создавайте процессы с последовательными шагами');
    console.log('   - Управляйте категориями и пользователями');
    console.log('   - Настраивайте обязательные фотографии');
});

process.on('SIGINT', () => {
    console.log('\n🛑 Остановка сервера...');
    db.close();
    process.exit(0);
});
