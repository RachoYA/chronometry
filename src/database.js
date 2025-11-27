const { Pool } = require('pg');

class Database {
  constructor() {
    // SSL только для внешних провайдеров (Heroku, Railway, etc.)
    // В Docker локальный PostgreSQL не требует SSL
    const useSSL = process.env.DATABASE_SSL === 'true';

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false
    });

    this.pool.on('connect', () => {
      console.log('Подключено к базе данных PostgreSQL');
    });

    this.pool.on('error', (err) => {
      console.error('Ошибка подключения к PostgreSQL:', err);
    });
  }

  async query(text, params) {
    const client = await this.pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async initTables() {
    await this.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS process_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        icon VARCHAR(50),
        color VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS processes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category_id INTEGER REFERENCES process_categories(id),
        estimated_duration INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        is_sequential BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS process_steps (
        id SERIAL PRIMARY KEY,
        process_id INTEGER NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
        step_number INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        estimated_duration INTEGER DEFAULT 0,
        requires_photo BOOLEAN DEFAULT false,
        photo_instructions TEXT,
        is_required BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS time_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        process_id INTEGER NOT NULL REFERENCES processes(id),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration INTEGER,
        comment TEXT,
        synced BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS step_completions (
        id SERIAL PRIMARY KEY,
        time_record_id INTEGER NOT NULL REFERENCES time_records(id) ON DELETE CASCADE,
        step_id INTEGER NOT NULL REFERENCES process_steps(id),
        completed_at TIMESTAMP,
        has_photo BOOLEAN DEFAULT false,
        comment TEXT
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        record_id INTEGER REFERENCES time_records(id) ON DELETE CASCADE,
        step_id INTEGER REFERENCES process_steps(id),
        file_path TEXT,
        file_data TEXT,
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ============ НОВЫЕ ТАБЛИЦЫ: Группы, Объекты, Назначения ============

    // Группы пользователей
    await this.query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        color VARCHAR(50) DEFAULT '#607D8B',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Связь пользователей с группами (многие ко многим)
    await this.query(`
      CREATE TABLE IF NOT EXISTS user_group_members (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, group_id)
      )
    `);

    // Объекты (магазины, склады, точки)
    await this.query(`
      CREATE TABLE IF NOT EXISTS objects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Назначения (задания) - связывает пользователей/группы с процессами и объектами
    await this.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        process_id INTEGER NOT NULL REFERENCES processes(id),
        object_id INTEGER REFERENCES objects(id),
        user_id INTEGER REFERENCES users(id),
        group_id INTEGER REFERENCES user_groups(id),
        start_date DATE,
        end_date DATE,
        is_recurring BOOLEAN DEFAULT false,
        recurrence_type VARCHAR(50),
        priority INTEGER DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
      )
    `);

    // Добавляем object_id и assignment_id к time_records
    await this.query(`
      DO $$ BEGIN
        ALTER TABLE time_records ADD COLUMN IF NOT EXISTS object_id INTEGER REFERENCES objects(id);
        ALTER TABLE time_records ADD COLUMN IF NOT EXISTS assignment_id INTEGER REFERENCES assignments(id);
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    // Добавляем group_id к users
    await this.query(`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_group_id INTEGER REFERENCES user_groups(id);
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    // Таблица для хранения времени по шагам (детальная аналитика)
    await this.query(`
      CREATE TABLE IF NOT EXISTS step_timings (
        id SERIAL PRIMARY KEY,
        time_record_id INTEGER NOT NULL REFERENCES time_records(id) ON DELETE CASCADE,
        step_id INTEGER NOT NULL REFERENCES process_steps(id),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Вставка базовых категорий
    await this.query(`
      INSERT INTO process_categories (id, name, icon, color)
      VALUES
        (1, 'Логистика', '🚚', '#FF9800'),
        (2, 'Продажи', '💰', '#4CAF50'),
        (3, 'Склад', '📦', '#2196F3'),
        (4, 'Клининг', '🧹', '#9C27B0'),
        (5, 'Администрирование', '📋', '#607D8B')
      ON CONFLICT (id) DO NOTHING
    `);

    console.log('Таблицы PostgreSQL инициализированы');
  }

  // ============ ПОЛЬЗОВАТЕЛИ ============

  async getUserById(id) {
    const result = await this.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getUserByUsername(username) {
    const result = await this.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0];
  }

  async createUser(data) {
    const { username, password, firstName, role = 'user', status = 'pending' } = data;
    const result = await this.query(
      `INSERT INTO users (username, password, first_name, role, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [username, password, firstName, role, status]
    );
    return { id: result.rows[0].id };
  }

  async getAllUsers() {
    const result = await this.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows;
  }

  async setUserRole(userId, role) {
    await this.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
  }

  async setUserStatus(userId, status) {
    await this.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
  }

  async deleteUser(userId) {
    await this.query('DELETE FROM users WHERE id = $1', [userId]);
  }

  // ============ КАТЕГОРИИ ============

  async getAllCategories() {
    const result = await this.query('SELECT * FROM process_categories ORDER BY name');
    return result.rows;
  }

  async createCategory(name, icon, color) {
    const result = await this.query(
      'INSERT INTO process_categories (name, icon, color) VALUES ($1, $2, $3) RETURNING id',
      [name, icon, color]
    );
    return { id: result.rows[0].id };
  }

  // ============ ПРОЦЕССЫ ============

  async getAllProcesses() {
    const result = await this.query(`
      SELECT p.*, pc.name as category_name, pc.icon as category_icon, pc.color as category_color
      FROM processes p
      LEFT JOIN process_categories pc ON p.category_id = pc.id
      WHERE p.is_active = true
      ORDER BY p.priority DESC, p.name
    `);
    return result.rows;
  }

  async getAllProcessesWithSteps() {
    const processes = await this.getAllProcesses();
    for (const process of processes) {
      process.steps = await this.getProcessSteps(process.id);
    }
    return processes;
  }

  async getProcessById(id) {
    const result = await this.query('SELECT * FROM processes WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getProcessWithSteps(id) {
    const process = await this.getProcessById(id);
    if (process) {
      process.steps = await this.getProcessSteps(id);
    }
    return process;
  }

  async createProcess(data) {
    const { name, description, category_id, estimated_duration, priority, is_sequential } = data;
    const result = await this.query(
      `INSERT INTO processes (name, description, category_id, estimated_duration, priority, is_sequential)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, description, category_id, estimated_duration || 0, priority || 0, is_sequential || false]
    );
    return { id: result.rows[0].id };
  }

  async updateProcess(id, data) {
    const { name, description, category_id, estimated_duration, priority, is_sequential, is_active } = data;
    await this.query(
      `UPDATE processes
       SET name = $1, description = $2, category_id = $3, estimated_duration = $4,
           priority = $5, is_sequential = $6, is_active = $7
       WHERE id = $8`,
      [name, description, category_id, estimated_duration, priority, is_sequential, is_active !== false, id]
    );
  }

  async deleteProcess(id) {
    await this.query('UPDATE processes SET is_active = false WHERE id = $1', [id]);
  }

  // ============ ШАГИ ПРОЦЕССА ============

  async getProcessSteps(processId) {
    const result = await this.query(
      'SELECT * FROM process_steps WHERE process_id = $1 ORDER BY step_number',
      [processId]
    );
    return result.rows;
  }

  async createProcessStep(data) {
    const { process_id, step_number, name, description, estimated_duration, requires_photo, photo_instructions, is_required } = data;
    const result = await this.query(
      `INSERT INTO process_steps (process_id, step_number, name, description, estimated_duration, requires_photo, photo_instructions, is_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [process_id, step_number, name, description, estimated_duration || 0, requires_photo || false, photo_instructions, is_required !== false]
    );
    return { id: result.rows[0].id };
  }

  async deleteProcessStep(id) {
    await this.query('DELETE FROM process_steps WHERE id = $1', [id]);
  }

  // ============ ЗАПИСИ ВРЕМЕНИ ============

  async startTimeRecord(userId, processId) {
    const startTime = new Date().toISOString();
    const result = await this.query(
      'INSERT INTO time_records (user_id, process_id, start_time) VALUES ($1, $2, $3) RETURNING id',
      [userId, processId, startTime]
    );
    return { id: result.rows[0].id, start_time: startTime };
  }

  async stopTimeRecord(recordId, comment = null) {
    const endTime = new Date().toISOString();
    const record = await this.query('SELECT start_time FROM time_records WHERE id = $1', [recordId]);

    if (record.rows[0]) {
      const duration = Math.floor((new Date(endTime) - new Date(record.rows[0].start_time)) / 1000);
      await this.query(
        'UPDATE time_records SET end_time = $1, duration = $2, comment = $3 WHERE id = $4',
        [endTime, duration, comment, recordId]
      );
      return { end_time: endTime, duration };
    }
    return null;
  }

  async getActiveRecord(userId) {
    const result = await this.query(`
      SELECT tr.*, p.name as process_name
      FROM time_records tr
      JOIN processes p ON tr.process_id = p.id
      WHERE tr.user_id = $1 AND tr.end_time IS NULL
      ORDER BY tr.start_time DESC LIMIT 1
    `, [userId]);
    return result.rows[0];
  }

  async getUserRecords(userId, limit = 10) {
    const result = await this.query(`
      SELECT tr.*, p.name as process_name
      FROM time_records tr
      JOIN processes p ON tr.process_id = p.id
      WHERE tr.user_id = $1
      ORDER BY tr.start_time DESC LIMIT $2
    `, [userId, limit]);
    return result.rows;
  }

  async getRecordStats(userId, days = 7) {
    const result = await this.query(`
      SELECT p.name, COUNT(*) as count, SUM(tr.duration) as total_duration
      FROM time_records tr
      JOIN processes p ON tr.process_id = p.id
      WHERE tr.user_id = $1
      AND tr.start_time >= NOW() - INTERVAL '${days} days'
      AND tr.end_time IS NOT NULL
      GROUP BY p.id, p.name
      ORDER BY total_duration DESC
    `, [userId]);
    return result.rows;
  }

  async syncTimeRecord(userId, record) {
    const result = await this.query(
      `INSERT INTO time_records (user_id, process_id, start_time, end_time, comment, synced)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id`,
      [userId, record.processId, record.startTime, record.endTime, record.comment]
    );
    return { id: result.rows[0].id };
  }

  // ============ ШАГИ ВЫПОЛНЕНИЯ ============

  async createStepCompletion(timeRecordId, stepId) {
    const result = await this.query(
      'INSERT INTO step_completions (time_record_id, step_id) VALUES ($1, $2) RETURNING id',
      [timeRecordId, stepId]
    );
    return { id: result.rows[0].id };
  }

  async completeStep(completionId, comment, hasPhoto) {
    await this.query(
      `UPDATE step_completions SET completed_at = NOW(), comment = $1, has_photo = $2 WHERE id = $3`,
      [comment, hasPhoto, completionId]
    );
  }

  async getStepCompletions(timeRecordId) {
    const result = await this.query(`
      SELECT sc.*, ps.name as step_name, ps.requires_photo
      FROM step_completions sc
      JOIN process_steps ps ON sc.step_id = ps.id
      WHERE sc.time_record_id = $1
      ORDER BY ps.step_number
    `, [timeRecordId]);
    return result.rows;
  }

  // ============ АНАЛИТИКА ============

  async getAllRecordsForAnalytics(startDate, endDate, userId, processId, limit = 100) {
    let query = `
      SELECT
        tr.id, tr.user_id, tr.process_id, tr.start_time, tr.end_time, tr.comment, tr.synced,
        u.first_name as user_name, u.username,
        p.name as process_name, p.is_sequential,
        pc.name as category_name, pc.icon as category_icon, pc.color as category_color,
        ROUND(EXTRACT(EPOCH FROM (tr.end_time - tr.start_time)) / 60, 1) as duration_minutes,
        (SELECT COUNT(*) FROM photos ph WHERE ph.record_id = tr.id) as photo_count
      FROM time_records tr
      LEFT JOIN users u ON tr.user_id = u.id
      LEFT JOIN processes p ON tr.process_id = p.id
      LEFT JOIN process_categories pc ON p.category_id = pc.id
      WHERE tr.end_time IS NOT NULL
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND DATE(tr.start_time) >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND DATE(tr.start_time) <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (userId) {
      query += ` AND tr.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (processId) {
      query += ` AND tr.process_id = $${paramIndex}`;
      params.push(processId);
      paramIndex++;
    }

    query += ` ORDER BY tr.start_time DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await this.query(query, params);
    return result.rows;
  }

  async getAnalyticsSummary(startDate, endDate) {
    let dateFilter = '';
    const params = [];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND DATE(tr.start_time) >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND DATE(tr.start_time) <= $${params.length}`;
    }

    const result = await this.query(`
      SELECT
        COUNT(*) as total_records,
        SUM(tr.duration) as total_duration,
        AVG(tr.duration) as avg_duration,
        COUNT(DISTINCT tr.user_id) as unique_users
      FROM time_records tr
      WHERE tr.end_time IS NOT NULL ${dateFilter}
    `, params);

    return result.rows[0];
  }

  async getStatsByProcess(startDate, endDate) {
    let dateFilter = '';
    const params = [];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND DATE(tr.start_time) >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND DATE(tr.start_time) <= $${params.length}`;
    }

    const result = await this.query(`
      SELECT
        p.id, p.name,
        pc.icon as category_icon,
        COUNT(*) as count,
        SUM(tr.duration) as total_duration,
        AVG(tr.duration) as avg_duration
      FROM time_records tr
      JOIN processes p ON tr.process_id = p.id
      LEFT JOIN process_categories pc ON p.category_id = pc.id
      WHERE tr.end_time IS NOT NULL ${dateFilter}
      GROUP BY p.id, p.name, pc.icon
      ORDER BY count DESC
    `, params);

    return result.rows;
  }

  async getStatsByUser(startDate, endDate) {
    let dateFilter = '';
    const params = [];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND DATE(tr.start_time) >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND DATE(tr.start_time) <= $${params.length}`;
    }

    const result = await this.query(`
      SELECT
        u.id, u.first_name as name, u.username,
        COUNT(*) as count,
        SUM(tr.duration) as total_duration,
        AVG(tr.duration) as avg_duration
      FROM time_records tr
      JOIN users u ON tr.user_id = u.id
      WHERE tr.end_time IS NOT NULL ${dateFilter}
      GROUP BY u.id, u.first_name, u.username
      ORDER BY count DESC
    `, params);

    return result.rows;
  }

  // ============ ГРУППЫ ПОЛЬЗОВАТЕЛЕЙ ============

  async getAllGroups() {
    const result = await this.query(`
      SELECT g.*,
        (SELECT COUNT(*) FROM user_group_members ugm WHERE ugm.group_id = g.id) as member_count
      FROM user_groups g
      WHERE g.is_active = true
      ORDER BY g.name
    `);
    return result.rows;
  }

  async getGroupById(id) {
    const result = await this.query('SELECT * FROM user_groups WHERE id = $1', [id]);
    return result.rows[0];
  }

  async createGroup(data) {
    const { name, description, color } = data;
    const result = await this.query(
      'INSERT INTO user_groups (name, description, color) VALUES ($1, $2, $3) RETURNING id',
      [name, description, color || '#607D8B']
    );
    return { id: result.rows[0].id };
  }

  async updateGroup(id, data) {
    const { name, description, color, is_active } = data;
    await this.query(
      'UPDATE user_groups SET name = $1, description = $2, color = $3, is_active = $4 WHERE id = $5',
      [name, description, color, is_active !== false, id]
    );
  }

  async deleteGroup(id) {
    await this.query('UPDATE user_groups SET is_active = false WHERE id = $1', [id]);
  }

  async getGroupMembers(groupId) {
    const result = await this.query(`
      SELECT u.id, u.username, u.first_name, u.role, u.status, ugm.added_at
      FROM users u
      JOIN user_group_members ugm ON u.id = ugm.user_id
      WHERE ugm.group_id = $1
      ORDER BY u.first_name
    `, [groupId]);
    return result.rows;
  }

  async addUserToGroup(userId, groupId) {
    await this.query(
      'INSERT INTO user_group_members (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, groupId]
    );
  }

  async removeUserFromGroup(userId, groupId) {
    await this.query(
      'DELETE FROM user_group_members WHERE user_id = $1 AND group_id = $2',
      [userId, groupId]
    );
  }

  async getUserGroups(userId) {
    const result = await this.query(`
      SELECT g.*
      FROM user_groups g
      JOIN user_group_members ugm ON g.id = ugm.group_id
      WHERE ugm.user_id = $1 AND g.is_active = true
      ORDER BY g.name
    `, [userId]);
    return result.rows;
  }

  // ============ ОБЪЕКТЫ ============

  async getAllObjects() {
    const result = await this.query(`
      SELECT * FROM objects WHERE is_active = true ORDER BY name
    `);
    return result.rows;
  }

  async getObjectById(id) {
    const result = await this.query('SELECT * FROM objects WHERE id = $1', [id]);
    return result.rows[0];
  }

  async createObject(data) {
    const { name, address, description } = data;
    const result = await this.query(
      'INSERT INTO objects (name, address, description) VALUES ($1, $2, $3) RETURNING id',
      [name, address, description]
    );
    return { id: result.rows[0].id };
  }

  async updateObject(id, data) {
    const { name, address, description, is_active } = data;
    await this.query(
      'UPDATE objects SET name = $1, address = $2, description = $3, is_active = $4 WHERE id = $5',
      [name, address, description, is_active !== false, id]
    );
  }

  async deleteObject(id) {
    await this.query('UPDATE objects SET is_active = false WHERE id = $1', [id]);
  }

  // ============ НАЗНАЧЕНИЯ (ЗАДАНИЯ) ============

  async getAllAssignments() {
    const result = await this.query(`
      SELECT a.*,
        p.name as process_name,
        o.name as object_name,
        u.first_name as user_name, u.username,
        g.name as group_name
      FROM assignments a
      LEFT JOIN processes p ON a.process_id = p.id
      LEFT JOIN objects o ON a.object_id = o.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN user_groups g ON a.group_id = g.id
      WHERE a.status != 'deleted'
      ORDER BY a.priority DESC, a.created_at DESC
    `);
    return result.rows;
  }

  async getAssignmentById(id) {
    const result = await this.query(`
      SELECT a.*,
        p.name as process_name,
        o.name as object_name,
        u.first_name as user_name,
        g.name as group_name
      FROM assignments a
      LEFT JOIN processes p ON a.process_id = p.id
      LEFT JOIN objects o ON a.object_id = o.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN user_groups g ON a.group_id = g.id
      WHERE a.id = $1
    `, [id]);
    return result.rows[0];
  }

  async createAssignment(data) {
    const { name, description, process_id, object_id, user_id, group_id, start_date, end_date, is_recurring, recurrence_type, priority } = data;
    const result = await this.query(
      `INSERT INTO assignments (name, description, process_id, object_id, user_id, group_id, start_date, end_date, is_recurring, recurrence_type, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [name, description, process_id, object_id || null, user_id || null, group_id || null, start_date || null, end_date || null, is_recurring || false, recurrence_type || null, priority || 0]
    );
    return { id: result.rows[0].id };
  }

  async updateAssignment(id, data) {
    const { name, description, process_id, object_id, user_id, group_id, start_date, end_date, is_recurring, recurrence_type, priority, status } = data;
    await this.query(
      `UPDATE assignments SET name = $1, description = $2, process_id = $3, object_id = $4,
       user_id = $5, group_id = $6, start_date = $7, end_date = $8, is_recurring = $9,
       recurrence_type = $10, priority = $11, status = $12
       WHERE id = $13`,
      [name, description, process_id, object_id, user_id, group_id, start_date, end_date, is_recurring, recurrence_type, priority, status || 'active', id]
    );
  }

  async deleteAssignment(id) {
    await this.query('UPDATE assignments SET status = $1 WHERE id = $2', ['deleted', id]);
  }

  // Получить назначения для конкретного пользователя
  async getUserAssignments(userId) {
    const result = await this.query(`
      SELECT a.*,
        p.name as process_name, p.description as process_description,
        p.is_sequential, p.estimated_duration,
        o.name as object_name, o.address as object_address,
        pc.icon as category_icon, pc.color as category_color
      FROM assignments a
      JOIN processes p ON a.process_id = p.id
      LEFT JOIN objects o ON a.object_id = o.id
      LEFT JOIN process_categories pc ON p.category_id = pc.id
      WHERE a.status = 'active'
        AND (
          a.user_id = $1
          OR a.group_id IN (SELECT group_id FROM user_group_members WHERE user_id = $1)
        )
        AND (a.start_date IS NULL OR a.start_date <= CURRENT_DATE)
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
      ORDER BY a.priority DESC, p.name
    `, [userId]);
    return result.rows;
  }

  // ============ РАСШИРЕННЫЕ ЗАПИСИ ВРЕМЕНИ ============

  async startTimeRecordWithContext(userId, processId, objectId = null, assignmentId = null) {
    const startTime = new Date().toISOString();
    const result = await this.query(
      `INSERT INTO time_records (user_id, process_id, object_id, assignment_id, start_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, processId, objectId, assignmentId, startTime]
    );
    return { id: result.rows[0].id, start_time: startTime };
  }

  // ============ ТАЙМИНГИ ПО ШАГАМ ============

  async startStepTiming(timeRecordId, stepId) {
    const startTime = new Date().toISOString();
    const result = await this.query(
      'INSERT INTO step_timings (time_record_id, step_id, start_time) VALUES ($1, $2, $3) RETURNING id',
      [timeRecordId, stepId, startTime]
    );
    return { id: result.rows[0].id, start_time: startTime };
  }

  async stopStepTiming(timingId) {
    const endTime = new Date().toISOString();
    const timing = await this.query('SELECT start_time FROM step_timings WHERE id = $1', [timingId]);

    if (timing.rows[0]) {
      const duration = Math.floor((new Date(endTime) - new Date(timing.rows[0].start_time)) / 1000);
      await this.query(
        'UPDATE step_timings SET end_time = $1, duration = $2 WHERE id = $3',
        [endTime, duration, timingId]
      );
      return { end_time: endTime, duration };
    }
    return null;
  }

  async getStepTimings(timeRecordId) {
    const result = await this.query(`
      SELECT st.*, ps.name as step_name, ps.step_number
      FROM step_timings st
      JOIN process_steps ps ON st.step_id = ps.id
      WHERE st.time_record_id = $1
      ORDER BY ps.step_number
    `, [timeRecordId]);
    return result.rows;
  }

  // ============ РАСШИРЕННАЯ АНАЛИТИКА ============

  // Детализация по конкретному процессу с временем по шагам
  async getProcessDetailedAnalytics(processId, startDate, endDate) {
    let dateFilter = '';
    const params = [processId];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND DATE(tr.start_time) >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND DATE(tr.start_time) <= $${params.length}`;
    }

    // Общая статистика по процессу
    const summary = await this.query(`
      SELECT
        COUNT(*) as total_executions,
        AVG(tr.duration) as avg_duration,
        MIN(tr.duration) as min_duration,
        MAX(tr.duration) as max_duration,
        SUM(tr.duration) as total_duration,
        COUNT(DISTINCT tr.user_id) as unique_users,
        COUNT(DISTINCT tr.object_id) as unique_objects
      FROM time_records tr
      WHERE tr.process_id = $1 AND tr.end_time IS NOT NULL ${dateFilter}
    `, params);

    // Статистика по шагам
    const stepStats = await this.query(`
      SELECT
        ps.id as step_id,
        ps.step_number,
        ps.name as step_name,
        ps.estimated_duration,
        COUNT(st.id) as execution_count,
        AVG(st.duration) as avg_duration,
        MIN(st.duration) as min_duration,
        MAX(st.duration) as max_duration
      FROM process_steps ps
      LEFT JOIN step_timings st ON ps.id = st.step_id
      LEFT JOIN time_records tr ON st.time_record_id = tr.id
      WHERE ps.process_id = $1 ${dateFilter.replace(/tr\./g, 'tr.')}
      GROUP BY ps.id, ps.step_number, ps.name, ps.estimated_duration
      ORDER BY ps.step_number
    `, params);

    // Статистика по пользователям для этого процесса
    const userStats = await this.query(`
      SELECT
        u.id, u.first_name, u.username,
        COUNT(*) as execution_count,
        AVG(tr.duration) as avg_duration,
        SUM(tr.duration) as total_duration
      FROM time_records tr
      JOIN users u ON tr.user_id = u.id
      WHERE tr.process_id = $1 AND tr.end_time IS NOT NULL ${dateFilter}
      GROUP BY u.id, u.first_name, u.username
      ORDER BY execution_count DESC
    `, params);

    // Статистика по объектам для этого процесса
    const objectStats = await this.query(`
      SELECT
        o.id, o.name,
        COUNT(*) as execution_count,
        AVG(tr.duration) as avg_duration,
        SUM(tr.duration) as total_duration
      FROM time_records tr
      JOIN objects o ON tr.object_id = o.id
      WHERE tr.process_id = $1 AND tr.end_time IS NOT NULL AND tr.object_id IS NOT NULL ${dateFilter}
      GROUP BY o.id, o.name
      ORDER BY execution_count DESC
    `, params);

    return {
      summary: summary.rows[0],
      stepStats: stepStats.rows,
      userStats: userStats.rows,
      objectStats: objectStats.rows
    };
  }

  // Аналитика по объекту
  async getObjectAnalytics(objectId, startDate, endDate) {
    let dateFilter = '';
    const params = [objectId];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND DATE(tr.start_time) >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND DATE(tr.start_time) <= $${params.length}`;
    }

    const result = await this.query(`
      SELECT
        p.id as process_id,
        p.name as process_name,
        COUNT(*) as execution_count,
        AVG(tr.duration) as avg_duration,
        SUM(tr.duration) as total_duration
      FROM time_records tr
      JOIN processes p ON tr.process_id = p.id
      WHERE tr.object_id = $1 AND tr.end_time IS NOT NULL ${dateFilter}
      GROUP BY p.id, p.name
      ORDER BY execution_count DESC
    `, params);

    return result.rows;
  }

  // Аналитика по группе пользователей
  async getGroupAnalytics(groupId, startDate, endDate) {
    let dateFilter = '';
    const params = [groupId];

    if (startDate) {
      params.push(startDate);
      dateFilter += ` AND DATE(tr.start_time) >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      dateFilter += ` AND DATE(tr.start_time) <= $${params.length}`;
    }

    const result = await this.query(`
      SELECT
        u.id as user_id,
        u.first_name,
        u.username,
        p.id as process_id,
        p.name as process_name,
        COUNT(*) as execution_count,
        AVG(tr.duration) as avg_duration,
        SUM(tr.duration) as total_duration
      FROM time_records tr
      JOIN users u ON tr.user_id = u.id
      JOIN processes p ON tr.process_id = p.id
      JOIN user_group_members ugm ON u.id = ugm.user_id
      WHERE ugm.group_id = $1 AND tr.end_time IS NOT NULL ${dateFilter}
      GROUP BY u.id, u.first_name, u.username, p.id, p.name
      ORDER BY u.first_name, execution_count DESC
    `, params);

    return result.rows;
  }

  // Сохранение фото (base64)
  async savePhoto(recordId, stepId, fileData, comment) {
    const result = await this.query(
      'INSERT INTO photos (record_id, step_id, file_data, comment) VALUES ($1, $2, $3, $4) RETURNING id',
      [recordId, stepId, fileData, comment]
    );
    return { id: result.rows[0].id };
  }

  async getRecordPhotos(recordId) {
    const result = await this.query(`
      SELECT p.*, ps.name as step_name
      FROM photos p
      LEFT JOIN process_steps ps ON p.step_id = ps.id
      WHERE p.record_id = $1
      ORDER BY p.created_at
    `, [recordId]);
    return result.rows;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = Database;
