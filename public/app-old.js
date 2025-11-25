// Управление состоянием приложения
const App = {
    user: null,
    activeProcess: null,
    timerInterval: null,
    processes: [
        { id: 1, name: 'Приемка товара', description: 'Разгрузка и приемка товара от поставщиков' },
        { id: 2, name: 'Выкладка товара', description: 'Размещение товара на полках' },
        { id: 3, name: 'Работа на кассе', description: 'Обслуживание покупателей на кассе' },
        { id: 4, name: 'Инвентаризация', description: 'Проверка и учет товара' },
        { id: 5, name: 'Уборка торгового зала', description: 'Поддержание чистоты в магазине' },
        { id: 6, name: 'Консультация покупателей', description: 'Помощь покупателям в выборе товара' },
        { id: 7, name: 'Оформление витрин', description: 'Декорирование и обновление витрин' },
        { id: 8, name: 'Списание товара', description: 'Учет испорченного или просроченного товара' }
    ]
};

// IndexedDB для локального хранения
const DB = {
    name: 'ChronometryDB',
    version: 1,
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Хранилище записей
                if (!db.objectStoreNames.contains('records')) {
                    const recordsStore = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
                    recordsStore.createIndex('userId', 'userId', { unique: false });
                    recordsStore.createIndex('synced', 'synced', { unique: false });
                    recordsStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // Хранилище фото
                if (!db.objectStoreNames.contains('photos')) {
                    const photosStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
                    photosStore.createIndex('recordId', 'recordId', { unique: false });
                }

                // Хранилище пользователя
                if (!db.objectStoreNames.contains('user')) {
                    db.createObjectStore('user', { keyPath: 'id' });
                }
            };
        });
    },

    async getUser() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['user'], 'readonly');
            const store = transaction.objectStore('user');
            const request = store.get(1);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async saveUser(user) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['user'], 'readwrite');
            const store = transaction.objectStore('user');
            const request = store.put({ id: 1, ...user });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async addRecord(record) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['records'], 'readwrite');
            const store = transaction.objectStore('records');
            const request = store.add(record);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getRecord(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['records'], 'readonly');
            const store = transaction.objectStore('records');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async updateRecord(id, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['records'], 'readwrite');
            const store = transaction.objectStore('records');
            const getRequest = store.get(id);

            getRequest.onsuccess = () => {
                const record = getRequest.result;
                const updatedRecord = { ...record, ...data };
                const updateRequest = store.put(updatedRecord);

                updateRequest.onsuccess = () => resolve(updatedRecord);
                updateRequest.onerror = () => reject(updateRequest.error);
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    },

    async getActiveRecord(userId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['records'], 'readonly');
            const store = transaction.objectStore('records');
            const index = store.index('userId');
            const request = index.openCursor(IDBKeyRange.only(userId));

            let activeRecord = null;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const record = cursor.value;
                    if (!record.endTime) {
                        activeRecord = record;
                    }
                    cursor.continue();
                } else {
                    resolve(activeRecord);
                }
            };

            request.onerror = () => reject(request.error);
        });
    },

    async getRecords(userId, limit = 10) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['records'], 'readonly');
            const store = transaction.objectStore('records');
            const index = store.index('userId');
            const request = index.openCursor(IDBKeyRange.only(userId), 'prev');

            const records = [];
            let count = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && count < limit) {
                    records.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(records);
                }
            };

            request.onerror = () => reject(request.error);
        });
    },

    async getTodayStats(userId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['records'], 'readonly');
            const store = transaction.objectStore('records');
            const index = store.index('userId');
            const request = index.openCursor(IDBKeyRange.only(userId));

            const today = new Date().setHours(0, 0, 0, 0);
            let taskCount = 0;
            let totalTime = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const record = cursor.value;
                    const recordDate = new Date(record.startTime).setHours(0, 0, 0, 0);

                    if (recordDate === today && record.endTime) {
                        taskCount++;
                        totalTime += record.duration;
                    }
                    cursor.continue();
                } else {
                    resolve({ taskCount, totalTime });
                }
            };

            request.onerror = () => reject(request.error);
        });
    },

    async addPhoto(photo) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');
            const request = store.add(photo);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getPhotosCount(recordId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['photos'], 'readonly');
            const store = transaction.objectStore('photos');
            const index = store.index('recordId');
            const request = index.count(recordId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
};

// Утилиты
const Utils = {
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        const parts = [];
        if (hours > 0) parts.push(`${hours}ч`);
        if (minutes > 0) parts.push(`${minutes}м`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}с`);

        return parts.join(' ');
    },

    formatTime(date) {
        return new Date(date).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    formatDateTime(date) {
        return new Date(date).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    getCurrentTimer(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        const diff = Math.floor((now - start) / 1000);
        return diff;
    },

    formatTimerDisplay(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
};

// UI управление
const UI = {
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        document.getElementById(screenId).classList.remove('hidden');
    },

    showElement(elementId) {
        document.getElementById(elementId).classList.remove('hidden');
    },

    hideElement(elementId) {
        document.getElementById(elementId).classList.add('hidden');
    },

    renderProcessList() {
        const container = document.getElementById('process-list');
        container.innerHTML = App.processes.map(process => `
            <div class="process-item" data-process-id="${process.id}">
                <div class="process-item-name">${process.name}</div>
                <div class="process-item-desc">${process.description}</div>
            </div>
        `).join('');

        // Добавляем обработчики
        container.querySelectorAll('.process-item').forEach(item => {
            item.addEventListener('click', () => {
                const processId = parseInt(item.dataset.processId);
                Actions.startProcess(processId);
            });
        });
    },

    async renderHistory() {
        if (!App.user) return;

        const container = document.getElementById('history-list');
        const records = await DB.getRecords(App.user.id, 10);

        if (records.length === 0) {
            container.innerHTML = '<div class="history-empty">История пуста</div>';
            return;
        }

        const historyHTML = await Promise.all(records.map(async (record) => {
            const process = App.processes.find(p => p.id === record.processId);
            const photosCount = await DB.getPhotosCount(record.id);

            return `
                <div class="history-item">
                    <div class="history-item-header">
                        <div class="history-item-name">${process.name}</div>
                        <div class="history-item-time">${Utils.formatTime(record.startTime)}</div>
                    </div>
                    ${record.endTime ? `
                        <div class="history-item-duration">⏱ ${Utils.formatDuration(record.duration)}</div>
                    ` : `
                        <div class="history-item-duration" style="color: var(--warning-color);">⏱ В процессе...</div>
                    `}
                    ${record.comment ? `
                        <div class="history-item-comment">💬 ${record.comment}</div>
                    ` : ''}
                    ${photosCount > 0 ? `
                        <div class="history-item-photos">📷 Фото: ${photosCount}</div>
                    ` : ''}
                </div>
            `;
        }));

        container.innerHTML = historyHTML.join('');
    },

    async renderStats() {
        if (!App.user) return;

        const { taskCount, totalTime } = await DB.getTodayStats(App.user.id);

        document.getElementById('stat-tasks').textContent = taskCount;
        document.getElementById('stat-time').textContent = Utils.formatDuration(totalTime);

        // Подсчитываем общее количество фото за сегодня
        // Для упрощения пока показываем 0
        document.getElementById('stat-photos').textContent = '0';
    },

    updateActiveProcess(record) {
        if (!record) {
            UI.hideElement('active-process');
            return;
        }

        const process = App.processes.find(p => p.id === record.processId);

        UI.showElement('active-process');
        document.getElementById('active-process-name').textContent = process.name;
        document.getElementById('active-process-started').textContent = Utils.formatTime(record.startTime);

        // Запускаем таймер
        if (App.timerInterval) clearInterval(App.timerInterval);

        const updateTimer = () => {
            const elapsed = Utils.getCurrentTimer(record.startTime);
            document.getElementById('active-process-time').textContent = Utils.formatTimerDisplay(elapsed);
        };

        updateTimer();
        App.timerInterval = setInterval(updateTimer, 1000);
    },

    updateConnectionStatus(online) {
        const banner = document.getElementById('connection-status');
        if (online) {
            banner.classList.add('hidden');
        } else {
            banner.classList.remove('hidden');
        }
    }
};

// Действия
const Actions = {
    async login() {
        const username = document.getElementById('username-input').value.trim();
        if (!username) {
            alert('Введите ваше имя');
            return;
        }

        App.user = {
            id: 1,
            name: username,
            createdAt: new Date().toISOString()
        };

        await DB.saveUser(App.user);
        await this.showMainScreen();
    },

    async logout() {
        if (!confirm('Вы уверены, что хотите выйти?')) return;

        // Останавливаем таймер
        if (App.timerInterval) {
            clearInterval(App.timerInterval);
        }

        App.user = null;
        App.activeProcess = null;
        UI.showScreen('auth-screen');
    },

    async showMainScreen() {
        UI.showScreen('main-screen');
        document.getElementById('user-greeting').textContent = `Привет, ${App.user.name}!`;

        UI.renderProcessList();
        await this.checkActiveProcess();
        await UI.renderHistory();
        await UI.renderStats();
    },

    async checkActiveProcess() {
        const activeRecord = await DB.getActiveRecord(App.user.id);
        App.activeProcess = activeRecord;
        UI.updateActiveProcess(activeRecord);
    },

    async startProcess(processId) {
        if (App.activeProcess) {
            alert('У вас уже запущен процесс! Завершите его перед началом нового.');
            return;
        }

        const record = {
            userId: App.user.id,
            processId: processId,
            startTime: new Date().toISOString(),
            endTime: null,
            duration: 0,
            comment: null,
            synced: false
        };

        const recordId = await DB.addRecord(record);
        record.id = recordId;

        App.activeProcess = record;
        UI.updateActiveProcess(record);

        await UI.renderHistory();
        await UI.renderStats();
    },

    showFinishModal() {
        if (!App.activeProcess) {
            alert('Нет активного процесса');
            return;
        }

        const process = App.processes.find(p => p.id === App.activeProcess.processId);
        const duration = Utils.getCurrentTimer(App.activeProcess.startTime);

        document.getElementById('finish-process-name').textContent = process.name;
        document.getElementById('finish-duration').textContent = Utils.formatDuration(duration);
        document.getElementById('comment-input').value = '';

        UI.showElement('finish-modal');
    },

    hideFinishModal() {
        UI.hideElement('finish-modal');
    },

    async finishProcess() {
        const comment = document.getElementById('comment-input').value.trim() || null;
        const endTime = new Date().toISOString();
        const duration = Utils.getCurrentTimer(App.activeProcess.startTime);

        await DB.updateRecord(App.activeProcess.id, {
            endTime,
            duration,
            comment
        });

        // Останавливаем таймер
        if (App.timerInterval) {
            clearInterval(App.timerInterval);
            App.timerInterval = null;
        }

        App.activeProcess = null;
        UI.updateActiveProcess(null);
        this.hideFinishModal();

        await UI.renderHistory();
        await UI.renderStats();

        alert('✅ Работа завершена!');
    },

    async addPhoto() {
        if (!App.activeProcess) {
            alert('Нет активного процесса');
            return;
        }

        document.getElementById('photo-input').click();
    },

    async handlePhotoSelected(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Конвертируем в base64
        const reader = new FileReader();
        reader.onload = async (e) => {
            const photo = {
                recordId: App.activeProcess.id,
                data: e.target.result,
                createdAt: new Date().toISOString(),
                synced: false
            };

            await DB.addPhoto(photo);
            alert('📷 Фото добавлено!');
        };

        reader.readAsDataURL(file);

        // Очищаем input
        event.target.value = '';
    }
};

// Инициализация приложения
async function initApp() {
    console.log('🚀 Инициализация приложения...');

    // Инициализируем IndexedDB
    await DB.init();
    console.log('✅ IndexedDB инициализирован');

    // Проверяем авторизацию
    const savedUser = await DB.getUser();
    if (savedUser) {
        App.user = savedUser;
        await Actions.showMainScreen();
    } else {
        UI.showScreen('auth-screen');
    }

    // Отслеживаем статус подключения
    window.addEventListener('online', () => {
        console.log('✅ Интернет подключен');
        UI.updateConnectionStatus(true);
    });

    window.addEventListener('offline', () => {
        console.log('⚠️ Интернет отключен - работаем оффлайн');
        UI.updateConnectionStatus(false);
    });

    UI.updateConnectionStatus(navigator.onLine);

    // Обработчики событий
    document.getElementById('login-btn').addEventListener('click', () => Actions.login());
    document.getElementById('logout-btn').addEventListener('click', () => Actions.logout());
    document.getElementById('stop-process-btn').addEventListener('click', () => Actions.showFinishModal());
    document.getElementById('cancel-finish-btn').addEventListener('click', () => Actions.hideFinishModal());
    document.getElementById('confirm-finish-btn').addEventListener('click', () => Actions.finishProcess());
    document.getElementById('add-photo-btn').addEventListener('click', () => Actions.addPhoto());
    document.getElementById('photo-input').addEventListener('change', (e) => Actions.handlePhotoSelected(e));

    // Enter для входа
    document.getElementById('username-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') Actions.login();
    });

    console.log('✅ Приложение готово к работе!');
}

// Регистрация Service Worker для PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker зарегистрирован', reg))
            .catch(err => console.log('❌ Ошибка Service Worker', err));
    });
}

// Запускаем приложение
initApp();
