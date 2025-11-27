const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Мок для Database
jest.mock('../../src/database');

const Database = require('../../src/database');

// Мокаем методы базы данных
const mockDb = {
  initTables: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  getUserByUsername: jest.fn(),
  getUserById: jest.fn(),
  createUser: jest.fn(),
  getAllUsers: jest.fn(),
  setUserRole: jest.fn(),
  setUserStatus: jest.fn(),
  deleteUser: jest.fn(),
  getAllCategories: jest.fn(),
  createCategory: jest.fn(),
  getAllProcesses: jest.fn(),
  getAllProcessesWithSteps: jest.fn(),
  getProcessWithSteps: jest.fn(),
  createProcess: jest.fn(),
  updateProcess: jest.fn(),
  deleteProcess: jest.fn(),
  getProcessSteps: jest.fn(),
  createProcessStep: jest.fn(),
  deleteProcessStep: jest.fn(),
  getAllGroups: jest.fn(),
  getGroupById: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  getGroupMembers: jest.fn(),
  addUserToGroup: jest.fn(),
  removeUserFromGroup: jest.fn(),
  getAllObjects: jest.fn(),
  getObjectById: jest.fn(),
  createObject: jest.fn(),
  updateObject: jest.fn(),
  deleteObject: jest.fn(),
  getAllAssignments: jest.fn(),
  getAssignmentById: jest.fn(),
  createAssignment: jest.fn(),
  updateAssignment: jest.fn(),
  deleteAssignment: jest.fn(),
  getUserAssignments: jest.fn(),
  startTimeRecordWithContext: jest.fn(),
  stopTimeRecord: jest.fn(),
  startStepTiming: jest.fn(),
  stopStepTiming: jest.fn(),
  getStepTimings: jest.fn(),
  savePhoto: jest.fn(),
  getRecordPhotos: jest.fn(),
  syncTimeRecord: jest.fn(),
  getRecordStats: jest.fn(),
  getAllRecordsForAnalytics: jest.fn(),
  getAnalyticsSummary: jest.fn(),
  getStatsByProcess: jest.fn(),
  getStatsByUser: jest.fn(),
  getProcessDetailedAnalytics: jest.fn(),
  getObjectAnalytics: jest.fn(),
  getGroupAnalytics: jest.fn()
};

Database.mockImplementation(() => mockDb);

// Хранилище сессий для тестов
const sessions = new Map();

// Создаём приложение для тестов
function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Auth middleware
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

  // AUTH
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, firstName } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
      }
      if (username.length < 3 || password.length < 4) {
        return res.status(400).json({ error: 'Логин минимум 3 символа, пароль минимум 4' });
      }
      const existing = await mockDb.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await mockDb.createUser({
        username, password: hashedPassword, firstName: firstName || username,
        role: 'user', status: 'pending'
      });
      res.json({ success: true, message: 'Регистрация успешна. Ожидайте подтверждения администратором.', userId: result.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Логин и пароль обязательны' });
      }
      const user = await mockDb.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Неверный логин или пароль' });
      }
      if (user.status === 'pending') {
        return res.status(403).json({ error: 'Ваш аккаунт ожидает подтверждения администратором', status: 'pending' });
      }
      if (user.status === 'rejected') {
        return res.status(403).json({ error: 'Ваш аккаунт отклонен администратором', status: 'rejected' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { id: user.id, username: user.username, firstName: user.first_name, role: user.role, status: user.status });
      res.json({ success: true, token, user: { id: user.id, username: user.username, firstName: user.first_name, role: user.role } });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/auth/logout', authMiddleware, (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    sessions.delete(token);
    res.json({ success: true });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ success: true, user: req.user });
  });

  // USER API
  app.get('/api/processes', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const processes = await mockDb.getAllProcessesWithSteps();
      res.json(processes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/sync/records', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const { records } = req.body;
      for (const record of records) {
        if (!record.synced) {
          await mockDb.syncTimeRecord(req.user.id, record);
        }
      }
      res.json({ success: true, message: 'Данные синхронизированы' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/stats', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const stats = await mockDb.getRecordStats(req.user.id, 7);
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/assignments', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const assignments = await mockDb.getUserAssignments(req.user.id);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/objects', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const objects = await mockDb.getAllObjects();
      res.json(objects);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/records/start', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const { processId, objectId, assignmentId } = req.body;
      const result = await mockDb.startTimeRecordWithContext(req.user.id, processId, objectId, assignmentId);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/records/:id/stop', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const { comment } = req.body;
      const result = await mockDb.stopTimeRecord(parseInt(req.params.id), comment);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/records/:recordId/steps/:stepId/start', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const result = await mockDb.startStepTiming(parseInt(req.params.recordId), parseInt(req.params.stepId));
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/step-timings/:id/stop', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const result = await mockDb.stopStepTiming(parseInt(req.params.id));
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/records/:recordId/photos', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const { stepId, fileData, comment } = req.body;
      const result = await mockDb.savePhoto(parseInt(req.params.recordId), stepId, fileData, comment);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/records/:recordId/photos', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const photos = await mockDb.getRecordPhotos(parseInt(req.params.recordId));
      res.json(photos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/records/:recordId/step-timings', authMiddleware, approvedMiddleware, async (req, res) => {
    try {
      const timings = await mockDb.getStepTimings(parseInt(req.params.recordId));
      res.json(timings);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ADMIN API
  app.get('/api/admin/processes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const processes = await mockDb.getAllProcessesWithSteps();
      res.json(processes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/processes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const process = await mockDb.getProcessWithSteps(parseInt(req.params.id));
      res.json(process);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/processes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await mockDb.createProcess(req.body);
      if (req.body.steps && req.body.steps.length > 0) {
        for (const step of req.body.steps) {
          await mockDb.createProcessStep({ ...step, process_id: result.id });
        }
      }
      res.json({ success: true, id: result.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/processes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const processId = parseInt(req.params.id);
      await mockDb.updateProcess(processId, req.body);
      if (req.body.steps) {
        const oldSteps = await mockDb.getProcessSteps(processId);
        for (const step of oldSteps) {
          await mockDb.deleteProcessStep(step.id);
        }
        for (const step of req.body.steps) {
          await mockDb.createProcessStep({ ...step, process_id: processId });
        }
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/processes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.deleteProcess(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/categories', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const categories = await mockDb.getAllCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/categories', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { name, icon, color } = req.body;
      const result = await mockDb.createCategory(name, icon, color);
      res.json({ success: true, id: result.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const users = await mockDb.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { role } = req.body;
      await mockDb.setUserRole(parseInt(req.params.id), role);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/users/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { status } = req.body;
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'Недопустимый статус' });
      }
      await mockDb.setUserStatus(parseInt(req.params.id), status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (userId === req.user.id) {
        return res.status(400).json({ error: 'Нельзя удалить самого себя' });
      }
      await mockDb.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GROUPS API
  app.get('/api/admin/groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const groups = await mockDb.getAllGroups();
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const group = await mockDb.getGroupById(parseInt(req.params.id));
      if (group) {
        group.members = await mockDb.getGroupMembers(parseInt(req.params.id));
      }
      res.json(group);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await mockDb.createGroup(req.body);
      res.json({ success: true, id: result.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.updateGroup(parseInt(req.params.id), req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.deleteGroup(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/groups/:id/members', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { userId } = req.body;
      await mockDb.addUserToGroup(userId, parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/groups/:groupId/members/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.removeUserFromGroup(parseInt(req.params.userId), parseInt(req.params.groupId));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // OBJECTS API
  app.get('/api/admin/objects', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const objects = await mockDb.getAllObjects();
      res.json(objects);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/objects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const object = await mockDb.getObjectById(parseInt(req.params.id));
      res.json(object);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/objects', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await mockDb.createObject(req.body);
      res.json({ success: true, id: result.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/objects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.updateObject(parseInt(req.params.id), req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/objects/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.deleteObject(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ASSIGNMENTS API
  app.get('/api/admin/assignments', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const assignments = await mockDb.getAllAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/assignments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const assignment = await mockDb.getAssignmentById(parseInt(req.params.id));
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/assignments', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const result = await mockDb.createAssignment(req.body);
      res.json({ success: true, id: result.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/admin/assignments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.updateAssignment(parseInt(req.params.id), req.body);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/admin/assignments/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      await mockDb.deleteAssignment(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ANALYTICS API
  app.get('/api/admin/analytics/records', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { startDate, endDate, userId, processId, limit = 100 } = req.query;
      const records = await mockDb.getAllRecordsForAnalytics(startDate, endDate, userId, processId, parseInt(limit));
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/analytics/summary', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const summary = await mockDb.getAnalyticsSummary(startDate, endDate);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/analytics/by-process', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const stats = await mockDb.getStatsByProcess(startDate, endDate);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/analytics/by-user', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const stats = await mockDb.getStatsByUser(startDate, endDate);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/analytics/process/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const analytics = await mockDb.getProcessDetailedAnalytics(parseInt(req.params.id), startDate, endDate);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/analytics/object/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const analytics = await mockDb.getObjectAnalytics(parseInt(req.params.id), startDate, endDate);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/admin/analytics/group/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const analytics = await mockDb.getGroupAnalytics(parseInt(req.params.id), startDate, endDate);
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}

describe('Server API', () => {
  let app;
  const adminToken = 'admin-test-token-123';
  const userToken = 'user-test-token-456';

  beforeAll(async () => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Восстанавливаем сессии перед каждым тестом
    sessions.set(adminToken, {
      id: 1,
      username: 'admin',
      firstName: 'Admin',
      role: 'admin',
      status: 'approved'
    });

    sessions.set(userToken, {
      id: 2,
      username: 'user',
      firstName: 'User',
      role: 'user',
      status: 'approved'
    });
  });

  afterAll(() => {
    sessions.clear();
  });

  // ============ AUTH TESTS ============

  describe('POST /api/auth/register', () => {
    it('should register new user', async () => {
      mockDb.getUserByUsername.mockResolvedValue(null);
      mockDb.createUser.mockResolvedValue({ id: 3 });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'newuser', password: 'pass123', firstName: 'New User' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.userId).toBe(3);
    });

    it('should return 400 if username/password missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('обязательны');
    });

    it('should return 400 if credentials too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'ab', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('минимум');
    });

    it('should return 400 if user exists', async () => {
      mockDb.getUserByUsername.mockResolvedValue({ id: 1, username: 'existing' });

      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'existing', password: 'pass123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('уже существует');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login approved user', async () => {
      const hashedPass = await bcrypt.hash('password', 10);
      mockDb.getUserByUsername.mockResolvedValue({
        id: 1, username: 'testuser', password: hashedPass,
        first_name: 'Test', role: 'user', status: 'approved'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('testuser');
    });

    it('should return 400 if credentials missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test' });

      expect(res.status).toBe(400);
    });

    it('should return 401 for wrong password', async () => {
      const hashedPass = await bcrypt.hash('correctpass', 10);
      mockDb.getUserByUsername.mockResolvedValue({
        id: 1, username: 'testuser', password: hashedPass,
        status: 'approved', role: 'user'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpass' });

      expect(res.status).toBe(401);
    });

    it('should return 401 for non-existent user', async () => {
      mockDb.getUserByUsername.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'pass' });

      expect(res.status).toBe(401);
    });

    it('should return 403 for pending user', async () => {
      const hashedPass = await bcrypt.hash('password', 10);
      mockDb.getUserByUsername.mockResolvedValue({
        id: 1, username: 'pending', password: hashedPass,
        status: 'pending', role: 'user'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'pending', password: 'password' });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('pending');
    });

    it('should return 403 for rejected user', async () => {
      const hashedPass = await bcrypt.hash('password', 10);
      mockDb.getUserByUsername.mockResolvedValue({
        id: 1, username: 'rejected', password: hashedPass,
        status: 'rejected', role: 'user'
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'rejected', password: 'password' });

      expect(res.status).toBe(403);
      expect(res.body.status).toBe('rejected');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout user', async () => {
      // Создаём временный токен для теста logout
      const tempToken = 'temp-logout-token';
      sessions.set(tempToken, {
        id: 99,
        username: 'tempuser',
        firstName: 'Temp',
        role: 'user',
        status: 'approved'
      });

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tempToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(sessions.has(tempToken)).toBe(false);
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .post('/api/auth/logout');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user info', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('admin');
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  // ============ USER API TESTS ============

  describe('GET /api/processes', () => {
    it('should return processes for approved user', async () => {
      mockDb.getAllProcessesWithSteps.mockResolvedValue([{ id: 1, name: 'Process 1' }]);

      const res = await request(app)
        .get('/api/processes')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 401 without auth', async () => {
      const res = await request(app).get('/api/processes');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/sync/records', () => {
    it('should sync records', async () => {
      mockDb.syncTimeRecord.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/sync/records')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ records: [{ synced: false, processId: 1 }] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/stats', () => {
    it('should return user stats', async () => {
      mockDb.getRecordStats.mockResolvedValue([{ name: 'Process', count: 5 }]);

      const res = await request(app)
        .get('/api/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.stats).toBeDefined();
    });
  });

  describe('GET /api/assignments', () => {
    it('should return user assignments', async () => {
      mockDb.getUserAssignments.mockResolvedValue([{ id: 1, name: 'Task 1' }]);

      const res = await request(app)
        .get('/api/assignments')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/objects', () => {
    it('should return objects', async () => {
      mockDb.getAllObjects.mockResolvedValue([{ id: 1, name: 'Store 1' }]);

      const res = await request(app)
        .get('/api/objects')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/records/start', () => {
    it('should start time record', async () => {
      mockDb.startTimeRecordWithContext.mockResolvedValue({ id: 1, start_time: '2024-01-01T10:00:00Z' });

      const res = await request(app)
        .post('/api/records/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ processId: 1, objectId: 1, assignmentId: 1 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(1);
    });
  });

  describe('POST /api/records/:id/stop', () => {
    it('should stop time record', async () => {
      mockDb.stopTimeRecord.mockResolvedValue({ end_time: '2024-01-01T11:00:00Z', duration: 3600 });

      const res = await request(app)
        .post('/api/records/1/stop')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ comment: 'Done' });

      expect(res.status).toBe(200);
      expect(res.body.duration).toBe(3600);
    });
  });

  describe('POST /api/records/:recordId/steps/:stepId/start', () => {
    it('should start step timing', async () => {
      mockDb.startStepTiming.mockResolvedValue({ id: 1, start_time: '2024-01-01T10:00:00Z' });

      const res = await request(app)
        .post('/api/records/1/steps/1/start')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
    });
  });

  describe('POST /api/step-timings/:id/stop', () => {
    it('should stop step timing', async () => {
      mockDb.stopStepTiming.mockResolvedValue({ end_time: '2024-01-01T10:05:00Z', duration: 300 });

      const res = await request(app)
        .post('/api/step-timings/1/stop')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.duration).toBe(300);
    });
  });

  describe('POST /api/records/:recordId/photos', () => {
    it('should upload photo', async () => {
      mockDb.savePhoto.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/records/1/photos')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ stepId: 1, fileData: 'base64data', comment: 'Photo' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
    });
  });

  describe('GET /api/records/:recordId/photos', () => {
    it('should return record photos', async () => {
      mockDb.getRecordPhotos.mockResolvedValue([{ id: 1, file_data: 'base64' }]);

      const res = await request(app)
        .get('/api/records/1/photos')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/records/:recordId/step-timings', () => {
    it('should return step timings', async () => {
      mockDb.getStepTimings.mockResolvedValue([{ id: 1, step_name: 'Step 1', duration: 60 }]);

      const res = await request(app)
        .get('/api/records/1/step-timings')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  // ============ ADMIN API TESTS ============

  describe('ADMIN: Processes', () => {
    it('GET /api/admin/processes should return processes', async () => {
      mockDb.getAllProcessesWithSteps.mockResolvedValue([{ id: 1, name: 'Process 1' }]);

      const res = await request(app)
        .get('/api/admin/processes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/processes should deny non-admin', async () => {
      const res = await request(app)
        .get('/api/admin/processes')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/admin/processes/:id should return process', async () => {
      mockDb.getProcessWithSteps.mockResolvedValue({ id: 1, name: 'Process 1', steps: [] });

      const res = await request(app)
        .get('/api/admin/processes/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
    });

    it('POST /api/admin/processes should create process', async () => {
      mockDb.createProcess.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/admin/processes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Process', steps: [{ step_number: 1, name: 'Step 1' }] });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(1);
      expect(mockDb.createProcessStep).toHaveBeenCalled();
    });

    it('PUT /api/admin/processes/:id should update process', async () => {
      mockDb.getProcessSteps.mockResolvedValue([{ id: 1 }]);

      const res = await request(app)
        .put('/api/admin/processes/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated', steps: [{ step_number: 1, name: 'New Step' }] });

      expect(res.status).toBe(200);
      expect(mockDb.updateProcess).toHaveBeenCalled();
      expect(mockDb.deleteProcessStep).toHaveBeenCalled();
      expect(mockDb.createProcessStep).toHaveBeenCalled();
    });

    it('DELETE /api/admin/processes/:id should delete process', async () => {
      const res = await request(app)
        .delete('/api/admin/processes/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(mockDb.deleteProcess).toHaveBeenCalledWith(1);
    });
  });

  describe('ADMIN: Categories', () => {
    it('GET /api/admin/categories should return categories', async () => {
      mockDb.getAllCategories.mockResolvedValue([{ id: 1, name: 'Category 1' }]);

      const res = await request(app)
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('POST /api/admin/categories should create category', async () => {
      mockDb.createCategory.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Category', icon: '📦', color: '#FF0000' });

      expect(res.status).toBe(200);
    });
  });

  describe('ADMIN: Users', () => {
    it('GET /api/admin/users should return users', async () => {
      mockDb.getAllUsers.mockResolvedValue([{ id: 1, username: 'user1' }]);

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/users/:id/role should update role', async () => {
      const res = await request(app)
        .put('/api/admin/users/2/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });

      expect(res.status).toBe(200);
      expect(mockDb.setUserRole).toHaveBeenCalledWith(2, 'admin');
    });

    it('PUT /api/admin/users/:id/status should update status', async () => {
      const res = await request(app)
        .put('/api/admin/users/2/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' });

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/users/:id/status should reject invalid status', async () => {
      const res = await request(app)
        .put('/api/admin/users/2/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('DELETE /api/admin/users/:id should delete user', async () => {
      const res = await request(app)
        .delete('/api/admin/users/2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(mockDb.deleteUser).toHaveBeenCalledWith(2);
    });

    it('DELETE /api/admin/users/:id should not allow self-delete', async () => {
      const res = await request(app)
        .delete('/api/admin/users/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('самого себя');
    });
  });

  describe('ADMIN: Groups', () => {
    it('GET /api/admin/groups should return groups', async () => {
      mockDb.getAllGroups.mockResolvedValue([{ id: 1, name: 'Group 1' }]);

      const res = await request(app)
        .get('/api/admin/groups')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/groups/:id should return group with members', async () => {
      mockDb.getGroupById.mockResolvedValue({ id: 1, name: 'Group 1' });
      mockDb.getGroupMembers.mockResolvedValue([{ id: 1, username: 'user1' }]);

      const res = await request(app)
        .get('/api/admin/groups/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.members).toHaveLength(1);
    });

    it('POST /api/admin/groups should create group', async () => {
      mockDb.createGroup.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/admin/groups')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Group', description: 'Test' });

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/groups/:id should update group', async () => {
      const res = await request(app)
        .put('/api/admin/groups/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Group' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/admin/groups/:id should delete group', async () => {
      const res = await request(app)
        .delete('/api/admin/groups/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('POST /api/admin/groups/:id/members should add member', async () => {
      const res = await request(app)
        .post('/api/admin/groups/1/members')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: 2 });

      expect(res.status).toBe(200);
      expect(mockDb.addUserToGroup).toHaveBeenCalledWith(2, 1);
    });

    it('DELETE /api/admin/groups/:groupId/members/:userId should remove member', async () => {
      const res = await request(app)
        .delete('/api/admin/groups/1/members/2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(mockDb.removeUserFromGroup).toHaveBeenCalledWith(2, 1);
    });
  });

  describe('ADMIN: Objects', () => {
    it('GET /api/admin/objects should return objects', async () => {
      mockDb.getAllObjects.mockResolvedValue([{ id: 1, name: 'Store 1' }]);

      const res = await request(app)
        .get('/api/admin/objects')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/objects/:id should return object', async () => {
      mockDb.getObjectById.mockResolvedValue({ id: 1, name: 'Store 1' });

      const res = await request(app)
        .get('/api/admin/objects/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('POST /api/admin/objects should create object', async () => {
      mockDb.createObject.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/admin/objects')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Store', address: '123 Main St' });

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/objects/:id should update object', async () => {
      const res = await request(app)
        .put('/api/admin/objects/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Store' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/admin/objects/:id should delete object', async () => {
      const res = await request(app)
        .delete('/api/admin/objects/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('ADMIN: Assignments', () => {
    it('GET /api/admin/assignments should return assignments', async () => {
      mockDb.getAllAssignments.mockResolvedValue([{ id: 1, name: 'Task 1' }]);

      const res = await request(app)
        .get('/api/admin/assignments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/assignments/:id should return assignment', async () => {
      mockDb.getAssignmentById.mockResolvedValue({ id: 1, name: 'Task 1' });

      const res = await request(app)
        .get('/api/admin/assignments/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('POST /api/admin/assignments should create assignment', async () => {
      mockDb.createAssignment.mockResolvedValue({ id: 1 });

      const res = await request(app)
        .post('/api/admin/assignments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Task', process_id: 1, user_id: 2 });

      expect(res.status).toBe(200);
    });

    it('PUT /api/admin/assignments/:id should update assignment', async () => {
      const res = await request(app)
        .put('/api/admin/assignments/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated Task' });

      expect(res.status).toBe(200);
    });

    it('DELETE /api/admin/assignments/:id should delete assignment', async () => {
      const res = await request(app)
        .delete('/api/admin/assignments/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });

  describe('ADMIN: Analytics', () => {
    it('GET /api/admin/analytics/records should return records', async () => {
      mockDb.getAllRecordsForAnalytics.mockResolvedValue([{ id: 1 }]);

      const res = await request(app)
        .get('/api/admin/analytics/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ startDate: '2024-01-01', endDate: '2024-12-31' });

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/analytics/summary should return summary', async () => {
      mockDb.getAnalyticsSummary.mockResolvedValue({ total_records: 100 });

      const res = await request(app)
        .get('/api/admin/analytics/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/analytics/by-process should return stats', async () => {
      mockDb.getStatsByProcess.mockResolvedValue([{ id: 1, count: 10 }]);

      const res = await request(app)
        .get('/api/admin/analytics/by-process')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/analytics/by-user should return stats', async () => {
      mockDb.getStatsByUser.mockResolvedValue([{ id: 1, count: 10 }]);

      const res = await request(app)
        .get('/api/admin/analytics/by-user')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/analytics/process/:id should return detailed analytics', async () => {
      mockDb.getProcessDetailedAnalytics.mockResolvedValue({
        summary: {}, stepStats: [], userStats: [], objectStats: []
      });

      const res = await request(app)
        .get('/api/admin/analytics/process/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/analytics/object/:id should return object analytics', async () => {
      mockDb.getObjectAnalytics.mockResolvedValue([{ process_id: 1 }]);

      const res = await request(app)
        .get('/api/admin/analytics/object/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('GET /api/admin/analytics/group/:id should return group analytics', async () => {
      mockDb.getGroupAnalytics.mockResolvedValue([{ user_id: 1 }]);

      const res = await request(app)
        .get('/api/admin/analytics/group/1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });
  });
});
