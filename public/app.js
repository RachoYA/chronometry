// Управление состоянием приложения
const App = {
    user: null,
    authToken: localStorage.getItem('userToken'),
    activeProcess: null,
    activeRecord: null,
    currentStepIndex: 0,
    completedSteps: [],
    timerInterval: null,
    processes: [] // Теперь загружаются с сервера
};

// API для работы с сервером
const API = {
    baseURL: '',

    // Обертка для API запросов с авторизацией
    async request(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (App.authToken) {
            headers['Authorization'] = `Bearer ${App.authToken}`;
        }

        const response = await fetch(url, { ...options, headers });

        if (response.status === 401) {
            // Токен истек - выходим
            App.authToken = null;
            localStorage.removeItem('userToken');
            UI.showScreen('auth-screen');
            throw new Error('Сессия истекла');
        }

        return response;
    },

    // Авторизация
    async login(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return response.json().then(data => ({ ...data, status: response.status, ok: response.ok }));
    },

    // Регистрация
    async register(username, password, firstName) {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, firstName })
        });
        return response.json().then(data => ({ ...data, status: response.status, ok: response.ok }));
    },

    // Проверка токена
    async checkAuth() {
        try {
            const response = await this.request('/api/auth/me');
            return await response.json();
        } catch (error) {
            return { success: false };
        }
    },

    async getProcesses() {
        try {
            const response = await this.request('/api/processes');
            if (!response.ok) throw new Error('Failed to load processes');
            return await response.json();
        } catch (error) {
            console.error('Error loading processes:', error);
            // Возвращаем кэшированные процессы если есть
            return App.processes.length > 0 ? App.processes : [];
        }
    },

    async syncRecord(record) {
        try {
            const response = await this.request('/api/sync/records', {
                method: 'POST',
                body: JSON.stringify({ records: [record] })
            });
            return response.ok;
        } catch (error) {
            console.error('Sync error:', error);
            return false;
        }
    }
};

// IndexedDB для локального хранения
const DB = {
    name: 'ChronometryDB',
    version: 2, // Увеличили версию для новой схемы
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

                // Хранилище шагов (НОВОЕ)
                if (!db.objectStoreNames.contains('steps')) {
                    const stepsStore = db.createObjectStore('steps', { keyPath: 'id', autoIncrement: true });
                    stepsStore.createIndex('recordId', 'recordId', { unique: false });
                    stepsStore.createIndex('stepId', 'stepId', { unique: false });
                }

                // Хранилище фото
                if (!db.objectStoreNames.contains('photos')) {
                    const photosStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
                    photosStore.createIndex('recordId', 'recordId', { unique: false });
                    photosStore.createIndex('stepId', 'stepId', { unique: false }); // НОВОЕ
                }

                // Хранилище пользователя
                if (!db.objectStoreNames.contains('user')) {
                    db.createObjectStore('user', { keyPath: 'id' });
                }

                // Кэш процессов (НОВОЕ)
                if (!db.objectStoreNames.contains('processes')) {
                    db.createObjectStore('processes', { keyPath: 'id' });
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

    async cacheProcesses(processes) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['processes'], 'readwrite');
            const store = transaction.objectStore('processes');

            // Очищаем старый кэш
            store.clear();

            // Добавляем новые процессы
            processes.forEach(process => {
                store.put(process);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    },

    async getCachedProcesses() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['processes'], 'readonly');
            const store = transaction.objectStore('processes');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
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

    // НОВОЕ: Управление шагами
    async addStepCompletion(stepData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['steps'], 'readwrite');
            const store = transaction.objectStore('steps');
            const request = store.add(stepData);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getCompletedSteps(recordId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['steps'], 'readonly');
            const store = transaction.objectStore('steps');
            const index = store.index('recordId');
            const request = index.getAll(recordId);

            request.onsuccess = () => resolve(request.result);
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
    },

    async getStepPhotosCount(stepId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['photos'], 'readonly');
            const store = transaction.objectStore('photos');
            const index = store.index('stepId');
            const request = index.count(stepId);

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
    },

    getCategoryColor(categoryColor) {
        return categoryColor || '#2196F3';
    },

    getCategoryIcon(categoryIcon) {
        return categoryIcon || '📋';
    }
};

// UI управление (будет продолжено...)
const UI = {
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.add('hidden');
        });
        document.getElementById(screenId)?.classList.remove('hidden');
    },

    showElement(elementId) {
        document.getElementById(elementId)?.classList.remove('hidden');
    },

    hideElement(elementId) {
        document.getElementById(elementId)?.classList.add('hidden');
    },

    updateConnectionStatus(isOnline) {
        const banner = document.getElementById('connection-status');
        if (isOnline) {
            banner?.classList.add('hidden');
        } else {
            banner?.classList.remove('hidden');
        }
    },

    // НОВОЕ: Отображение процессов с учетом категорий и шагов
    renderProcessList() {
        const container = document.getElementById('process-list');
        if (!container) return;

        if (App.processes.length === 0) {
            container.innerHTML = '<div class="process-empty">Загрузка процессов...</div>';
            return;
        }

        container.innerHTML = App.processes.map(process => {
            const categoryColor = Utils.getCategoryColor(process.category_color);
            const categoryIcon = Utils.getCategoryIcon(process.category_icon);
            const categoryName = process.category_name || '';
            const isSequential = process.is_sequential;
            const stepsCount = process.steps ? process.steps.length : 0;

            return `
                <div class="process-item" data-process-id="${process.id}">
                    ${categoryName ? `
                        <div class="process-category" style="background: ${categoryColor}20; color: ${categoryColor};">
                            ${categoryIcon} ${categoryName}
                        </div>
                    ` : ''}
                    <div class="process-item-name">${process.name}</div>
                    ${process.description ? `
                        <div class="process-item-desc">${process.description}</div>
                    ` : ''}
                    ${isSequential && stepsCount > 0 ? `
                        <div class="process-sequential-badge">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M2 3h12v2H2V3zm0 4h12v2H2V7zm0 4h12v2H2v-2z"/>
                            </svg>
                            ${stepsCount} шагов
                        </div>
                    ` : ''}
                    ${process.estimated_duration > 0 ? `
                        <div class="process-duration">⏱ ~${process.estimated_duration} мин</div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Добавляем обработчики
        container.querySelectorAll('.process-item').forEach(item => {
            item.addEventListener('click', () => {
                const processId = parseInt(item.dataset.processId);
                Actions.startProcess(processId);
            });
        });
    },

    // Отображение шагов процесса с кнопками действий
    renderSteps(process, completedStepIds = []) {
        const container = document.getElementById('steps-container');
        if (!container) return;

        if (!process.is_sequential || !process.steps || process.steps.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');

        const allCompleted = App.currentStepIndex >= process.steps.length;
        const progressPercent = (completedStepIds.length / process.steps.length) * 100;

        const stepsHTML = process.steps.map((step, index) => {
            const isCompleted = completedStepIds.includes(step.id);
            const isCurrent = index === App.currentStepIndex;
            const statusClass = isCompleted ? 'completed' : (isCurrent ? 'current' : 'pending');

            return `
                <div class="step-item ${statusClass}" data-step-id="${step.id}" data-step-index="${index}">
                    <div class="step-number">${isCompleted ? '✓' : index + 1}</div>
                    <div class="step-content">
                        <div class="step-name">${step.name}</div>
                        ${step.description ? `
                            <div class="step-description">${step.description}</div>
                        ` : ''}
                        <div class="step-meta">
                            ${step.estimated_duration > 0 ? `
                                <span class="step-duration">⏱ ~${step.estimated_duration} мин</span>
                            ` : ''}
                            ${step.requires_photo ? `
                                <span class="step-photo-required">📷 Фото</span>
                            ` : ''}
                        </div>
                        ${isCurrent ? `
                            <div class="step-actions">
                                ${step.requires_photo ? `
                                    <button class="btn btn-secondary btn-sm btn-step-photo" data-step-id="${step.id}">
                                        📷 Фото
                                    </button>
                                ` : ''}
                                <button class="btn btn-primary btn-sm btn-complete-step" data-step-index="${index}">
                                    ✓ Выполнено
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="step-status-icon">
                        ${isCompleted ? '✅' : (isCurrent ? '▶️' : '')}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="card-header">
                <h3>📋 Шаги выполнения</h3>
            </div>
            <div class="card-body">
                <div class="steps-progress-container">
                    <div class="steps-progress-bar">
                        <div class="steps-progress-fill" style="width: ${progressPercent}%"></div>
                    </div>
                    <div class="steps-progress-text">
                        ${completedStepIds.length} из ${process.steps.length}
                    </div>
                </div>
                <div class="steps-list">
                    ${stepsHTML}
                </div>
                ${allCompleted ? `
                    <div class="all-steps-completed">
                        🎉 Все шаги выполнены!
                    </div>
                ` : ''}
            </div>
        `;

        // Обработчики кнопок завершения шага
        container.querySelectorAll('.btn-complete-step').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                Actions.completeCurrentStep();
            });
        });

        // Обработчики кнопок фото
        container.querySelectorAll('.btn-step-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stepId = parseInt(btn.dataset.stepId);
                Actions.addPhoto(stepId);
            });
        });
    },

    async renderHistory() {
        if (!App.user) return;

        const container = document.getElementById('history-list');
        if (!container) return;

        const records = await DB.getRecords(App.user.id, 10);

        if (records.length === 0) {
            container.innerHTML = '<div class="history-empty">История пуста</div>';
            return;
        }

        const historyHTML = await Promise.all(records.map(async (record) => {
            const process = App.processes.find(p => p.id === record.processId);
            if (!process) return '';

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
                    ${record.stepsCompleted ? `
                        <div class="history-item-steps">✓ Шагов выполнено: ${record.stepsCompleted}</div>
                    ` : ''}
                </div>
            `;
        }));

        container.innerHTML = historyHTML.filter(h => h).join('');
    },

    async renderStats() {
        if (!App.user) return;

        const stats = await DB.getTodayStats(App.user.id);

        document.getElementById('stat-tasks').textContent = stats.taskCount;
        document.getElementById('stat-time').textContent = Utils.formatDuration(stats.totalTime);
    },

    updateActiveProcess() {
        if (!App.activeProcess || !App.activeRecord) {
            UI.hideElement('active-process');
            UI.hideElement('current-step-info');
            document.getElementById('complete-step-btn')?.classList.add('hidden');
            return;
        }

        UI.showElement('active-process');

        const process = App.processes.find(p => p.id === App.activeProcess.id);
        document.getElementById('active-process-name').textContent = process?.name || 'Процесс';
        document.getElementById('active-process-started').textContent = Utils.formatTime(App.activeRecord.startTime);

        // Обновляем UI для многошаговых процессов
        const currentStepInfo = document.getElementById('current-step-info');
        const completeStepBtn = document.getElementById('complete-step-btn');

        if (process && process.is_sequential && process.steps && process.steps.length > 0) {
            const currentStep = process.steps[App.currentStepIndex];
            const allCompleted = App.currentStepIndex >= process.steps.length;

            if (allCompleted) {
                // Все шаги выполнены
                currentStepInfo.classList.remove('hidden');
                document.getElementById('step-progress').textContent = `${process.steps.length}/${process.steps.length}`;
                document.getElementById('current-step-name').textContent = '🎉 Все шаги выполнены!';
                document.getElementById('current-step-desc').textContent = 'Можете завершить процесс';
                completeStepBtn.classList.add('hidden');
            } else {
                // Показываем текущий шаг
                currentStepInfo.classList.remove('hidden');
                document.getElementById('step-progress').textContent = `${App.currentStepIndex + 1}/${process.steps.length}`;
                document.getElementById('current-step-name').textContent = currentStep.name;
                document.getElementById('current-step-desc').textContent = currentStep.description || '';

                // Показываем кнопку завершения шага
                completeStepBtn.classList.remove('hidden');
                completeStepBtn.textContent = currentStep.requires_photo
                    ? '📷 + ✓ Завершить шаг'
                    : '✓ Шаг выполнен';
            }

            // Отображаем список шагов (сворачиваемый)
            UI.renderSteps(process, App.completedSteps.map(s => s.stepId));
        } else {
            // Обычный процесс без шагов
            currentStepInfo.classList.add('hidden');
            completeStepBtn.classList.add('hidden');
            UI.hideElement('steps-container');
        }
    },

    startTimer() {
        if (App.timerInterval) {
            clearInterval(App.timerInterval);
        }

        const updateTimer = () => {
            if (App.activeRecord) {
                const seconds = Utils.getCurrentTimer(App.activeRecord.startTime);
                document.getElementById('active-process-time').textContent = Utils.formatTimerDisplay(seconds);
            }
        };

        updateTimer();
        App.timerInterval = setInterval(updateTimer, 1000);
    },

    stopTimer() {
        if (App.timerInterval) {
            clearInterval(App.timerInterval);
            App.timerInterval = null;
        }
    }
};

// Действия (Actions) - будет продолжено в следующей части

// Действия приложения
const Actions = {
    async init() {
        // Инициализация IndexedDB
        await DB.init();

        // Проверяем токен
        if (App.authToken) {
            const authResult = await API.checkAuth();
            if (authResult.success) {
                App.user = {
                    id: authResult.user.id,
                    name: authResult.user.firstName || authResult.user.username,
                    username: authResult.user.username,
                    role: authResult.user.role
                };
                await DB.saveUser(App.user);
                await this.loadApp();
            } else {
                // Токен недействителен
                App.authToken = null;
                localStorage.removeItem('userToken');
                UI.showScreen('auth-screen');
            }
        } else {
            UI.showScreen('auth-screen');
        }

        // Регистрация Service Worker
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }

        // Отслеживание статуса подключения
        window.addEventListener('online', () => {
            UI.updateConnectionStatus(true);
            this.syncData();
        });

        window.addEventListener('offline', () => {
            UI.updateConnectionStatus(false);
        });

        // Начальный статус
        UI.updateConnectionStatus(navigator.onLine);

        // Обработчики событий
        this.setupEventListeners();
    },

    async loadApp() {
        UI.showScreen('main-screen');
        document.getElementById('user-greeting').textContent = `Привет, ${App.user.name}!`;

        // Загрузка процессов с сервера
        await this.loadProcesses();

        // Загрузка активного процесса
        await this.loadActiveProcess();

        // Отображение UI
        UI.renderProcessList();
        UI.renderHistory();
        UI.renderStats();
    },

    async loadProcesses() {
        try {
            // Пытаемся загрузить с сервера
            if (navigator.onLine) {
                const processes = await API.getProcesses();
                App.processes = processes;
                await DB.cacheProcesses(processes);
            } else {
                // Загружаем из кэша если оффлайн
                const cached = await DB.getCachedProcesses();
                App.processes = cached.length > 0 ? cached : App.processes;
            }
        } catch (error) {
            console.error('Error loading processes:', error);
            // Загружаем из кэша при ошибке
            const cached = await DB.getCachedProcesses();
            App.processes = cached.length > 0 ? cached : [];
        }
    },

    async loadActiveProcess() {
        if (!App.user) return;

        const activeRecord = await DB.getActiveRecord(App.user.id);
        if (activeRecord) {
            App.activeRecord = activeRecord;
            App.activeProcess = App.processes.find(p => p.id === activeRecord.processId);
            
            // Загружаем завершенные шаги
            App.completedSteps = await DB.getCompletedSteps(activeRecord.id);
            App.currentStepIndex = App.completedSteps.length;

            UI.updateActiveProcess();
            UI.startTimer();
        }
    },

    setupEventListeners() {
        // Вкладки авторизации
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.getElementById('login-form').classList.toggle('hidden', tabName !== 'login');
                document.getElementById('register-form').classList.toggle('hidden', tabName !== 'register');
                document.getElementById('pending-status').classList.add('hidden');

                // Очищаем сообщения об ошибках
                document.getElementById('login-error').classList.add('hidden');
                document.getElementById('register-error').classList.add('hidden');
                document.getElementById('register-success').classList.add('hidden');
            });
        });

        // Авторизация
        document.getElementById('login-btn')?.addEventListener('click', () => {
            this.login();
        });

        document.getElementById('login-password')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.login();
            }
        });

        // Регистрация
        document.getElementById('register-btn')?.addEventListener('click', () => {
            this.register();
        });

        document.getElementById('register-password-confirm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.register();
            }
        });

        // Назад к входу (из статуса ожидания)
        document.getElementById('back-to-login-btn')?.addEventListener('click', () => {
            document.getElementById('pending-status').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.auth-tab[data-tab="login"]').classList.add('active');
        });

        // Выход
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            this.logout();
        });

        // Остановка процесса
        document.getElementById('stop-process-btn')?.addEventListener('click', () => {
            this.showStopDialog();
        });

        // Добавление фото
        document.getElementById('add-photo-btn')?.addEventListener('click', () => {
            // Для многошаговых процессов добавляем фото к текущему шагу
            if (App.activeProcess?.is_sequential && App.activeProcess?.steps) {
                const currentStep = App.activeProcess.steps[App.currentStepIndex];
                if (currentStep) {
                    this.addPhoto(currentStep.id);
                    return;
                }
            }
            this.addPhoto();
        });

        // Завершение текущего шага (кнопка в основном блоке)
        document.getElementById('complete-step-btn')?.addEventListener('click', () => {
            this.completeCurrentStep();
        });

        // Модальное окно завершения процесса
        document.getElementById('confirm-finish-btn')?.addEventListener('click', () => {
            this.confirmStopProcess();
        });

        document.getElementById('cancel-finish-btn')?.addEventListener('click', () => {
            this.hideStopDialog();
        });

        // Закрытие модалки по клику на фон
        document.getElementById('finish-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'finish-modal') {
                this.hideStopDialog();
            }
        });
    },

    async login() {
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorDiv = document.getElementById('login-error');

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            errorDiv.textContent = 'Введите логин и пароль';
            errorDiv.classList.remove('hidden');
            return;
        }

        try {
            const result = await API.login(username, password);

            if (!result.ok) {
                // Проверяем статус pending
                if (result.status === 'pending') {
                    document.getElementById('login-form').classList.add('hidden');
                    document.getElementById('register-form').classList.add('hidden');
                    document.getElementById('pending-status').classList.remove('hidden');
                    return;
                }
                errorDiv.textContent = result.error || 'Ошибка авторизации';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Успешная авторизация
            App.authToken = result.token;
            localStorage.setItem('userToken', result.token);

            App.user = {
                id: result.user.id,
                name: result.user.firstName || result.user.username,
                username: result.user.username,
                role: result.user.role
            };

            await DB.saveUser(App.user);
            errorDiv.classList.add('hidden');
            await this.loadApp();
        } catch (error) {
            console.error('Login error:', error);
            errorDiv.textContent = 'Ошибка подключения к серверу';
            errorDiv.classList.remove('hidden');
        }
    },

    async register() {
        const usernameInput = document.getElementById('register-username');
        const nameInput = document.getElementById('register-name');
        const passwordInput = document.getElementById('register-password');
        const confirmInput = document.getElementById('register-password-confirm');
        const errorDiv = document.getElementById('register-error');
        const successDiv = document.getElementById('register-success');

        const username = usernameInput.value.trim();
        const firstName = nameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmInput.value;

        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');

        if (!username || !password) {
            errorDiv.textContent = 'Заполните все обязательные поля';
            errorDiv.classList.remove('hidden');
            return;
        }

        if (username.length < 3) {
            errorDiv.textContent = 'Логин должен быть минимум 3 символа';
            errorDiv.classList.remove('hidden');
            return;
        }

        if (password.length < 4) {
            errorDiv.textContent = 'Пароль должен быть минимум 4 символа';
            errorDiv.classList.remove('hidden');
            return;
        }

        if (password !== confirmPassword) {
            errorDiv.textContent = 'Пароли не совпадают';
            errorDiv.classList.remove('hidden');
            return;
        }

        try {
            const result = await API.register(username, password, firstName || username);

            if (!result.ok) {
                errorDiv.textContent = result.error || 'Ошибка регистрации';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Успешная регистрация
            successDiv.textContent = result.message || 'Регистрация успешна. Ожидайте подтверждения администратором.';
            successDiv.classList.remove('hidden');

            // Очищаем поля
            usernameInput.value = '';
            nameInput.value = '';
            passwordInput.value = '';
            confirmInput.value = '';

        } catch (error) {
            console.error('Register error:', error);
            errorDiv.textContent = 'Ошибка подключения к серверу';
            errorDiv.classList.remove('hidden');
        }
    },

    async logout() {
        if (App.activeProcess) {
            if (!confirm('У вас есть активный процесс. Вы уверены что хотите выйти?')) {
                return;
            }
        }

        // Отправляем запрос на выход
        try {
            await API.request('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        }

        App.user = null;
        App.authToken = null;
        localStorage.removeItem('userToken');
        App.activeProcess = null;
        App.activeRecord = null;
        App.currentStepIndex = 0;
        App.completedSteps = [];

        UI.stopTimer();
        UI.showScreen('auth-screen');

        // Очищаем форму
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('login-error').classList.add('hidden');
    },

    async startProcess(processId) {
        if (App.activeProcess) {
            alert('Сначала завершите текущий процесс');
            return;
        }

        const process = App.processes.find(p => p.id === processId);
        if (!process) return;

        App.activeProcess = process;
        App.currentStepIndex = 0;
        App.completedSteps = [];

        const record = {
            userId: App.user.id,
            processId: processId,
            startTime: new Date().toISOString(),
            endTime: null,
            duration: 0,
            comment: '',
            synced: false,
            stepsCompleted: 0
        };

        const recordId = await DB.addRecord(record);
        App.activeRecord = { id: recordId, ...record };

        UI.updateActiveProcess();
        UI.startTimer();

        // Прокручиваем к активному процессу
        document.getElementById('active-process')?.scrollIntoView({ behavior: 'smooth' });
    },

    async completeCurrentStep() {
        if (!App.activeProcess || !App.activeRecord) return;

        const process = App.activeProcess;
        if (!process.is_sequential || !process.steps) return;

        const currentStep = process.steps[App.currentStepIndex];
        if (!currentStep) return;

        // Проверяем обязательное фото
        if (currentStep.requires_photo) {
            const photosCount = await DB.getStepPhotosCount(currentStep.id);
            if (photosCount === 0) {
                alert(`Для этого шага требуется фото! Пожалуйста, сделайте фото перед завершением шага.`);
                this.addPhoto(currentStep.id);
                return;
            }
        }

        // Сохраняем завершение шага
        const stepCompletion = {
            recordId: App.activeRecord.id,
            stepId: currentStep.id,
            completedAt: new Date().toISOString()
        };

        await DB.addStepCompletion(stepCompletion);
        App.completedSteps.push(stepCompletion);
        App.currentStepIndex++;

        // Обновляем весь UI активного процесса (включая текущий шаг)
        UI.updateActiveProcess();

        // Если все шаги завершены, предлагаем завершить процесс
        if (App.currentStepIndex >= process.steps.length) {
            this.showNotification('Все шаги выполнены!', 'success');
            // Автоматически открываем диалог завершения
            setTimeout(() => this.showStopDialog(), 1000);
        }
    },

    showStopDialog() {
        if (!App.activeProcess || !App.activeRecord) return;

        const process = App.activeProcess;
        const modal = document.getElementById('finish-modal');
        const processNameEl = document.getElementById('finish-process-name');
        const durationEl = document.getElementById('finish-duration');
        const commentInput = document.getElementById('comment-input');

        // Показываем информацию в модальном окне
        processNameEl.textContent = process.name;
        const currentDuration = Utils.getCurrentTimer(App.activeRecord.startTime);
        durationEl.textContent = Utils.formatDuration(currentDuration);
        commentInput.value = '';

        // Добавляем предупреждение о невыполненных шагах
        let warningEl = modal.querySelector('.steps-warning');
        if (warningEl) warningEl.remove();

        if (process.is_sequential && process.steps && App.currentStepIndex < process.steps.length) {
            const remaining = process.steps.length - App.currentStepIndex;
            warningEl = document.createElement('p');
            warningEl.className = 'steps-warning';
            warningEl.style.cssText = 'color: var(--warning); font-weight: 600; margin-bottom: var(--space-md);';
            warningEl.innerHTML = `<strong>Внимание:</strong> Остались невыполненные шаги (${remaining})`;
            modal.querySelector('.modal-content').insertBefore(warningEl, commentInput);
        }

        // Показываем модальное окно
        modal.classList.remove('hidden');
    },

    hideStopDialog() {
        const modal = document.getElementById('finish-modal');
        modal.classList.add('hidden');
    },

    async confirmStopProcess() {
        if (!App.activeProcess || !App.activeRecord) return;

        const commentInput = document.getElementById('comment-input');
        const comment = commentInput.value.trim();

        // Скрываем модальное окно
        this.hideStopDialog();

        // Завершаем процесс
        await this.stopProcess(comment);
    },

    async stopProcess(comment) {
        if (!App.activeProcess || !App.activeRecord) return;

        const endTime = new Date();
        const duration = Math.floor((endTime - new Date(App.activeRecord.startTime)) / 1000);

        const updatedRecord = await DB.updateRecord(App.activeRecord.id, {
            endTime: endTime.toISOString(),
            duration: duration,
            comment: comment,
            stepsCompleted: App.completedSteps.length
        });

        // Синхронизация с сервером если онлайн
        if (navigator.onLine) {
            await API.syncRecord(updatedRecord);
        }

        // Сброс состояния
        App.activeProcess = null;
        App.activeRecord = null;
        App.currentStepIndex = 0;
        App.completedSteps = [];

        UI.stopTimer();
        UI.hideElement('active-process');
        UI.hideElement('steps-container');

        // Обновляем историю и статистику
        UI.renderHistory();
        UI.renderStats();

        // Показываем уведомление
        this.showNotification('Процесс успешно завершён!', 'success');
    },

    showNotification(message, type = 'info') {
        // Создаем элемент уведомления
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
        `;
        notification.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--primary)'};
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 9999;
            animation: slideUp 0.3s ease-out;
            font-weight: 600;
        `;

        document.body.appendChild(notification);

        // Удаляем через 3 секунды
        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    addPhoto(stepId = null) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment'; // Камера заднего вида на мобильных

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Конвертируем в base64
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target.result;

                const photo = {
                    recordId: App.activeRecord.id,
                    stepId: stepId,
                    data: base64,
                    timestamp: new Date().toISOString()
                };

                await DB.addPhoto(photo);
                alert('Фото добавлено!');

                // Если фото для шага, обновляем отображение шагов
                if (stepId && App.activeProcess?.is_sequential) {
                    UI.renderSteps(App.activeProcess, App.completedSteps.map(s => s.stepId));
                }
            };

            reader.readAsDataURL(file);
        };

        input.click();
    },

    async syncData() {
        // Синхронизация несинхронизированных записей
        if (!App.user) return;

        const records = await DB.getRecords(App.user.id, 100);
        const unsyncedRecords = records.filter(r => !r.synced && r.endTime);

        for (const record of unsyncedRecords) {
            const success = await API.syncRecord(record);
            if (success) {
                await DB.updateRecord(record.id, { synced: true });
            }
        }

        if (unsyncedRecords.length > 0) {
            console.log(`Синхронизировано записей: ${unsyncedRecords.length}`);
        }
    }
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    Actions.init();
});
