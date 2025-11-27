require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Database = require('./src/database');

const app = express();
const PORT = process.env.PORT || 5000;
const db = new Database();

// Простое хранилище сессий (в production использовать Redis)
const sessions = new Map();

// Middleware
app.use(express.json({ limit: '10mb' })); // Увеличиваем лимит для фото
app.use(express.static('public'));

// Утилиты для работы с паролями
async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Создаем админа по умолчанию при старте
async function createDefaultAdmin() {
    try {
        const existing = await db.getUserByUsername('admin');
        if (!existing) {
            const hashedPassword = await hashPassword('admin');
            await db.createUser({
                username: 'admin',
                password: hashedPassword,
                firstName: 'Администратор',
                role: 'admin',
                status: 'approved'
            });
            console.log('✅ Админ по умолчанию создан (admin/admin)');
        } else {
            console.log('ℹ️ Админ уже существует');
        }
    } catch (err) {
        console.error('Ошибка создания админа:', err);
    }
}

// ============ AUTH MIDDLEWARE ============

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const session = sessions.get(token);
    if (!session) {
        return res.status(401).json({ error: 'Недействительный токен' });
    }

    req.user = session;
    next();
}

function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Требуются права администратора' });
    }
    next();
}

function approvedMiddleware(req, res, next) {
    if (req.user.status !== 'approved' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Аккаунт ожидает подтверждения администратором' });
    }
    next();
}

// ============ AUTH API ============

// Регистрация нового пользователя
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, firstName } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        if (username.length < 3 || password.length < 4) {
            return res.status(400).json({ error: 'Логин минимум 3 символа, пароль минимум 4' });
        }

        const existingUser = await db.getUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        }

        const hashedPassword = await hashPassword(password);
        const result = await db.createUser({
            username,
            password: hashedPassword,
            firstName: firstName || username,
            role: 'user',
            status: 'pending'
        });

        res.json({
            success: true,
            message: 'Регистрация успешна. Ожидайте подтверждения администратором.',
            userId: result.id
        });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: error.message });
    }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }

        const user = await db.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        const isValidPassword = await comparePassword(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        // Проверяем статус пользователя
        if (user.status === 'pending') {
            return res.status(403).json({
                error: 'Ваш аккаунт ожидает подтверждения администратором',
                status: 'pending'
            });
        }

        if (user.status === 'rejected') {
            return res.status(403).json({
                error: 'Ваш аккаунт отклонен администратором',
                status: 'rejected'
            });
        }

        const token = generateToken();
        sessions.set(token, {
            id: user.id,
            username: user.username,
            firstName: user.first_name,
            role: user.role,
            status: user.status
        });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                firstName: user.first_name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: error.message });
    }
});

// Выход
app.post('/api/auth/logout', authMiddleware, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    sessions.delete(token);
    res.json({ success: true });
});

// Проверка токена
app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// ============ USER API (для PWA) ============

// Получить процессы (для авторизованных пользователей)
app.get('/api/processes', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const processes = await db.getAllProcessesWithSteps();
        res.json(processes);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// API для синхронизации записей
app.post('/api/sync/records', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const { records } = req.body;
        const userId = req.user.id;

        for (const record of records) {
            if (!record.synced) {
                await db.syncTimeRecord(userId, record);
            }
        }

        res.json({ success: true, message: 'Данные синхронизированы' });
    } catch (error) {
        console.error('Ошибка синхронизации:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API для получения статистики пользователя
app.get('/api/stats', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const stats = await db.getRecordStats(req.user.id, 7);
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ADMIN API ============

// Процессы
app.get('/api/admin/processes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const processes = await db.getAllProcessesWithSteps();
        res.json(processes);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/processes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const process = await db.getProcessWithSteps(parseInt(req.params.id));
        res.json(process);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/processes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.createProcess(req.body);
        const processId = result.id;

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

app.put('/api/admin/processes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const processId = parseInt(req.params.id);
        await db.updateProcess(processId, req.body);

        if (req.body.steps) {
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

app.delete('/api/admin/processes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.deleteProcess(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Категории
app.get('/api/admin/categories', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const categories = await db.getAllCategories();
        res.json(categories);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/categories', authMiddleware, adminMiddleware, async (req, res) => {
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
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json(users);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { role } = req.body;
        await db.setUserRole(parseInt(req.params.id), role);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Подтверждение/отклонение пользователя
app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['approved', 'rejected', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'Недопустимый статус' });
        }
        await db.setUserStatus(parseInt(req.params.id), status);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Удаление пользователя
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'Нельзя удалить самого себя' });
        }
        await db.deleteUser(userId);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ANALYTICS API ============

app.get('/api/admin/analytics/records', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate, userId, processId, limit = 100 } = req.query;
        const records = await db.getAllRecordsForAnalytics(startDate, endDate, userId, processId, parseInt(limit));
        res.json(records);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/analytics/summary', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const summary = await db.getAnalyticsSummary(startDate, endDate);
        res.json(summary);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/analytics/by-process', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await db.getStatsByProcess(startDate, endDate);
        res.json(stats);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/analytics/by-user', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await db.getStatsByUser(startDate, endDate);
        res.json(stats);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Детальная аналитика по процессу
app.get('/api/admin/analytics/process/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const analytics = await db.getProcessDetailedAnalytics(parseInt(req.params.id), startDate, endDate);
        res.json(analytics);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Аналитика по объекту
app.get('/api/admin/analytics/object/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const analytics = await db.getObjectAnalytics(parseInt(req.params.id), startDate, endDate);
        res.json(analytics);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Аналитика по группе
app.get('/api/admin/analytics/group/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const analytics = await db.getGroupAnalytics(parseInt(req.params.id), startDate, endDate);
        res.json(analytics);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ GROUPS API ============

app.get('/api/admin/groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const groups = await db.getAllGroups();
        res.json(groups);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const group = await db.getGroupById(parseInt(req.params.id));
        if (group) {
            group.members = await db.getGroupMembers(parseInt(req.params.id));
        }
        res.json(group);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.createGroup(req.body);
        res.json({ success: true, id: result.id });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.updateGroup(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.deleteGroup(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Участники группы
app.post('/api/admin/groups/:id/members', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        await db.addUserToGroup(userId, parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/groups/:groupId/members/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.removeUserFromGroup(parseInt(req.params.userId), parseInt(req.params.groupId));
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ OBJECTS API ============

app.get('/api/admin/objects', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const objects = await db.getAllObjects();
        res.json(objects);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/objects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const object = await db.getObjectById(parseInt(req.params.id));
        res.json(object);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/objects', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.createObject(req.body);
        res.json({ success: true, id: result.id });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/objects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.updateObject(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/objects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.deleteObject(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ ASSIGNMENTS API ============

app.get('/api/admin/assignments', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const assignments = await db.getAllAssignments();
        res.json(assignments);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/assignments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const assignment = await db.getAssignmentById(parseInt(req.params.id));
        res.json(assignment);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/admin/assignments', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.createAssignment(req.body);
        res.json({ success: true, id: result.id });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/assignments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.updateAssignment(parseInt(req.params.id), req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/admin/assignments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.deleteAssignment(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ USER API (расширенный для PWA) ============

// Получить назначения для текущего пользователя
app.get('/api/assignments', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const assignments = await db.getUserAssignments(req.user.id);
        res.json(assignments);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить объекты (для выбора при записи)
app.get('/api/objects', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const objects = await db.getAllObjects();
        res.json(objects);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Начать запись времени с контекстом (объект, назначение)
app.post('/api/records/start', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const { processId, objectId, assignmentId } = req.body;
        const result = await db.startTimeRecordWithContext(req.user.id, processId, objectId, assignmentId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Остановить запись времени
app.post('/api/records/:id/stop', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const { comment } = req.body;
        const result = await db.stopTimeRecord(parseInt(req.params.id), comment);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Тайминг шагов
app.post('/api/records/:recordId/steps/:stepId/start', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const result = await db.startStepTiming(parseInt(req.params.recordId), parseInt(req.params.stepId));
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/step-timings/:id/stop', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const result = await db.stopStepTiming(parseInt(req.params.id));
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Загрузка фото
app.post('/api/records/:recordId/photos', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const { stepId, fileData, comment } = req.body;
        const result = await db.savePhoto(parseInt(req.params.recordId), stepId, fileData, comment);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить фото записи
app.get('/api/records/:recordId/photos', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const photos = await db.getRecordPhotos(parseInt(req.params.recordId));
        res.json(photos);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Получить тайминги шагов для записи
app.get('/api/records/:recordId/step-timings', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
        const timings = await db.getStepTimings(parseInt(req.params.recordId));
        res.json(timings);
    } catch (error) {
        console.error('Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

// Все остальные запросы отправляем на index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Инициализация и запуск сервера
async function start() {
    try {
        await db.initTables();
        await createDefaultAdmin();

        app.listen(PORT, () => {
            console.log(`🌐 Веб-сервер запущен: http://localhost:${PORT}`);
            console.log(`👤 PWA приложение: http://localhost:${PORT}`);
            console.log(`👑 Админ-панель: http://localhost:${PORT}/admin.html`);
            console.log(`🔐 Авторизация: admin / admin`);
        });
    } catch (error) {
        console.error('Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

start();

process.on('SIGINT', async () => {
    console.log('\n🛑 Остановка сервера...');
    await db.close();
    process.exit(0);
});
