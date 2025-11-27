const Database = require('../../src/database');

// Мок для pg
jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };

  const mockPool = {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    on: jest.fn(),
    end: jest.fn()
  };

  return {
    Pool: jest.fn(() => mockPool),
    mockClient,
    mockPool
  };
});

const { mockClient, mockPool } = require('pg');

describe('Database', () => {
  let db;

  beforeEach(() => {
    jest.clearAllMocks();
    db = new Database();
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('constructor', () => {
    it('should create pool with correct config without SSL', () => {
      const { Pool } = require('pg');
      expect(Pool).toHaveBeenCalledWith({
        connectionString: process.env.DATABASE_URL,
        ssl: false
      });
    });

    it('should create pool with SSL when DATABASE_SSL is true', () => {
      const originalEnv = process.env.DATABASE_SSL;
      process.env.DATABASE_SSL = 'true';

      const { Pool } = require('pg');
      Pool.mockClear();

      new Database();

      expect(Pool).toHaveBeenCalledWith({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });

      process.env.DATABASE_SSL = originalEnv;
    });

    it('should set up connect and error handlers', () => {
      expect(mockPool.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('query', () => {
    it('should execute query and release client', async () => {
      const mockResult = { rows: [{ id: 1 }] };
      mockClient.query.mockResolvedValueOnce(mockResult);

      const result = await db.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual(mockResult);
    });

    it('should release client even on error', async () => {
      const error = new Error('Query failed');
      mockClient.query.mockRejectedValueOnce(error);

      await expect(db.query('INVALID SQL')).rejects.toThrow('Query failed');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('initTables', () => {
    it('should create all required tables', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await db.initTables();

      // Проверяем что были созданы все таблицы
      const calls = mockClient.query.mock.calls;
      const queries = calls.map(call => call[0]);

      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS process_categories'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS processes'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS process_steps'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS time_records'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS step_completions'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS photos'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS user_groups'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS user_group_members'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS objects'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS assignments'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS step_timings'))).toBe(true);
    });

    it('should insert default categories', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await db.initTables();

      const calls = mockClient.query.mock.calls;
      const queries = calls.map(call => call[0]);

      expect(queries.some(q => q.includes('INSERT INTO process_categories') && q.includes('ON CONFLICT'))).toBe(true);
    });
  });

  // ============ USERS ============

  describe('getUserById', () => {
    it('should return user by id', async () => {
      const mockUser = { id: 1, username: 'test', first_name: 'Test User' };
      mockClient.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await db.getUserById(1);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result).toEqual(mockUser);
    });

    it('should return undefined for non-existent user', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await db.getUserById(999);

      expect(result).toBeUndefined();
    });
  });

  describe('getUserByUsername', () => {
    it('should return user by username', async () => {
      const mockUser = { id: 1, username: 'testuser' };
      mockClient.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await db.getUserByUsername('testuser');

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM users WHERE username = $1', ['testuser']);
      expect(result).toEqual(mockUser);
    });
  });

  describe('createUser', () => {
    it('should create user with all fields', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createUser({
        username: 'newuser',
        password: 'hashedpass',
        firstName: 'New User',
        role: 'admin',
        status: 'approved'
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['newuser', 'hashedpass', 'New User', 'admin', 'approved']
      );
      expect(result).toEqual({ id: 1 });
    });

    it('should use default role and status', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      await db.createUser({
        username: 'user2',
        password: 'pass'
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['user2', 'pass', undefined, 'user', 'pending']
      );
    });
  });

  describe('getAllUsers', () => {
    it('should return all users ordered by created_at', async () => {
      const mockUsers = [
        { id: 1, username: 'user1' },
        { id: 2, username: 'user2' }
      ];
      mockClient.query.mockResolvedValueOnce({ rows: mockUsers });

      const result = await db.getAllUsers();

      const callArg = mockClient.query.mock.calls[0][0];
      expect(callArg).toContain('SELECT * FROM users');
      expect(result).toEqual(mockUsers);
    });
  });

  describe('setUserRole', () => {
    it('should update user role', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.setUserRole(1, 'admin');

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET role = $1 WHERE id = $2',
        ['admin', 1]
      );
    });
  });

  describe('setUserStatus', () => {
    it('should update user status', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.setUserStatus(1, 'approved');

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE users SET status = $1 WHERE id = $2',
        ['approved', 1]
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete user by id', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.deleteUser(1);

      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', [1]);
    });
  });

  // ============ CATEGORIES ============

  describe('getAllCategories', () => {
    it('should return all categories ordered by name', async () => {
      const mockCategories = [
        { id: 1, name: 'Category A' },
        { id: 2, name: 'Category B' }
      ];
      mockClient.query.mockResolvedValueOnce({ rows: mockCategories });

      const result = await db.getAllCategories();

      const callArg = mockClient.query.mock.calls[0][0];
      expect(callArg).toContain('SELECT * FROM process_categories');
      expect(result).toEqual(mockCategories);
    });
  });

  describe('createCategory', () => {
    it('should create category with all fields', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createCategory('New Category', '📦', '#FF0000');

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO process_categories (name, icon, color) VALUES ($1, $2, $3) RETURNING id',
        ['New Category', '📦', '#FF0000']
      );
      expect(result).toEqual({ id: 1 });
    });
  });

  // ============ PROCESSES ============

  describe('getAllProcesses', () => {
    it('should return active processes with category info', async () => {
      const mockProcesses = [
        { id: 1, name: 'Process 1', category_name: 'Cat1' }
      ];
      mockClient.query.mockResolvedValueOnce({ rows: mockProcesses });

      const result = await db.getAllProcesses();

      const callArg = mockClient.query.mock.calls[0][0];
      expect(callArg).toContain('is_active = true');
      expect(result).toEqual(mockProcesses);
    });
  });

  describe('getAllProcessesWithSteps', () => {
    it('should return processes with their steps', async () => {
      const mockProcesses = [{ id: 1, name: 'Process 1' }];
      const mockSteps = [{ id: 1, step_number: 1, name: 'Step 1' }];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockProcesses })
        .mockResolvedValueOnce({ rows: mockSteps });

      const result = await db.getAllProcessesWithSteps();

      expect(result[0].steps).toEqual(mockSteps);
    });
  });

  describe('getProcessById', () => {
    it('should return process by id', async () => {
      const mockProcess = { id: 1, name: 'Test Process' };
      mockClient.query.mockResolvedValueOnce({ rows: [mockProcess] });

      const result = await db.getProcessById(1);

      expect(mockClient.query).toHaveBeenCalledWith('SELECT * FROM processes WHERE id = $1', [1]);
      expect(result).toEqual(mockProcess);
    });
  });

  describe('getProcessWithSteps', () => {
    it('should return process with steps', async () => {
      const mockProcess = { id: 1, name: 'Process 1' };
      const mockSteps = [{ id: 1, step_number: 1 }];

      mockClient.query
        .mockResolvedValueOnce({ rows: [mockProcess] })
        .mockResolvedValueOnce({ rows: mockSteps });

      const result = await db.getProcessWithSteps(1);

      expect(result.steps).toEqual(mockSteps);
    });

    it('should return undefined for non-existent process', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await db.getProcessWithSteps(999);

      expect(result).toBeUndefined();
    });
  });

  describe('createProcess', () => {
    it('should create process with all fields', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createProcess({
        name: 'New Process',
        description: 'Description',
        category_id: 1,
        estimated_duration: 60,
        priority: 5,
        is_sequential: true
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO processes'),
        ['New Process', 'Description', 1, 60, 5, true]
      );
      expect(result).toEqual({ id: 1 });
    });

    it('should use default values when not provided', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      await db.createProcess({ name: 'Minimal Process' });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO processes'),
        ['Minimal Process', undefined, undefined, 0, 0, false]
      );
    });
  });

  describe('updateProcess', () => {
    it('should update process fields', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.updateProcess(1, {
        name: 'Updated',
        description: 'New desc',
        category_id: 2,
        estimated_duration: 120,
        priority: 10,
        is_sequential: false,
        is_active: true
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE processes'),
        ['Updated', 'New desc', 2, 120, 10, false, true, 1]
      );
    });
  });

  describe('deleteProcess', () => {
    it('should soft delete process by setting is_active to false', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.deleteProcess(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE processes SET is_active = false WHERE id = $1',
        [1]
      );
    });
  });

  // ============ PROCESS STEPS ============

  describe('getProcessSteps', () => {
    it('should return steps ordered by step_number', async () => {
      const mockSteps = [
        { id: 1, step_number: 1 },
        { id: 2, step_number: 2 }
      ];
      mockClient.query.mockResolvedValueOnce({ rows: mockSteps });

      const result = await db.getProcessSteps(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM process_steps WHERE process_id = $1 ORDER BY step_number',
        [1]
      );
      expect(result).toEqual(mockSteps);
    });
  });

  describe('createProcessStep', () => {
    it('should create step with all fields', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createProcessStep({
        process_id: 1,
        step_number: 1,
        name: 'Step 1',
        description: 'First step',
        estimated_duration: 30,
        requires_photo: true,
        photo_instructions: 'Take photo',
        is_required: true
      });

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('deleteProcessStep', () => {
    it('should delete step by id', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.deleteProcessStep(1);

      expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM process_steps WHERE id = $1', [1]);
    });
  });

  // ============ TIME RECORDS ============

  describe('startTimeRecord', () => {
    it('should create time record with start time', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.startTimeRecord(1, 1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO time_records (user_id, process_id, start_time) VALUES ($1, $2, $3) RETURNING id',
        [1, 1, expect.any(String)]
      );
      expect(result.id).toBe(1);
      expect(result.start_time).toBeDefined();
    });
  });

  describe('stopTimeRecord', () => {
    it('should stop record and calculate duration', async () => {
      const startTime = new Date(Date.now() - 60000).toISOString(); // 1 minute ago
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ start_time: startTime }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await db.stopTimeRecord(1, 'Comment');

      expect(result.duration).toBeGreaterThanOrEqual(59);
      expect(result.end_time).toBeDefined();
    });

    it('should return null for non-existent record', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await db.stopTimeRecord(999);

      expect(result).toBeNull();
    });
  });

  describe('getActiveRecord', () => {
    it('should return active record for user', async () => {
      const mockRecord = { id: 1, process_name: 'Process 1' };
      mockClient.query.mockResolvedValueOnce({ rows: [mockRecord] });

      const result = await db.getActiveRecord(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tr.user_id = $1 AND tr.end_time IS NULL'),
        [1]
      );
      expect(result).toEqual(mockRecord);
    });
  });

  describe('getUserRecords', () => {
    it('should return user records with limit', async () => {
      const mockRecords = [{ id: 1 }, { id: 2 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockRecords });

      const result = await db.getUserRecords(1, 5);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [1, 5]
      );
      expect(result).toEqual(mockRecords);
    });
  });

  describe('getRecordStats', () => {
    it('should return stats for specified days', async () => {
      const mockStats = [{ name: 'Process 1', count: 5, total_duration: 3600 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockStats });

      const result = await db.getRecordStats(1, 7);

      expect(result).toEqual(mockStats);
    });
  });

  describe('syncTimeRecord', () => {
    it('should sync offline record', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.syncTimeRecord(1, {
        processId: 1,
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T11:00:00Z',
        comment: 'Test'
      });

      expect(result).toEqual({ id: 1 });
    });
  });

  // ============ STEP COMPLETIONS ============

  describe('createStepCompletion', () => {
    it('should create step completion', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createStepCompletion(1, 1);

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('completeStep', () => {
    it('should complete step with comment and photo flag', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.completeStep(1, 'Done', true);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE step_completions'),
        ['Done', true, 1]
      );
    });
  });

  describe('getStepCompletions', () => {
    it('should return completions for record', async () => {
      const mockCompletions = [{ id: 1, step_name: 'Step 1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockCompletions });

      const result = await db.getStepCompletions(1);

      expect(result).toEqual(mockCompletions);
    });
  });

  // ============ GROUPS ============

  describe('getAllGroups', () => {
    it('should return active groups with member count', async () => {
      const mockGroups = [{ id: 1, name: 'Group 1', member_count: 5 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockGroups });

      const result = await db.getAllGroups();

      const callArg = mockClient.query.mock.calls[0][0];
      expect(callArg).toContain('is_active = true');
      expect(result).toEqual(mockGroups);
    });
  });

  describe('getGroupById', () => {
    it('should return group by id', async () => {
      const mockGroup = { id: 1, name: 'Test Group' };
      mockClient.query.mockResolvedValueOnce({ rows: [mockGroup] });

      const result = await db.getGroupById(1);

      expect(result).toEqual(mockGroup);
    });
  });

  describe('createGroup', () => {
    it('should create group with default color', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createGroup({ name: 'New Group', description: 'Test' });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_groups'),
        ['New Group', 'Test', '#607D8B']
      );
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('updateGroup', () => {
    it('should update group fields', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.updateGroup(1, {
        name: 'Updated',
        description: 'New desc',
        color: '#FF0000',
        is_active: true
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user_groups'),
        ['Updated', 'New desc', '#FF0000', true, 1]
      );
    });
  });

  describe('deleteGroup', () => {
    it('should soft delete group', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.deleteGroup(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE user_groups SET is_active = false WHERE id = $1',
        [1]
      );
    });
  });

  describe('getGroupMembers', () => {
    it('should return group members', async () => {
      const mockMembers = [{ id: 1, username: 'user1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockMembers });

      const result = await db.getGroupMembers(1);

      expect(result).toEqual(mockMembers);
    });
  });

  describe('addUserToGroup', () => {
    it('should add user to group', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.addUserToGroup(1, 1);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_group_members'),
        [1, 1]
      );
    });
  });

  describe('removeUserFromGroup', () => {
    it('should remove user from group', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.removeUserFromGroup(1, 1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM user_group_members WHERE user_id = $1 AND group_id = $2',
        [1, 1]
      );
    });
  });

  describe('getUserGroups', () => {
    it('should return groups for user', async () => {
      const mockGroups = [{ id: 1, name: 'Group 1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockGroups });

      const result = await db.getUserGroups(1);

      expect(result).toEqual(mockGroups);
    });
  });

  // ============ OBJECTS ============

  describe('getAllObjects', () => {
    it('should return active objects', async () => {
      const mockObjects = [{ id: 1, name: 'Store 1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockObjects });

      const result = await db.getAllObjects();

      const callArg = mockClient.query.mock.calls[0][0];
      expect(callArg).toContain('is_active = true');
      expect(result).toEqual(mockObjects);
    });
  });

  describe('getObjectById', () => {
    it('should return object by id', async () => {
      const mockObject = { id: 1, name: 'Store 1' };
      mockClient.query.mockResolvedValueOnce({ rows: [mockObject] });

      const result = await db.getObjectById(1);

      expect(result).toEqual(mockObject);
    });
  });

  describe('createObject', () => {
    it('should create object', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createObject({
        name: 'New Store',
        address: '123 Main St',
        description: 'Test'
      });

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('updateObject', () => {
    it('should update object', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.updateObject(1, {
        name: 'Updated Store',
        address: 'New Address',
        description: 'New desc',
        is_active: true
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE objects'),
        ['Updated Store', 'New Address', 'New desc', true, 1]
      );
    });
  });

  describe('deleteObject', () => {
    it('should soft delete object', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.deleteObject(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE objects SET is_active = false WHERE id = $1',
        [1]
      );
    });
  });

  // ============ ASSIGNMENTS ============

  describe('getAllAssignments', () => {
    it('should return non-deleted assignments', async () => {
      const mockAssignments = [{ id: 1, name: 'Task 1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockAssignments });

      const result = await db.getAllAssignments();

      const callArg = mockClient.query.mock.calls[0][0];
      expect(callArg).toContain("status != 'deleted'");
      expect(result).toEqual(mockAssignments);
    });
  });

  describe('getAssignmentById', () => {
    it('should return assignment with details', async () => {
      const mockAssignment = { id: 1, name: 'Task 1', process_name: 'Process 1' };
      mockClient.query.mockResolvedValueOnce({ rows: [mockAssignment] });

      const result = await db.getAssignmentById(1);

      expect(result).toEqual(mockAssignment);
    });
  });

  describe('createAssignment', () => {
    it('should create assignment with all fields', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.createAssignment({
        name: 'New Task',
        description: 'Description',
        process_id: 1,
        object_id: 1,
        user_id: 1,
        group_id: null,
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        is_recurring: true,
        recurrence_type: 'daily',
        priority: 5
      });

      expect(result).toEqual({ id: 1 });
    });
  });

  describe('updateAssignment', () => {
    it('should update assignment', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.updateAssignment(1, {
        name: 'Updated',
        description: 'New desc',
        process_id: 2,
        status: 'completed'
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE assignments'),
        expect.any(Array)
      );
    });
  });

  describe('deleteAssignment', () => {
    it('should soft delete assignment', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.deleteAssignment(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        "UPDATE assignments SET status = $1 WHERE id = $2",
        ['deleted', 1]
      );
    });
  });

  describe('getUserAssignments', () => {
    it('should return assignments for user', async () => {
      const mockAssignments = [{ id: 1, name: 'Task 1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockAssignments });

      const result = await db.getUserAssignments(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('a.user_id = $1'),
        [1]
      );
      expect(result).toEqual(mockAssignments);
    });
  });

  // ============ TIME RECORDS WITH CONTEXT ============

  describe('startTimeRecordWithContext', () => {
    it('should create time record with object and assignment', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.startTimeRecordWithContext(1, 1, 1, 1);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('object_id, assignment_id'),
        [1, 1, 1, 1, expect.any(String)]
      );
      expect(result.id).toBe(1);
    });
  });

  // ============ STEP TIMINGS ============

  describe('startStepTiming', () => {
    it('should start step timing', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.startStepTiming(1, 1);

      expect(result.id).toBe(1);
      expect(result.start_time).toBeDefined();
    });
  });

  describe('stopStepTiming', () => {
    it('should stop step timing and calculate duration', async () => {
      const startTime = new Date(Date.now() - 30000).toISOString();
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ start_time: startTime }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await db.stopStepTiming(1);

      expect(result.duration).toBeGreaterThanOrEqual(29);
    });

    it('should return null for non-existent timing', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const result = await db.stopStepTiming(999);

      expect(result).toBeNull();
    });
  });

  describe('getStepTimings', () => {
    it('should return step timings for record', async () => {
      const mockTimings = [{ id: 1, step_name: 'Step 1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockTimings });

      const result = await db.getStepTimings(1);

      expect(result).toEqual(mockTimings);
    });
  });

  // ============ ANALYTICS ============

  describe('getAllRecordsForAnalytics', () => {
    it('should return records with filters', async () => {
      const mockRecords = [{ id: 1, duration_minutes: 60 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockRecords });

      const result = await db.getAllRecordsForAnalytics('2024-01-01', '2024-12-31', 1, 1, 50);

      expect(result).toEqual(mockRecords);
    });

    it('should work without filters', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await db.getAllRecordsForAnalytics(null, null, null, null);

      expect(mockClient.query).toHaveBeenCalled();
    });
  });

  describe('getAnalyticsSummary', () => {
    it('should return summary stats', async () => {
      const mockSummary = { total_records: 100, total_duration: 36000 };
      mockClient.query.mockResolvedValueOnce({ rows: [mockSummary] });

      const result = await db.getAnalyticsSummary('2024-01-01', '2024-12-31');

      expect(result).toEqual(mockSummary);
    });
  });

  describe('getStatsByProcess', () => {
    it('should return stats grouped by process', async () => {
      const mockStats = [{ id: 1, name: 'Process 1', count: 10 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockStats });

      const result = await db.getStatsByProcess('2024-01-01', '2024-12-31');

      expect(result).toEqual(mockStats);
    });
  });

  describe('getStatsByUser', () => {
    it('should return stats grouped by user', async () => {
      const mockStats = [{ id: 1, name: 'User 1', count: 10 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockStats });

      const result = await db.getStatsByUser('2024-01-01', '2024-12-31');

      expect(result).toEqual(mockStats);
    });
  });

  describe('getProcessDetailedAnalytics', () => {
    it('should return detailed analytics for process', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ total_executions: 10 }] })
        .mockResolvedValueOnce({ rows: [{ step_id: 1, avg_duration: 60 }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, first_name: 'User' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Store' }] });

      const result = await db.getProcessDetailedAnalytics(1, '2024-01-01', '2024-12-31');

      expect(result.summary).toBeDefined();
      expect(result.stepStats).toBeDefined();
      expect(result.userStats).toBeDefined();
      expect(result.objectStats).toBeDefined();
    });
  });

  describe('getObjectAnalytics', () => {
    it('should return analytics for object', async () => {
      const mockAnalytics = [{ process_id: 1, execution_count: 5 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockAnalytics });

      const result = await db.getObjectAnalytics(1, '2024-01-01', '2024-12-31');

      expect(result).toEqual(mockAnalytics);
    });
  });

  describe('getGroupAnalytics', () => {
    it('should return analytics for group', async () => {
      const mockAnalytics = [{ user_id: 1, execution_count: 5 }];
      mockClient.query.mockResolvedValueOnce({ rows: mockAnalytics });

      const result = await db.getGroupAnalytics(1, '2024-01-01', '2024-12-31');

      expect(result).toEqual(mockAnalytics);
    });
  });

  // ============ PHOTOS ============

  describe('savePhoto', () => {
    it('should save photo with base64 data', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await db.savePhoto(1, 1, 'base64data', 'Photo comment');

      expect(mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO photos (record_id, step_id, file_data, comment) VALUES ($1, $2, $3, $4) RETURNING id',
        [1, 1, 'base64data', 'Photo comment']
      );
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('getRecordPhotos', () => {
    it('should return photos for record', async () => {
      const mockPhotos = [{ id: 1, step_name: 'Step 1' }];
      mockClient.query.mockResolvedValueOnce({ rows: mockPhotos });

      const result = await db.getRecordPhotos(1);

      expect(result).toEqual(mockPhotos);
    });
  });

  // ============ CONNECTION ============

  describe('close', () => {
    it('should close the pool', async () => {
      await db.close();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
