// Расширение для админ-функций БД
const Database = require('./database');

class DatabaseAdmin extends Database {
  initTables() {
    // Вызываем родительский метод
    super.initTables();

    this.db.serialize(() => {
      // Таблица категорий процессов
      this.db.run(`
        CREATE TABLE IF NOT EXISTS process_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          icon TEXT,
          color TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Обновляем таблицу процессов (добавляем новые поля)
      this.db.run(`
        ALTER TABLE processes ADD COLUMN category_id INTEGER REFERENCES process_categories(id)
      `, () => {});

      this.db.run(`
        ALTER TABLE processes ADD COLUMN estimated_duration INTEGER DEFAULT 0
      `, () => {});

      this.db.run(`
        ALTER TABLE processes ADD COLUMN priority INTEGER DEFAULT 0
      `, () => {});

      this.db.run(`
        ALTER TABLE processes ADD COLUMN is_sequential INTEGER DEFAULT 0
      `, () => {});

      this.db.run(`
        ALTER TABLE processes ADD COLUMN is_active INTEGER DEFAULT 1
      `, () => {});

      // Таблица шагов процесса
      this.db.run(`
        CREATE TABLE IF NOT EXISTS process_steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          process_id INTEGER NOT NULL,
          step_number INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          estimated_duration INTEGER DEFAULT 0,
          requires_photo INTEGER DEFAULT 0,
          photo_instructions TEXT,
          is_required INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
        )
      `);

      // Таблица выполнения шагов
      this.db.run(`
        CREATE TABLE IF NOT EXISTS step_completions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          time_record_id INTEGER NOT NULL,
          step_id INTEGER NOT NULL,
          completed_at DATETIME,
          has_photo INTEGER DEFAULT 0,
          comment TEXT,
          FOREIGN KEY (time_record_id) REFERENCES time_records(id) ON DELETE CASCADE,
          FOREIGN KEY (step_id) REFERENCES process_steps(id)
        )
      `);

      // Связываем фото с шагами
      this.db.run(`
        ALTER TABLE photos ADD COLUMN step_id INTEGER REFERENCES process_steps(id)
      `, () => {});

      // Вставка базовых категорий
      this.db.run(`
        INSERT OR IGNORE INTO process_categories (id, name, icon, color) VALUES
        (1, 'Логистика', '🚚', '#FF9800'),
        (2, 'Продажи', '💰', '#4CAF50'),
        (3, 'Склад', '📦', '#2196F3'),
        (4, 'Клининг', '🧹', '#9C27B0'),
        (5, 'Администрирование', '📋', '#607D8B')
      `);
    });
  }

  // ============ КАТЕГОРИИ ============

  getAllCategories() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM process_categories ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  createCategory(name, icon, color) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO process_categories (name, icon, color) VALUES (?, ?, ?)',
        [name, icon, color],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  // ============ ПРОЦЕССЫ (ADMIN) ============

  createProcess(data) {
    return new Promise((resolve, reject) => {
      const { name, description, category_id, estimated_duration, priority, is_sequential } = data;

      this.db.run(
        `INSERT INTO processes (name, description, category_id, estimated_duration, priority, is_sequential)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, description, category_id, estimated_duration || 0, priority || 0, is_sequential ? 1 : 0],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  updateProcess(id, data) {
    return new Promise((resolve, reject) => {
      const { name, description, category_id, estimated_duration, priority, is_sequential, is_active } = data;

      this.db.run(
        `UPDATE processes
         SET name = ?, description = ?, category_id = ?, estimated_duration = ?,
             priority = ?, is_sequential = ?, is_active = ?
         WHERE id = ?`,
        [name, description, category_id, estimated_duration, priority, is_sequential ? 1 : 0, is_active ? 1 : 0, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  deleteProcess(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM processes WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getProcessWithSteps(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT p.*, pc.name as category_name, pc.icon as category_icon
         FROM processes p
         LEFT JOIN process_categories pc ON p.category_id = pc.id
         WHERE p.id = ?`,
        [id],
        async (err, process) => {
          if (err) {
            reject(err);
          } else if (!process) {
            resolve(null);
          } else {
            // Получаем шаги процесса
            const steps = await this.getProcessSteps(id);
            resolve({ ...process, steps });
          }
        }
      );
    });
  }

  getAllProcessesWithSteps() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT p.*, pc.name as category_name, pc.icon as category_icon, pc.color as category_color
         FROM processes p
         LEFT JOIN process_categories pc ON p.category_id = pc.id
         WHERE p.is_active = 1
         ORDER BY p.priority DESC, p.name`,
        async (err, processes) => {
          if (err) {
            reject(err);
          } else {
            // Получаем шаги для каждого процесса
            const processesWithSteps = await Promise.all(
              processes.map(async (process) => {
                const steps = await this.getProcessSteps(process.id);
                return { ...process, steps };
              })
            );
            resolve(processesWithSteps);
          }
        }
      );
    });
  }

  // ============ ШАГИ ПРОЦЕССА ============

  getProcessSteps(processId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM process_steps WHERE process_id = ? ORDER BY step_number',
        [processId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  createProcessStep(data) {
    return new Promise((resolve, reject) => {
      const { process_id, step_number, name, description, estimated_duration, requires_photo, photo_instructions, is_required } = data;

      this.db.run(
        `INSERT INTO process_steps
         (process_id, step_number, name, description, estimated_duration, requires_photo, photo_instructions, is_required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [process_id, step_number, name, description, estimated_duration || 0, requires_photo ? 1 : 0, photo_instructions, is_required ? 1 : 0],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  updateProcessStep(id, data) {
    return new Promise((resolve, reject) => {
      const { step_number, name, description, estimated_duration, requires_photo, photo_instructions, is_required } = data;

      this.db.run(
        `UPDATE process_steps
         SET step_number = ?, name = ?, description = ?, estimated_duration = ?,
             requires_photo = ?, photo_instructions = ?, is_required = ?
         WHERE id = ?`,
        [step_number, name, description, estimated_duration, requires_photo ? 1 : 0, photo_instructions, is_required ? 1 : 0, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  deleteProcessStep(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM process_steps WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // ============ ВЫПОЛНЕНИЕ ШАГОВ ============

  startStepCompletion(timeRecordId, stepId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO step_completions (time_record_id, step_id) VALUES (?, ?)',
        [timeRecordId, stepId],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  completeStep(completionId, comment, hasPhoto) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE step_completions
         SET completed_at = datetime('now'), comment = ?, has_photo = ?
         WHERE id = ?`,
        [comment, hasPhoto ? 1 : 0, completionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getStepCompletions(timeRecordId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT sc.*, ps.name as step_name, ps.requires_photo
         FROM step_completions sc
         JOIN process_steps ps ON sc.step_id = ps.id
         WHERE sc.time_record_id = ?
         ORDER BY ps.step_number`,
        [timeRecordId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // ============ РОЛИ ПОЛЬЗОВАТЕЛЕЙ ============

  setUserRole(userId, role) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET role = ? WHERE id = ?',
        [role, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM users ORDER BY created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Сделать первого пользователя админом
  makeFirstUserAdmin() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM users WHERE role = "admin"', async (err, row) => {
        if (err) {
          reject(err);
        } else if (row.count === 0) {
          // Нет админов, делаем первого пользователя админом
          this.db.run('UPDATE users SET role = "admin" WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)', (err) => {
            if (err) reject(err);
            else resolve(true);
          });
        } else {
          resolve(false);
        }
      });
    });
  }
}

module.exports = DatabaseAdmin;
