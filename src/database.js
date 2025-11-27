const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
        comment TEXT,
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

  async close() {
    await this.pool.end();
  }
}

module.exports = Database;
