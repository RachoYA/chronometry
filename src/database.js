const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Ошибка подключения к БД:', err);
      } else {
        console.log('Подключено к базе данных SQLite');
        this.initTables();
      }
    });
  }

  initTables() {
    this.db.serialize(() => {
      // Таблица пользователей
      this.db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY,
          telegram_id INTEGER UNIQUE NOT NULL,
          username TEXT,
          first_name TEXT,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Таблица процессов магазина
      this.db.run(`
        CREATE TABLE IF NOT EXISTS processes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Таблица записей хронометража
      this.db.run(`
        CREATE TABLE IF NOT EXISTS time_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          process_id INTEGER NOT NULL,
          start_time DATETIME NOT NULL,
          end_time DATETIME,
          duration INTEGER,
          comment TEXT,
          synced INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (process_id) REFERENCES processes(id)
        )
      `);

      // Таблица фотографий
      this.db.run(`
        CREATE TABLE IF NOT EXISTS photos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          time_record_id INTEGER NOT NULL,
          file_id TEXT NOT NULL,
          file_path TEXT,
          comment TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (time_record_id) REFERENCES time_records(id)
        )
      `);

      // Вставка базовых процессов
      this.db.run(`
        INSERT OR IGNORE INTO processes (id, name, description) VALUES
        (1, 'Приемка товара', 'Разгрузка и приемка товара от поставщиков'),
        (2, 'Выкладка товара', 'Размещение товара на полках'),
        (3, 'Работа на кассе', 'Обслуживание покупателей на кассе'),
        (4, 'Инвентаризация', 'Проверка и учет товара'),
        (5, 'Уборка торгового зала', 'Поддержание чистоты в магазине'),
        (6, 'Консультация покупателей', 'Помощь покупателям в выборе товара'),
        (7, 'Оформление витрин', 'Декорирование и обновление витрин'),
        (8, 'Списание товара', 'Учет испорченного или просроченного товара')
      `);
    });
  }

  // Пользователи
  getOrCreateUser(telegramUser) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [telegramUser.id],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve(row);
          } else {
            this.db.run(
              'INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)',
              [telegramUser.id, telegramUser.username, telegramUser.first_name],
              function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve({ id: this.lastID, telegram_id: telegramUser.id });
                }
              }
            );
          }
        }
      );
    });
  }

  // Процессы
  getAllProcesses() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM processes ORDER BY id', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  getProcessById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM processes WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Записи хронометража
  startTimeRecord(userId, processId) {
    return new Promise((resolve, reject) => {
      const startTime = new Date().toISOString();
      this.db.run(
        'INSERT INTO time_records (user_id, process_id, start_time) VALUES (?, ?, ?)',
        [userId, processId, startTime],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, start_time: startTime });
        }
      );
    });
  }

  stopTimeRecord(recordId, comment = null) {
    return new Promise((resolve, reject) => {
      const endTime = new Date().toISOString();

      this.db.get(
        'SELECT start_time FROM time_records WHERE id = ?',
        [recordId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          const duration = Math.floor(
            (new Date(endTime) - new Date(row.start_time)) / 1000
          );

          this.db.run(
            'UPDATE time_records SET end_time = ?, duration = ?, comment = ? WHERE id = ?',
            [endTime, duration, comment, recordId],
            (err) => {
              if (err) reject(err);
              else resolve({ end_time: endTime, duration });
            }
          );
        }
      );
    });
  }

  getActiveRecord(userId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT tr.*, p.name as process_name
         FROM time_records tr
         JOIN processes p ON tr.process_id = p.id
         WHERE tr.user_id = ? AND tr.end_time IS NULL
         ORDER BY tr.start_time DESC LIMIT 1`,
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getUserRecords(userId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT tr.*, p.name as process_name
         FROM time_records tr
         JOIN processes p ON tr.process_id = p.id
         WHERE tr.user_id = ?
         ORDER BY tr.start_time DESC LIMIT ?`,
        [userId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  getRecordStats(userId, days = 7) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT p.name, COUNT(*) as count, SUM(tr.duration) as total_duration
         FROM time_records tr
         JOIN processes p ON tr.process_id = p.id
         WHERE tr.user_id = ?
         AND tr.start_time >= datetime('now', '-' || ? || ' days')
         AND tr.end_time IS NOT NULL
         GROUP BY p.id, p.name
         ORDER BY total_duration DESC`,
        [userId, days],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Фотографии
  addPhoto(recordId, fileId, filePath, comment = null) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO photos (time_record_id, file_id, file_path, comment) VALUES (?, ?, ?, ?)',
        [recordId, fileId, filePath, comment],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }

  getRecordPhotos(recordId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM photos WHERE time_record_id = ? ORDER BY created_at',
        [recordId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;
