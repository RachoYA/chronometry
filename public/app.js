// Управление состоянием приложения
const App = {
    user: null,
    authToken: localStorage.getItem('userToken'),
    activeProcess: null,
    activeRecord: null,
    activeAssignment: null,
    activeObject: null,
    currentStepIndex: 0,
    completedSteps: [],
    stepTimings: [], // Время по каждому шагу (серверные ID)
    currentStepStartTime: null, // Время начала текущего шага
    currentStepTimingId: null, // ID текущего step_timing на сервере
    timerInterval: null,
    stepTimerInterval: null,
    processes: [],
    objects: [],
    assignments: []
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

    // Получить процессы
    async getProcesses() {
        try {
            const response = await this.request('/api/processes');
            if (!response.ok) throw new Error('Failed to load processes');
            return await response.json();
        } catch (error) {
            console.error('Error loading processes:', error);
            return App.processes.length > 0 ? App.processes : [];
        }
    },

    // Получить объекты
    async getObjects() {
        try {
            const response = await this.request('/api/objects');
            if (!response.ok) throw new Error('Failed to load objects');
            return await response.json();
        } catch (error) {
            console.error('Error loading objects:', error);
            return [];
        }
    },

    // Получить назначения для пользователя
    async getAssignments() {
        try {
            const response = await this.request('/api/assignments');
            if (!response.ok) throw new Error('Failed to load assignments');
            return await response.json();
        } catch (error) {
            console.error('Error loading assignments:', error);
            return [];
        }
    },

    // Начать запись времени (новый API)
    async startRecord(processId, objectId = null, assignmentId = null) {
        try {
            const response = await this.request('/api/records/start', {
                method: 'POST',
                body: JSON.stringify({ processId, objectId, assignmentId })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start record');
            }
            return await response.json();
        } catch (error) {
            console.error('Error starting record:', error);
            throw error;
        }
    },

    // Остановить запись времени
    async stopRecord(recordId, comment = '') {
        try {
            const response = await this.request(`/api/records/${recordId}/stop`, {
                method: 'POST',
                body: JSON.stringify({ comment })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to stop record');
            }
            return await response.json();
        } catch (error) {
            console.error('Error stopping record:', error);
            throw error;
        }
    },

    // Начать тайминг шага
    async startStepTiming(recordId, stepId) {
        try {
            const response = await this.request(`/api/records/${recordId}/steps/${stepId}/start`, {
                method: 'POST'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to start step timing');
            }
            return await response.json();
        } catch (error) {
            console.error('Error starting step timing:', error);
            throw error;
        }
    },

    // Остановить тайминг шага
    async stopStepTiming(stepTimingId) {
        try {
            const response = await this.request(`/api/step-timings/${stepTimingId}/stop`, {
                method: 'POST'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to stop step timing');
            }
            return await response.json();
        } catch (error) {
            console.error('Error stopping step timing:', error);
            throw error;
        }
    },

    // Загрузить фото
    async uploadPhoto(recordId, photoData, stepId = null) {
        try {
            const response = await this.request(`/api/records/${recordId}/photos`, {
                method: 'POST',
                body: JSON.stringify({ photoData, stepId })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to upload photo');
            }
            return await response.json();
        } catch (error) {
            console.error('Error uploading photo:', error);
            throw error;
        }
    },

    // Синхронизация (для оффлайн записей)
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
    version: 3, // Увеличили версию для новой схемы
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

                // Хранилище шагов
                if (!db.objectStoreNames.contains('steps')) {
                    const stepsStore = db.createObjectStore('steps', { keyPath: 'id', autoIncrement: true });
                    stepsStore.createIndex('recordId', 'recordId', { unique: false });
                    stepsStore.createIndex('stepId', 'stepId', { unique: false });
                }

                // Хранилище фото
                if (!db.objectStoreNames.contains('photos')) {
                    const photosStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
                    photosStore.createIndex('recordId', 'recordId', { unique: false });
                    photosStore.createIndex('stepId', 'stepId', { unique: false });
                }

                // Хранилище пользователя
                if (!db.objectStoreNames.contains('user')) {
                    db.createObjectStore('user', { keyPath: 'id' });
                }

                // Кэш процессов
                if (!db.objectStoreNames.contains('processes')) {
                    db.createObjectStore('processes', { keyPath: 'id' });
                }

                // Кэш объектов (НОВОЕ)
                if (!db.objectStoreNames.contains('objects')) {
                    db.createObjectStore('objects', { keyPath: 'id' });
                }

                // Кэш назначений (НОВОЕ)
                if (!db.objectStoreNames.contains('assignments')) {
                    db.createObjectStore('assignments', { keyPath: 'id' });
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
            store.clear();
            processes.forEach(process => store.put(process));
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

    async cacheObjects(objects) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['objects'], 'readwrite');
            const store = transaction.objectStore('objects');
            store.clear();
            objects.forEach(obj => store.put(obj));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    },

    async getCachedObjects() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['objects'], 'readonly');
            const store = transaction.objectStore('objects');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async cacheAssignments(assignments) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['assignments'], 'readwrite');
            const store = transaction.objectStore('assignments');
            store.clear();
            assignments.forEach(a => store.put(a));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    },

    async getCachedAssignments() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['assignments'], 'readonly');
            const store = transaction.objectStore('assignments');
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

    formatDate(date) {
        if (!date) return '';
        return new Date(date).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    },

    getCurrentTimer(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        return Math.floor((now - start) / 1000);
    },

    formatTimerDisplay(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    formatStepTimer(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    getCategoryColor(categoryColor) {
        return categoryColor || '#2196F3';
    },

    getCategoryIcon(categoryIcon) {
        return categoryIcon || '📋';
    },

    getPriorityLabel(priority) {
        if (priority >= 2) return { text: 'Высокий', class: 'high' };
        if (priority >= 1) return { text: 'Средний', class: 'medium' };
        return { text: 'Низкий', class: 'low' };
    }
};

// UI управление
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

    // Отображение назначений
    renderAssignments() {
        const container = document.getElementById('assignments-list');
        if (!container) return;

        if (App.assignments.length === 0) {
            container.innerHTML = '<div class="assignments-empty">Нет активных заданий</div>';
            return;
        }

        container.innerHTML = App.assignments.map(assignment => {
            const priority = Utils.getPriorityLabel(assignment.priority);
            const priorityClass = assignment.priority >= 2 ? 'priority-high' :
                                  assignment.priority >= 1 ? 'priority-medium' : 'priority-low';

            return `
                <div class="assignment-item ${priorityClass}" data-assignment-id="${assignment.id}">
                    <div class="assignment-header">
                        <div class="assignment-name">${assignment.name}</div>
                        <span class="assignment-priority ${priority.class}">${priority.text}</span>
                    </div>
                    <div class="assignment-process">📋 ${assignment.process_name}</div>
                    ${assignment.object_name ? `
                        <div class="assignment-object">🏢 ${assignment.object_name}</div>
                    ` : ''}
                    ${assignment.start_date || assignment.end_date ? `
                        <div class="assignment-dates">
                            ${assignment.start_date ? `С ${Utils.formatDate(assignment.start_date)}` : ''}
                            ${assignment.end_date ? ` до ${Utils.formatDate(assignment.end_date)}` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Добавляем обработчики
        container.querySelectorAll('.assignment-item').forEach(item => {
            item.addEventListener('click', () => {
                const assignmentId = parseInt(item.dataset.assignmentId);
                Actions.startFromAssignment(assignmentId);
            });
        });
    },

    // Отображение списка объектов
    renderObjectSelector() {
        const select = document.getElementById('object-select');
        if (!select) return;

        select.innerHTML = '<option value="">-- Выберите объект --</option>';

        App.objects.forEach(obj => {
            if (obj.is_active) {
                const option = document.createElement('option');
                option.value = obj.id;
                option.textContent = obj.name;
                if (obj.address) {
                    option.textContent += ` (${obj.address})`;
                }
                select.appendChild(option);
            }
        });
    },

    // Отображение процессов
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

    // Отображение шагов процесса
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
            const object = record.objectId ? App.objects.find(o => o.id === record.objectId) : null;

            return `
                <div class="history-item">
                    <div class="history-item-header">
                        <div class="history-item-name">${process.name}</div>
                        <div class="history-item-time">${Utils.formatTime(record.startTime)}</div>
                    </div>
                    ${object ? `
                        <div class="history-item-object">🏢 ${object.name}</div>
                    ` : ''}
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
            document.getElementById('active-object-name').textContent = '';
            return;
        }

        UI.showElement('active-process');

        const process = App.processes.find(p => p.id === App.activeProcess.id);
        document.getElementById('active-process-name').textContent = process?.name || 'Процесс';
        document.getElementById('active-process-started').textContent = Utils.formatTime(App.activeRecord.startTime);

        // Показываем объект если есть
        const objectNameEl = document.getElementById('active-object-name');
        if (App.activeObject) {
            objectNameEl.textContent = `🏢 ${App.activeObject.name}`;
        } else {
            objectNameEl.textContent = '';
        }

        // Обновляем UI для многошаговых процессов
        const currentStepInfo = document.getElementById('current-step-info');
        const completeStepBtn = document.getElementById('complete-step-btn');
        const stepTimerEl = document.getElementById('step-timer');

        if (process && process.is_sequential && process.steps && process.steps.length > 0) {
            const currentStep = process.steps[App.currentStepIndex];
            const allCompleted = App.currentStepIndex >= process.steps.length;

            if (allCompleted) {
                currentStepInfo.classList.remove('hidden');
                document.getElementById('step-progress').textContent = `${process.steps.length}/${process.steps.length}`;
                document.getElementById('current-step-name').textContent = '🎉 Все шаги выполнены!';
                document.getElementById('current-step-desc').textContent = 'Можете завершить процесс';
                stepTimerEl.style.display = 'none';
                completeStepBtn.classList.add('hidden');
            } else {
                currentStepInfo.classList.remove('hidden');
                document.getElementById('step-progress').textContent = `${App.currentStepIndex + 1}/${process.steps.length}`;
                document.getElementById('current-step-name').textContent = currentStep.name;
                document.getElementById('current-step-desc').textContent = currentStep.description || '';
                stepTimerEl.style.display = 'block';

                completeStepBtn.classList.remove('hidden');
                completeStepBtn.textContent = currentStep.requires_photo
                    ? '📷 + ✓ Завершить шаг'
                    : '✓ Шаг выполнен';
            }

            UI.renderSteps(process, App.completedSteps.map(s => s.stepId));
        } else {
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
    },

    startStepTimer() {
        if (App.stepTimerInterval) {
            clearInterval(App.stepTimerInterval);
        }

        const updateStepTimer = () => {
            if (App.currentStepStartTime) {
                const seconds = Utils.getCurrentTimer(App.currentStepStartTime);
                const stepTimerEl = document.getElementById('step-timer');
                if (stepTimerEl) {
                    stepTimerEl.textContent = `Время шага: ${Utils.formatStepTimer(seconds)}`;
                }
            }
        };

        updateStepTimer();
        App.stepTimerInterval = setInterval(updateStepTimer, 1000);
    },

    stopStepTimer() {
        if (App.stepTimerInterval) {
            clearInterval(App.stepTimerInterval);
            App.stepTimerInterval = null;
        }
    }
};

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

        UI.updateConnectionStatus(navigator.onLine);
        this.setupEventListeners();
    },

    async loadApp() {
        UI.showScreen('main-screen');
        document.getElementById('user-greeting').textContent = `Привет, ${App.user.name}!`;

        // Загрузка данных
        await Promise.all([
            this.loadProcesses(),
            this.loadObjects(),
            this.loadAssignments()
        ]);

        // Загрузка активного процесса
        await this.loadActiveProcess();

        // Отображение UI
        UI.renderAssignments();
        UI.renderObjectSelector();
        UI.renderProcessList();
        UI.renderHistory();
        UI.renderStats();
    },

    async loadProcesses() {
        try {
            if (navigator.onLine) {
                const processes = await API.getProcesses();
                App.processes = processes;
                await DB.cacheProcesses(processes);
            } else {
                const cached = await DB.getCachedProcesses();
                App.processes = cached.length > 0 ? cached : [];
            }
        } catch (error) {
            console.error('Error loading processes:', error);
            const cached = await DB.getCachedProcesses();
            App.processes = cached.length > 0 ? cached : [];
        }
    },

    async loadObjects() {
        try {
            if (navigator.onLine) {
                const objects = await API.getObjects();
                App.objects = objects;
                await DB.cacheObjects(objects);
            } else {
                const cached = await DB.getCachedObjects();
                App.objects = cached.length > 0 ? cached : [];
            }
        } catch (error) {
            console.error('Error loading objects:', error);
            const cached = await DB.getCachedObjects();
            App.objects = cached.length > 0 ? cached : [];
        }
    },

    async loadAssignments() {
        try {
            if (navigator.onLine) {
                const assignments = await API.getAssignments();
                App.assignments = assignments;
                await DB.cacheAssignments(assignments);
            } else {
                const cached = await DB.getCachedAssignments();
                App.assignments = cached.length > 0 ? cached : [];
            }
        } catch (error) {
            console.error('Error loading assignments:', error);
            const cached = await DB.getCachedAssignments();
            App.assignments = cached.length > 0 ? cached : [];
        }
    },

    async loadActiveProcess() {
        if (!App.user) return;

        const activeRecord = await DB.getActiveRecord(App.user.id);
        if (activeRecord) {
            App.activeRecord = activeRecord;
            App.activeProcess = App.processes.find(p => p.id === activeRecord.processId);
            App.activeObject = activeRecord.objectId ? App.objects.find(o => o.id === activeRecord.objectId) : null;

            // Загружаем завершенные шаги
            App.completedSteps = await DB.getCompletedSteps(activeRecord.id);
            App.currentStepIndex = App.completedSteps.length;

            // Восстанавливаем время текущего шага
            if (App.activeProcess?.is_sequential && App.activeProcess?.steps?.length > 0) {
                if (App.currentStepIndex < App.activeProcess.steps.length) {
                    App.currentStepStartTime = activeRecord.currentStepStartTime || new Date().toISOString();
                    UI.startStepTimer();
                }
            }

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

                document.getElementById('login-error').classList.add('hidden');
                document.getElementById('register-error').classList.add('hidden');
                document.getElementById('register-success').classList.add('hidden');
            });
        });

        // Авторизация
        document.getElementById('login-btn')?.addEventListener('click', () => this.login());
        document.getElementById('login-password')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Регистрация
        document.getElementById('register-btn')?.addEventListener('click', () => this.register());
        document.getElementById('register-password-confirm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.register();
        });

        // Назад к входу
        document.getElementById('back-to-login-btn')?.addEventListener('click', () => {
            document.getElementById('pending-status').classList.add('hidden');
            document.getElementById('login-form').classList.remove('hidden');
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.auth-tab[data-tab="login"]').classList.add('active');
        });

        // Выход
        document.getElementById('logout-btn')?.addEventListener('click', () => this.logout());

        // Остановка процесса
        document.getElementById('stop-process-btn')?.addEventListener('click', () => this.showStopDialog());

        // Добавление фото
        document.getElementById('add-photo-btn')?.addEventListener('click', () => {
            if (App.activeProcess?.is_sequential && App.activeProcess?.steps) {
                const currentStep = App.activeProcess.steps[App.currentStepIndex];
                if (currentStep) {
                    this.addPhoto(currentStep.id);
                    return;
                }
            }
            this.addPhoto();
        });

        // Завершение текущего шага
        document.getElementById('complete-step-btn')?.addEventListener('click', () => this.completeCurrentStep());

        // Модальное окно
        document.getElementById('confirm-finish-btn')?.addEventListener('click', () => this.confirmStopProcess());
        document.getElementById('cancel-finish-btn')?.addEventListener('click', () => this.hideStopDialog());
        document.getElementById('finish-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'finish-modal') this.hideStopDialog();
        });

        // Сворачиваемая секция "Свободный запуск"
        document.getElementById('free-processes-header')?.addEventListener('click', () => {
            const header = document.getElementById('free-processes-header');
            const body = document.getElementById('free-processes-body');
            header.classList.toggle('collapsed');
            body.classList.toggle('collapsed');
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

            successDiv.textContent = result.message || 'Регистрация успешна. Ожидайте подтверждения администратором.';
            successDiv.classList.remove('hidden');

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
        App.activeAssignment = null;
        App.activeObject = null;
        App.currentStepIndex = 0;
        App.completedSteps = [];
        App.stepTimings = [];
        App.currentStepStartTime = null;
        App.currentStepTimingId = null;

        UI.stopTimer();
        UI.stopStepTimer();
        UI.showScreen('auth-screen');

        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('login-error').classList.add('hidden');
    },

    // Запуск из назначения
    async startFromAssignment(assignmentId) {
        if (App.activeProcess) {
            alert('Сначала завершите текущий процесс');
            return;
        }

        const assignment = App.assignments.find(a => a.id === assignmentId);
        if (!assignment) return;

        const process = App.processes.find(p => p.id === assignment.process_id);
        if (!process) {
            alert('Процесс не найден');
            return;
        }

        App.activeAssignment = assignment;
        App.activeObject = assignment.object_id ? App.objects.find(o => o.id === assignment.object_id) : null;

        await this.doStartProcess(process, App.activeObject?.id, assignmentId);
    },

    // Свободный запуск процесса
    async startProcess(processId) {
        if (App.activeProcess) {
            alert('Сначала завершите текущий процесс');
            return;
        }

        const process = App.processes.find(p => p.id === processId);
        if (!process) return;

        // Получаем выбранный объект
        const objectSelect = document.getElementById('object-select');
        const objectId = objectSelect?.value ? parseInt(objectSelect.value) : null;

        if (objectId) {
            App.activeObject = App.objects.find(o => o.id === objectId);
        } else {
            App.activeObject = null;
        }

        await this.doStartProcess(process, objectId, null);
    },

    // Общая логика запуска процесса
    async doStartProcess(process, objectId, assignmentId) {
        App.activeProcess = process;
        App.currentStepIndex = 0;
        App.completedSteps = [];
        App.stepTimings = [];
        App.currentStepStartTime = null;
        App.currentStepTimingId = null;

        const startTime = new Date().toISOString();

        // Создаем локальную запись
        const localRecord = {
            userId: App.user.id,
            processId: process.id,
            objectId: objectId,
            assignmentId: assignmentId,
            startTime: startTime,
            endTime: null,
            duration: 0,
            comment: '',
            synced: false,
            stepsCompleted: 0
        };

        const localRecordId = await DB.addRecord(localRecord);
        App.activeRecord = { id: localRecordId, ...localRecord };

        // Если онлайн, создаем запись на сервере
        if (navigator.onLine) {
            try {
                const serverRecord = await API.startRecord(process.id, objectId, assignmentId);
                App.activeRecord.serverId = serverRecord.id;
                await DB.updateRecord(localRecordId, { serverId: serverRecord.id, synced: true });

                // Если процесс с шагами, начинаем тайминг первого шага
                if (process.is_sequential && process.steps && process.steps.length > 0) {
                    const firstStep = process.steps[0];
                    const stepTiming = await API.startStepTiming(serverRecord.id, firstStep.id);
                    App.currentStepTimingId = stepTiming.id;
                    App.currentStepStartTime = new Date().toISOString();
                    await DB.updateRecord(localRecordId, { currentStepStartTime: App.currentStepStartTime });
                    UI.startStepTimer();
                }
            } catch (error) {
                console.error('Error creating server record:', error);
            }
        } else {
            // Оффлайн: сохраняем время начала шага локально
            if (process.is_sequential && process.steps && process.steps.length > 0) {
                App.currentStepStartTime = new Date().toISOString();
                await DB.updateRecord(localRecordId, { currentStepStartTime: App.currentStepStartTime });
                UI.startStepTimer();
            }
        }

        UI.updateActiveProcess();
        UI.startTimer();

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

        // Останавливаем таймер шага на сервере
        if (navigator.onLine && App.currentStepTimingId) {
            try {
                await API.stopStepTiming(App.currentStepTimingId);
            } catch (error) {
                console.error('Error stopping step timing:', error);
            }
        }

        // Сохраняем завершение шага локально
        const stepCompletion = {
            recordId: App.activeRecord.id,
            stepId: currentStep.id,
            completedAt: new Date().toISOString(),
            duration: App.currentStepStartTime ? Utils.getCurrentTimer(App.currentStepStartTime) : 0
        };

        await DB.addStepCompletion(stepCompletion);
        App.completedSteps.push(stepCompletion);
        App.currentStepIndex++;

        // Если есть следующий шаг, начинаем его тайминг
        if (App.currentStepIndex < process.steps.length) {
            const nextStep = process.steps[App.currentStepIndex];
            App.currentStepStartTime = new Date().toISOString();

            if (navigator.onLine && App.activeRecord.serverId) {
                try {
                    const stepTiming = await API.startStepTiming(App.activeRecord.serverId, nextStep.id);
                    App.currentStepTimingId = stepTiming.id;
                } catch (error) {
                    console.error('Error starting next step timing:', error);
                }
            }

            await DB.updateRecord(App.activeRecord.id, { currentStepStartTime: App.currentStepStartTime });
        } else {
            // Все шаги выполнены
            App.currentStepStartTime = null;
            App.currentStepTimingId = null;
            UI.stopStepTimer();
        }

        UI.updateActiveProcess();

        if (App.currentStepIndex >= process.steps.length) {
            this.showNotification('Все шаги выполнены!', 'success');
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

        processNameEl.textContent = process.name;
        const currentDuration = Utils.getCurrentTimer(App.activeRecord.startTime);
        durationEl.textContent = Utils.formatDuration(currentDuration);
        commentInput.value = '';

        // Предупреждение о невыполненных шагах
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

        modal.classList.remove('hidden');
    },

    hideStopDialog() {
        document.getElementById('finish-modal').classList.add('hidden');
    },

    async confirmStopProcess() {
        if (!App.activeProcess || !App.activeRecord) return;

        const commentInput = document.getElementById('comment-input');
        const comment = commentInput.value.trim();

        this.hideStopDialog();
        await this.stopProcess(comment);
    },

    async stopProcess(comment) {
        if (!App.activeProcess || !App.activeRecord) return;

        // Останавливаем текущий тайминг шага если есть
        if (navigator.onLine && App.currentStepTimingId) {
            try {
                await API.stopStepTiming(App.currentStepTimingId);
            } catch (error) {
                console.error('Error stopping step timing:', error);
            }
        }

        const endTime = new Date();
        const duration = Math.floor((endTime - new Date(App.activeRecord.startTime)) / 1000);

        // Обновляем локальную запись
        await DB.updateRecord(App.activeRecord.id, {
            endTime: endTime.toISOString(),
            duration: duration,
            comment: comment,
            stepsCompleted: App.completedSteps.length
        });

        // Синхронизация с сервером
        if (navigator.onLine && App.activeRecord.serverId) {
            try {
                await API.stopRecord(App.activeRecord.serverId, comment);
            } catch (error) {
                console.error('Error stopping server record:', error);
            }
        }

        // Сброс состояния
        App.activeProcess = null;
        App.activeRecord = null;
        App.activeAssignment = null;
        App.activeObject = null;
        App.currentStepIndex = 0;
        App.completedSteps = [];
        App.stepTimings = [];
        App.currentStepStartTime = null;
        App.currentStepTimingId = null;

        UI.stopTimer();
        UI.stopStepTimer();
        UI.hideElement('active-process');
        UI.hideElement('steps-container');

        UI.renderHistory();
        UI.renderStats();

        this.showNotification('Процесс успешно завершён!', 'success');
    },

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `<span>${message}</span>`;
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

        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    addPhoto(stepId = null) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';

        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target.result;

                // Сохраняем локально
                const photo = {
                    recordId: App.activeRecord.id,
                    stepId: stepId,
                    data: base64,
                    timestamp: new Date().toISOString()
                };

                await DB.addPhoto(photo);

                // Отправляем на сервер если онлайн
                if (navigator.onLine && App.activeRecord.serverId) {
                    try {
                        await API.uploadPhoto(App.activeRecord.serverId, base64, stepId);
                    } catch (error) {
                        console.error('Error uploading photo:', error);
                    }
                }

                this.showNotification('Фото добавлено!', 'success');

                if (stepId && App.activeProcess?.is_sequential) {
                    UI.renderSteps(App.activeProcess, App.completedSteps.map(s => s.stepId));
                }
            };

            reader.readAsDataURL(file);
        };

        input.click();
    },

    async syncData() {
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

        // Перезагружаем данные
        await this.loadAssignments();
        UI.renderAssignments();
    }
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    Actions.init();
});
