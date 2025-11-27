// Админ-панель JavaScript с авторизацией
let processes = [];
let categories = [];
let users = [];
let currentProcess = null;
let stepCounter = 0;
let authToken = localStorage.getItem('adminToken');

// API запросы с авторизацией
async function apiRequest(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        logout();
        throw new Error('Сессия истекла');
    }

    return response;
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        checkAuth();
    } else {
        showLoginScreen();
    }

    setupLoginForm();
});

// ============ АВТОРИЗАЦИЯ ============

function setupLoginForm() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                errorDiv.textContent = data.error || 'Ошибка авторизации';
                errorDiv.classList.remove('hidden');
                return;
            }

            if (data.user.role !== 'admin') {
                errorDiv.textContent = 'Доступ только для администраторов';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Успешная авторизация
            authToken = data.token;
            localStorage.setItem('adminToken', authToken);
            document.getElementById('admin-username').textContent = data.user.firstName || data.user.username;
            showAdminPanel();
        } catch (error) {
            console.error('Ошибка:', error);
            errorDiv.textContent = 'Ошибка подключения к серверу';
            errorDiv.classList.remove('hidden');
        }
    });

    document.getElementById('logout-btn')?.addEventListener('click', logout);
}

async function checkAuth() {
    try {
        const response = await apiRequest('/api/auth/me');
        const data = await response.json();

        if (data.success && data.user.role === 'admin') {
            document.getElementById('admin-username').textContent = data.user.firstName || data.user.username;
            showAdminPanel();
        } else {
            logout();
        }
    } catch (error) {
        logout();
    }
}

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('admin-content').classList.add('hidden');
}

function showAdminPanel() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-content').classList.remove('hidden');
    initTabs();
    loadData();
    setupEventListeners();
}

function logout() {
    authToken = null;
    localStorage.removeItem('adminToken');
    showLoginScreen();
}

function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-${tabName}`).classList.add('active');

            if (tabName === 'analytics') {
                populateFilterSelects();
                loadAnalytics();
            }
        });
    });
}

function setupEventListeners() {
    document.getElementById('btn-add-process').addEventListener('click', () => openProcessModal());
    document.getElementById('process-form').addEventListener('submit', handleProcessSubmit);
    document.getElementById('process-sequential').addEventListener('change', toggleStepsSection);
    document.getElementById('filter-pending')?.addEventListener('change', renderUsers);
}

async function loadData() {
    await Promise.all([
        loadProcesses(),
        loadCategories(),
        loadUsers()
    ]);
}

// ============ ПРОЦЕССЫ ============

async function loadProcesses() {
    try {
        const response = await apiRequest('/api/admin/processes');
        processes = await response.json();
        renderProcesses();
    } catch (error) {
        console.error('Ошибка загрузки процессов:', error);
    }
}

function renderProcesses() {
    const grid = document.getElementById('processes-grid');

    if (processes.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Нет процессов. Создайте первый!</div>';
        return;
    }

    grid.innerHTML = processes.map(process => {
        const category = categories.find(c => c.id === process.category_id);
        const categoryBadge = category ?
            `<div class="process-card-category" style="background: ${category.color}20; color: ${category.color};">
                ${category.icon} ${category.name}
            </div>` : '';

        return `
            <div class="process-card" onclick="editProcess(${process.id})">
                <div class="process-card-header">
                    <div>
                        ${categoryBadge}
                        <div class="process-card-title">${process.name}</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-edit" onclick="event.stopPropagation(); editProcess(${process.id})">✏️</button>
                        <button class="btn-delete" onclick="event.stopPropagation(); deleteProcess(${process.id})">🗑️</button>
                    </div>
                </div>
                <div style="color: #757575; font-size: 14px;">${process.description || ''}</div>
                ${process.is_sequential ? `
                    <div class="process-card-steps">
                        📝 Последовательный процесс
                        <br>
                        Шагов: ${process.steps ? process.steps.length : 0}
                    </div>
                ` : ''}
                <div style="margin-top: 12px; display: flex; gap: 12px; font-size: 13px; color: #757575;">
                    ${process.estimated_duration > 0 ? `⏱ ${process.estimated_duration} мин` : ''}
                    ${process.priority > 0 ? `⭐ Приоритет: ${process.priority}` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openProcessModal(processId = null) {
    currentProcess = processId ? processes.find(p => p.id === processId) : null;
    const modal = document.getElementById('process-modal');
    const title = document.getElementById('process-modal-title');

    title.textContent = currentProcess ? 'Редактировать процесс' : 'Создать процесс';

    if (currentProcess) {
        document.getElementById('process-id').value = currentProcess.id;
        document.getElementById('process-name').value = currentProcess.name;
        document.getElementById('process-description').value = currentProcess.description || '';
        document.getElementById('process-category').value = currentProcess.category_id || '';
        document.getElementById('process-duration').value = currentProcess.estimated_duration || 0;
        document.getElementById('process-priority').value = currentProcess.priority || 0;
        document.getElementById('process-sequential').checked = currentProcess.is_sequential === 1;

        if (currentProcess.is_sequential && currentProcess.steps) {
            toggleStepsSection();
            renderSteps(currentProcess.steps);
        }
    } else {
        document.getElementById('process-form').reset();
        document.getElementById('steps-list').innerHTML = '';
        document.getElementById('steps-section').classList.remove('visible');
    }

    modal.classList.add('active');
}

function closeProcessModal() {
    document.getElementById('process-modal').classList.remove('active');
    currentProcess = null;
    stepCounter = 0;
}

function toggleStepsSection() {
    const isSequential = document.getElementById('process-sequential').checked;
    const section = document.getElementById('steps-section');
    if (isSequential) {
        section.classList.add('visible');
    } else {
        section.classList.remove('visible');
    }
}

function addStep() {
    stepCounter++;
    const stepsList = document.getElementById('steps-list');
    const stepNumber = stepsList.children.length + 1;

    const stepHTML = `
        <div class="step-item" data-step-id="${stepCounter}">
            <div style="flex: 1;">
                <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                    <div class="step-number">${stepNumber}</div>
                    <input type="text" placeholder="Название шага" class="form-input" style="flex: 1;" data-field="name" required>
                </div>
                <textarea placeholder="Описание шага" class="form-textarea" rows="2" data-field="description"></textarea>
                <div style="display: flex; gap: 12px; margin-top: 8px;">
                    <input type="number" placeholder="Минуты" class="form-input" style="width: 100px;" data-field="duration" min="0">
                    <label style="display: flex; align-items: center; gap: 4px;">
                        <input type="checkbox" data-field="requires_photo">
                        Обязательное фото
                    </label>
                </div>
            </div>
            <button type="button" onclick="removeStep(${stepCounter})" style="background: #F44336; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;">✕</button>
        </div>
    `;

    stepsList.insertAdjacentHTML('beforeend', stepHTML);
}

function removeStep(stepId) {
    const stepElement = document.querySelector(`[data-step-id="${stepId}"]`);
    stepElement.remove();

    document.querySelectorAll('.step-item').forEach((item, index) => {
        item.querySelector('.step-number').textContent = index + 1;
    });
}

function renderSteps(steps) {
    const stepsList = document.getElementById('steps-list');
    stepsList.innerHTML = '';

    steps.forEach((step, index) => {
        stepCounter++;
        const stepHTML = `
            <div class="step-item" data-step-id="${step.id || stepCounter}" data-db-id="${step.id || ''}">
                <div style="flex: 1;">
                    <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                        <div class="step-number">${index + 1}</div>
                        <input type="text" value="${step.name}" placeholder="Название шага" class="form-input" style="flex: 1;" data-field="name" required>
                    </div>
                    <textarea placeholder="Описание шага" class="form-textarea" rows="2" data-field="description">${step.description || ''}</textarea>
                    <div style="display: flex; gap: 12px; margin-top: 8px;">
                        <input type="number" value="${step.estimated_duration || 0}" placeholder="Минуты" class="form-input" style="width: 100px;" data-field="duration" min="0">
                        <label style="display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" data-field="requires_photo" ${step.requires_photo ? 'checked' : ''}>
                            Обязательное фото
                        </label>
                    </div>
                </div>
                <button type="button" onclick="removeStep(${step.id || stepCounter})" style="background: #F44336; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;">✕</button>
            </div>
        `;
        stepsList.insertAdjacentHTML('beforeend', stepHTML);
    });
}

async function handleProcessSubmit(e) {
    e.preventDefault();

    const processData = {
        name: document.getElementById('process-name').value,
        description: document.getElementById('process-description').value,
        category_id: document.getElementById('process-category').value || null,
        estimated_duration: parseInt(document.getElementById('process-duration').value) || 0,
        priority: parseInt(document.getElementById('process-priority').value) || 0,
        is_sequential: document.getElementById('process-sequential').checked,
        is_active: 1
    };

    if (processData.is_sequential) {
        processData.steps = [];
        document.querySelectorAll('.step-item').forEach((stepItem, index) => {
            const stepData = {
                step_number: index + 1,
                name: stepItem.querySelector('[data-field="name"]').value,
                description: stepItem.querySelector('[data-field="description"]').value,
                estimated_duration: parseInt(stepItem.querySelector('[data-field="duration"]').value) || 0,
                requires_photo: stepItem.querySelector('[data-field="requires_photo"]').checked,
                is_required: 1
            };

            const dbId = stepItem.dataset.dbId;
            if (dbId) stepData.id = parseInt(dbId);

            processData.steps.push(stepData);
        });
    }

    try {
        const processId = document.getElementById('process-id').value;
        const url = processId ? `/api/admin/processes/${processId}` : '/api/admin/processes';
        const method = processId ? 'PUT' : 'POST';

        const response = await apiRequest(url, {
            method,
            body: JSON.stringify(processData)
        });

        if (response.ok) {
            alert('Процесс сохранен!');
            closeProcessModal();
            await loadProcesses();
        } else {
            alert('Ошибка сохранения процесса');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка сохранения процесса');
    }
}

async function editProcess(id) {
    try {
        const response = await apiRequest(`/api/admin/processes/${id}`);
        const process = await response.json();
        openProcessModal(id);
    } catch (error) {
        console.error('Ошибка загрузки процесса:', error);
    }
}

async function deleteProcess(id) {
    if (!confirm('Удалить этот процесс?')) return;

    try {
        const response = await apiRequest(`/api/admin/processes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            alert('Процесс удален');
            await loadProcesses();
        } else {
            alert('Ошибка удаления');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// ============ КАТЕГОРИИ ============

async function loadCategories() {
    try {
        const response = await apiRequest('/api/admin/categories');
        categories = await response.json();
        renderCategoriesSelect();
        renderCategoriesList();
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

function renderCategoriesSelect() {
    const select = document.getElementById('process-category');
    select.innerHTML = '<option value="">Без категории</option>' +
        categories.map(cat => `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`).join('');
}

function renderCategoriesList() {
    const list = document.getElementById('categories-list');
    list.innerHTML = categories.map(cat => `
        <div class="card" style="margin-bottom: 12px; display: flex; align-items: center; gap: 16px;">
            <div style="font-size: 32px;">${cat.icon}</div>
            <div style="flex: 1;">
                <div style="font-weight: 600;">${cat.name}</div>
                <div style="font-size: 14px; color: #757575;">Цвет: ${cat.color}</div>
            </div>
        </div>
    `).join('');
}

// ============ ПОЛЬЗОВАТЕЛИ ============

async function loadUsers() {
    try {
        const response = await apiRequest('/api/admin/users');
        users = await response.json();
        renderUsers();
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

function renderUsers() {
    const tbody = document.getElementById('users-table-body');
    const showPending = document.getElementById('filter-pending')?.checked ?? true;

    const filteredUsers = showPending ? users : users.filter(u => u.status !== 'pending');

    tbody.innerHTML = filteredUsers.map(user => {
        const statusBadge = getStatusBadge(user.status);
        const roleBadge = user.role === 'admin' ? '👑 Админ' : '👤 Пользователь';

        return `
            <tr class="${user.status === 'pending' ? 'pending-row' : ''}">
                <td style="padding: 12px;">${user.id}</td>
                <td style="padding: 12px;">${user.username || '-'}</td>
                <td style="padding: 12px;">${user.first_name || '-'}</td>
                <td style="padding: 12px;">
                    <select onchange="changeUserRole(${user.id}, this.value)" style="padding: 6px; border-radius: 4px;" ${user.username === 'admin' ? 'disabled' : ''}>
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td style="padding: 12px;">${statusBadge}</td>
                <td style="padding: 12px;">${user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                <td style="padding: 12px;">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${user.status === 'pending' ? `
                            <button class="btn-approve" onclick="changeUserStatus(${user.id}, 'approved')">✓ Одобрить</button>
                            <button class="btn-reject" onclick="changeUserStatus(${user.id}, 'rejected')">✗ Отклонить</button>
                        ` : ''}
                        ${user.status === 'rejected' ? `
                            <button class="btn-approve" onclick="changeUserStatus(${user.id}, 'approved')">✓ Одобрить</button>
                        ` : ''}
                        ${user.status === 'approved' && user.role !== 'admin' ? `
                            <button class="btn-reject" onclick="changeUserStatus(${user.id}, 'rejected')">Заблокировать</button>
                        ` : ''}
                        ${user.username !== 'admin' ? `
                            <button class="btn-delete" onclick="deleteUser(${user.id})">🗑️</button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getStatusBadge(status) {
    switch (status) {
        case 'approved':
            return '<span style="background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Активен</span>';
        case 'pending':
            return '<span style="background: #FF9800; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Ожидает</span>';
        case 'rejected':
            return '<span style="background: #F44336; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Отклонен</span>';
        default:
            return '<span style="background: #757575; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Неизвестно</span>';
    }
}

async function changeUserRole(userId, newRole) {
    if (!confirm(`Изменить роль пользователя на "${newRole}"?`)) {
        await loadUsers();
        return;
    }

    try {
        const response = await apiRequest(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
        });

        if (response.ok) {
            await loadUsers();
        } else {
            alert('Ошибка изменения роли');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function changeUserStatus(userId, status) {
    const statusText = status === 'approved' ? 'одобрить' : 'отклонить';
    if (!confirm(`${statusText.charAt(0).toUpperCase() + statusText.slice(1)} пользователя?`)) return;

    try {
        const response = await apiRequest(`/api/admin/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            await loadUsers();
        } else {
            alert('Ошибка изменения статуса');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function deleteUser(userId) {
    if (!confirm('Удалить пользователя?')) return;

    try {
        const response = await apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });

        if (response.ok) {
            await loadUsers();
        } else {
            const data = await response.json();
            alert(data.error || 'Ошибка удаления');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// ============ АНАЛИТИКА ============

async function loadAnalytics() {
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;
    const userId = document.getElementById('filter-user').value;
    const processId = document.getElementById('filter-process').value;

    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (userId) params.append('userId', userId);
    if (processId) params.append('processId', processId);
    params.append('limit', '200');

    try {
        const [summaryRes, byProcessRes, byUserRes, recordsRes] = await Promise.all([
            apiRequest(`/api/admin/analytics/summary?${params}`),
            apiRequest(`/api/admin/analytics/by-process?${params}`),
            apiRequest(`/api/admin/analytics/by-user?${params}`),
            apiRequest(`/api/admin/analytics/records?${params}`)
        ]);

        const summary = await summaryRes.json();
        const byProcess = await byProcessRes.json();
        const byUser = await byUserRes.json();
        const records = await recordsRes.json();

        renderAnalyticsSummary(summary);
        renderStatsByProcess(byProcess);
        renderStatsByUser(byUser);
        renderRecordsTable(records);
    } catch (error) {
        console.error('Ошибка загрузки аналитики:', error);
    }
}

function renderAnalyticsSummary(summary) {
    document.getElementById('summary-records').textContent = summary.total_records || 0;
    document.getElementById('summary-users').textContent = summary.total_users || 0;

    const totalMinutes = summary.total_minutes || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    document.getElementById('summary-total-time').textContent = `${hours}ч ${minutes}м`;

    const avgMinutes = Math.round(summary.avg_minutes || 0);
    document.getElementById('summary-avg-time').textContent = `${avgMinutes}м`;
}

function renderStatsByProcess(stats) {
    const container = document.getElementById('stats-by-process');

    if (!stats || stats.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-text">Нет данных по процессам</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Процесс</th>
                    <th>Кол-во</th>
                    <th>Общее время</th>
                    <th>Среднее</th>
                    <th>Мин</th>
                    <th>Макс</th>
                </tr>
            </thead>
            <tbody>
                ${stats.map(row => `
                    <tr>
                        <td class="process-name-cell">
                            ${row.category_icon ? `<span class="category-badge" style="background: ${row.category_color}20; color: ${row.category_color};">${row.category_icon}</span>` : ''}
                            ${row.process_name}
                        </td>
                        <td><strong>${row.count}</strong></td>
                        <td>${formatMinutes(row.total_minutes)}</td>
                        <td>${formatMinutes(row.avg_minutes)}</td>
                        <td>${formatMinutes(row.min_minutes)}</td>
                        <td>${formatMinutes(row.max_minutes)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderStatsByUser(stats) {
    const container = document.getElementById('stats-by-user');

    if (!stats || stats.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <div class="empty-state-text">Нет данных по пользователям</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Пользователь</th>
                    <th>Замеров</th>
                    <th>Общее время</th>
                    <th>Среднее</th>
                </tr>
            </thead>
            <tbody>
                ${stats.map(row => `
                    <tr>
                        <td><strong>${row.user_name || row.username || 'Без имени'}</strong></td>
                        <td>${row.count}</td>
                        <td>${formatMinutes(row.total_minutes)}</td>
                        <td>${formatMinutes(row.avg_minutes)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderRecordsTable(records) {
    const tbody = document.getElementById('records-table-body');

    if (!records || records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    <div class="empty-state-icon">📜</div>
                    <div class="empty-state-text">Нет записей</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = records.map(record => {
        const date = new Date(record.start_time);
        const dateStr = date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <tr>
                <td>${dateStr}</td>
                <td>${record.user_name || record.username || '-'}</td>
                <td class="process-name-cell">
                    ${record.category_icon ? `<span class="category-badge" style="background: ${record.category_color}20; color: ${record.category_color};">${record.category_icon}</span>` : ''}
                    ${record.process_name || '-'}
                </td>
                <td class="duration-cell">${formatMinutes(record.duration_minutes)}</td>
                <td>${record.photo_count > 0 ? `<span class="photo-badge">${record.photo_count}</span>` : '<span class="no-photo">-</span>'}</td>
                <td class="comment-cell" title="${record.comment || ''}">${record.comment || '-'}</td>
            </tr>
        `;
    }).join('');
}

function formatMinutes(minutes) {
    if (!minutes || minutes <= 0) return '0м';
    if (minutes < 60) return `${Math.round(minutes)}м`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}ч ${mins}м` : `${hours}ч`;
}

function populateFilterSelects() {
    const userSelect = document.getElementById('filter-user');
    if (userSelect) {
        userSelect.innerHTML = '<option value="">Все</option>' +
            users.map(u => `<option value="${u.id}">${u.first_name || u.username || 'ID: ' + u.id}</option>`).join('');
    }

    const processSelect = document.getElementById('filter-process');
    if (processSelect) {
        processSelect.innerHTML = '<option value="">Все</option>' +
            processes.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    const startInput = document.getElementById('filter-start-date');
    const endInput = document.getElementById('filter-end-date');
    if (startInput && !startInput.value) startInput.value = startDate.toISOString().split('T')[0];
    if (endInput && !endInput.value) endInput.value = endDate.toISOString().split('T')[0];
}
