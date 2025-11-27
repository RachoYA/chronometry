// Админ-панель JavaScript с расширенным управлением
let processes = [];
let categories = [];
let users = [];
let objects = [];
let groups = [];
let assignments = [];
let currentProcess = null;
let currentGroup = null;
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

            // Загружаем данные при переключении вкладки
            if (tabName === 'analytics') {
                populateFilterSelects();
                loadAnalytics();
            } else if (tabName === 'objects') {
                loadObjects();
            } else if (tabName === 'groups') {
                loadGroups();
            } else if (tabName === 'assignments') {
                loadAssignments();
            }
        });
    });
}

function setupEventListeners() {
    document.getElementById('process-form').addEventListener('submit', handleProcessSubmit);
    document.getElementById('process-sequential').addEventListener('change', toggleStepsSection);
    document.getElementById('filter-pending')?.addEventListener('change', renderUsers);

    document.getElementById('object-form').addEventListener('submit', handleObjectSubmit);
    document.getElementById('group-form').addEventListener('submit', handleGroupSubmit);
    document.getElementById('assignment-form').addEventListener('submit', handleAssignmentSubmit);
}

async function loadData() {
    await Promise.all([
        loadProcesses(),
        loadCategories(),
        loadUsers(),
        loadObjects(),
        loadGroups()
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
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Нет процессов. Создайте первый!</div></div>';
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
        document.getElementById('process-sequential').checked = currentProcess.is_sequential;

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
                <textarea placeholder="Описание шага (инструкция)" class="form-textarea" rows="2" data-field="description"></textarea>
                <div style="display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap;">
                    <input type="number" placeholder="Ожидаемое время (мин)" class="form-input" style="width: 150px;" data-field="duration" min="0">
                    <label style="display: flex; align-items: center; gap: 4px;">
                        <input type="checkbox" data-field="requires_photo">
                        📷 Требуется фото
                    </label>
                </div>
                <div style="margin-top: 8px;">
                    <input type="text" placeholder="Инструкция для фото (что снять)" class="form-input" data-field="photo_instructions">
                </div>
            </div>
            <button type="button" onclick="removeStep(${stepCounter})" class="btn-delete">✕</button>
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
                    <div style="display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap;">
                        <input type="number" value="${step.estimated_duration || 0}" placeholder="Ожидаемое время (мин)" class="form-input" style="width: 150px;" data-field="duration" min="0">
                        <label style="display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" data-field="requires_photo" ${step.requires_photo ? 'checked' : ''}>
                            📷 Требуется фото
                        </label>
                    </div>
                    <div style="margin-top: 8px;">
                        <input type="text" value="${step.photo_instructions || ''}" placeholder="Инструкция для фото" class="form-input" data-field="photo_instructions">
                    </div>
                </div>
                <button type="button" onclick="removeStep(${step.id || stepCounter})" class="btn-delete">✕</button>
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
        is_active: true
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
                photo_instructions: stepItem.querySelector('[data-field="photo_instructions"]')?.value || '',
                is_required: true
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
        currentProcess = process;
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
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

function renderCategoriesSelect() {
    const select = document.getElementById('process-category');
    select.innerHTML = '<option value="">Без категории</option>' +
        categories.map(cat => `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`).join('');
}

// ============ ОБЪЕКТЫ ============

async function loadObjects() {
    try {
        const response = await apiRequest('/api/admin/objects');
        objects = await response.json();
        renderObjects();
    } catch (error) {
        console.error('Ошибка загрузки объектов:', error);
    }
}

function renderObjects() {
    const grid = document.getElementById('objects-grid');

    if (objects.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏢</div><div class="empty-state-text">Нет объектов. Добавьте первый!</div></div>';
        return;
    }

    grid.innerHTML = objects.map(obj => `
        <div class="card object-card">
            <div class="card-header">
                <div class="card-title">🏢 ${obj.name}</div>
                <div class="card-actions">
                    <button class="btn-edit" onclick="editObject(${obj.id})">✏️</button>
                    <button class="btn-delete" onclick="deleteObject(${obj.id})">🗑️</button>
                </div>
            </div>
            ${obj.address ? `<div class="card-address">📍 ${obj.address}</div>` : ''}
            ${obj.description ? `<div class="card-description">${obj.description}</div>` : ''}
        </div>
    `).join('');
}

function openObjectModal(objectId = null) {
    const obj = objectId ? objects.find(o => o.id === objectId) : null;
    const modal = document.getElementById('object-modal');

    document.getElementById('object-modal-title').textContent = obj ? 'Редактировать объект' : 'Добавить объект';
    document.getElementById('object-id').value = obj?.id || '';
    document.getElementById('object-name').value = obj?.name || '';
    document.getElementById('object-address').value = obj?.address || '';
    document.getElementById('object-description').value = obj?.description || '';

    modal.classList.add('active');
}

function closeObjectModal() {
    document.getElementById('object-modal').classList.remove('active');
}

async function handleObjectSubmit(e) {
    e.preventDefault();

    const data = {
        name: document.getElementById('object-name').value,
        address: document.getElementById('object-address').value,
        description: document.getElementById('object-description').value
    };

    const id = document.getElementById('object-id').value;
    const url = id ? `/api/admin/objects/${id}` : '/api/admin/objects';
    const method = id ? 'PUT' : 'POST';

    try {
        const response = await apiRequest(url, { method, body: JSON.stringify(data) });
        if (response.ok) {
            closeObjectModal();
            await loadObjects();
        } else {
            alert('Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function editObject(id) {
    openObjectModal(id);
}

async function deleteObject(id) {
    if (!confirm('Удалить этот объект?')) return;

    try {
        const response = await apiRequest(`/api/admin/objects/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await loadObjects();
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// ============ ГРУППЫ ============

async function loadGroups() {
    try {
        const response = await apiRequest('/api/admin/groups');
        groups = await response.json();
        renderGroups();
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
    }
}

function renderGroups() {
    const grid = document.getElementById('groups-grid');

    if (groups.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Нет групп. Создайте первую!</div></div>';
        return;
    }

    grid.innerHTML = groups.map(group => `
        <div class="card group-card" style="border-left: 4px solid ${group.color};">
            <div class="card-header">
                <div class="card-title">${group.name}</div>
                <div class="card-actions">
                    <button class="btn-secondary btn-sm" onclick="openGroupMembersModal(${group.id})">👥 ${group.member_count || 0}</button>
                    <button class="btn-edit" onclick="editGroup(${group.id})">✏️</button>
                    <button class="btn-delete" onclick="deleteGroup(${group.id})">🗑️</button>
                </div>
            </div>
            ${group.description ? `<div class="card-description">${group.description}</div>` : ''}
        </div>
    `).join('');
}

function openGroupModal(groupId = null) {
    const group = groupId ? groups.find(g => g.id === groupId) : null;
    const modal = document.getElementById('group-modal');

    document.getElementById('group-modal-title').textContent = group ? 'Редактировать группу' : 'Создать группу';
    document.getElementById('group-id').value = group?.id || '';
    document.getElementById('group-name').value = group?.name || '';
    document.getElementById('group-description').value = group?.description || '';
    document.getElementById('group-color').value = group?.color || '#607D8B';

    modal.classList.add('active');
}

function closeGroupModal() {
    document.getElementById('group-modal').classList.remove('active');
}

async function handleGroupSubmit(e) {
    e.preventDefault();

    const data = {
        name: document.getElementById('group-name').value,
        description: document.getElementById('group-description').value,
        color: document.getElementById('group-color').value
    };

    const id = document.getElementById('group-id').value;
    const url = id ? `/api/admin/groups/${id}` : '/api/admin/groups';
    const method = id ? 'PUT' : 'POST';

    try {
        const response = await apiRequest(url, { method, body: JSON.stringify(data) });
        if (response.ok) {
            closeGroupModal();
            await loadGroups();
        } else {
            alert('Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function editGroup(id) {
    openGroupModal(id);
}

async function deleteGroup(id) {
    if (!confirm('Удалить эту группу?')) return;

    try {
        const response = await apiRequest(`/api/admin/groups/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await loadGroups();
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// Управление участниками группы
async function openGroupMembersModal(groupId) {
    currentGroup = groupId;
    const group = groups.find(g => g.id === groupId);
    document.getElementById('group-members-title').textContent = group?.name || '';

    // Загружаем данные группы с участниками
    try {
        const response = await apiRequest(`/api/admin/groups/${groupId}`);
        const groupData = await response.json();

        // Заполняем список участников
        const membersList = document.getElementById('group-members-list');
        if (groupData.members && groupData.members.length > 0) {
            membersList.innerHTML = groupData.members.map(m => `
                <div class="member-item">
                    <div class="member-info">
                        <strong>${m.first_name || m.username}</strong>
                        <span class="member-username">@${m.username}</span>
                    </div>
                    <button class="btn-delete btn-sm" onclick="removeMemberFromGroup(${m.id})">✕</button>
                </div>
            `).join('');
        } else {
            membersList.innerHTML = '<div class="empty-state-mini">Нет участников</div>';
        }

        // Заполняем селект для добавления
        const select = document.getElementById('add-member-select');
        const memberIds = (groupData.members || []).map(m => m.id);
        const availableUsers = users.filter(u => !memberIds.includes(u.id) && u.status === 'approved');

        select.innerHTML = '<option value="">Выберите пользователя</option>' +
            availableUsers.map(u => `<option value="${u.id}">${u.first_name || u.username}</option>`).join('');

    } catch (error) {
        console.error('Ошибка:', error);
    }

    document.getElementById('group-members-modal').classList.add('active');
}

function closeGroupMembersModal() {
    document.getElementById('group-members-modal').classList.remove('active');
    currentGroup = null;
}

async function addMemberToGroup() {
    const userId = document.getElementById('add-member-select').value;
    if (!userId || !currentGroup) return;

    try {
        const response = await apiRequest(`/api/admin/groups/${currentGroup}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId: parseInt(userId) })
        });

        if (response.ok) {
            await loadGroups();
            await openGroupMembersModal(currentGroup);
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function removeMemberFromGroup(userId) {
    if (!currentGroup) return;

    try {
        const response = await apiRequest(`/api/admin/groups/${currentGroup}/members/${userId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadGroups();
            await openGroupMembersModal(currentGroup);
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

// ============ НАЗНАЧЕНИЯ ============

async function loadAssignments() {
    try {
        const response = await apiRequest('/api/admin/assignments');
        assignments = await response.json();
        renderAssignments();
    } catch (error) {
        console.error('Ошибка загрузки назначений:', error);
    }
}

function renderAssignments() {
    const grid = document.getElementById('assignments-grid');

    if (assignments.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📌</div><div class="empty-state-text">Нет назначений. Создайте первое!</div></div>';
        return;
    }

    grid.innerHTML = assignments.map(a => {
        const statusClass = a.status === 'active' ? 'status-active' : 'status-inactive';
        const assignedTo = a.user_name ? `👤 ${a.user_name}` : (a.group_name ? `👥 ${a.group_name}` : '—');

        return `
            <div class="card assignment-card">
                <div class="card-header">
                    <div class="card-title">${a.name}</div>
                    <div class="card-actions">
                        <span class="status-badge ${statusClass}">${a.status === 'active' ? 'Активно' : 'Неактивно'}</span>
                        <button class="btn-edit" onclick="editAssignment(${a.id})">✏️</button>
                        <button class="btn-delete" onclick="deleteAssignment(${a.id})">🗑️</button>
                    </div>
                </div>
                <div class="assignment-details">
                    <div>📋 <strong>${a.process_name || 'Процесс не выбран'}</strong></div>
                    ${a.object_name ? `<div>🏢 ${a.object_name}</div>` : ''}
                    <div>→ ${assignedTo}</div>
                    ${a.start_date || a.end_date ? `
                        <div>📅 ${a.start_date || '...'} — ${a.end_date || '...'}</div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function openAssignmentModal(assignmentId = null) {
    const assignment = assignmentId ? assignments.find(a => a.id === assignmentId) : null;
    const modal = document.getElementById('assignment-modal');

    document.getElementById('assignment-modal-title').textContent = assignment ? 'Редактировать назначение' : 'Создать назначение';

    // Заполняем селекты
    const processSelect = document.getElementById('assignment-process');
    processSelect.innerHTML = '<option value="">Выберите процесс</option>' +
        processes.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const objectSelect = document.getElementById('assignment-object');
    objectSelect.innerHTML = '<option value="">Любой объект</option>' +
        objects.map(o => `<option value="${o.id}">${o.name}</option>`).join('');

    const userSelect = document.getElementById('assignment-user');
    userSelect.innerHTML = '<option value="">Не выбран</option>' +
        users.filter(u => u.status === 'approved').map(u => `<option value="${u.id}">${u.first_name || u.username}</option>`).join('');

    const groupSelect = document.getElementById('assignment-group');
    groupSelect.innerHTML = '<option value="">Не выбрана</option>' +
        groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

    // Заполняем форму
    document.getElementById('assignment-id').value = assignment?.id || '';
    document.getElementById('assignment-name').value = assignment?.name || '';
    document.getElementById('assignment-description').value = assignment?.description || '';
    document.getElementById('assignment-process').value = assignment?.process_id || '';
    document.getElementById('assignment-object').value = assignment?.object_id || '';
    document.getElementById('assignment-user').value = assignment?.user_id || '';
    document.getElementById('assignment-group').value = assignment?.group_id || '';
    document.getElementById('assignment-start-date').value = assignment?.start_date?.split('T')[0] || '';
    document.getElementById('assignment-end-date').value = assignment?.end_date?.split('T')[0] || '';
    document.getElementById('assignment-priority').value = assignment?.priority || 0;

    modal.classList.add('active');
}

function closeAssignmentModal() {
    document.getElementById('assignment-modal').classList.remove('active');
}

async function handleAssignmentSubmit(e) {
    e.preventDefault();

    const userId = document.getElementById('assignment-user').value;
    const groupId = document.getElementById('assignment-group').value;

    if (!userId && !groupId) {
        alert('Выберите пользователя или группу');
        return;
    }

    const data = {
        name: document.getElementById('assignment-name').value,
        description: document.getElementById('assignment-description').value,
        process_id: parseInt(document.getElementById('assignment-process').value),
        object_id: document.getElementById('assignment-object').value ? parseInt(document.getElementById('assignment-object').value) : null,
        user_id: userId ? parseInt(userId) : null,
        group_id: groupId ? parseInt(groupId) : null,
        start_date: document.getElementById('assignment-start-date').value || null,
        end_date: document.getElementById('assignment-end-date').value || null,
        priority: parseInt(document.getElementById('assignment-priority').value) || 0
    };

    const id = document.getElementById('assignment-id').value;
    const url = id ? `/api/admin/assignments/${id}` : '/api/admin/assignments';
    const method = id ? 'PUT' : 'POST';

    try {
        const response = await apiRequest(url, { method, body: JSON.stringify(data) });
        if (response.ok) {
            closeAssignmentModal();
            await loadAssignments();
        } else {
            alert('Ошибка сохранения');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function editAssignment(id) {
    openAssignmentModal(id);
}

async function deleteAssignment(id) {
    if (!confirm('Удалить это назначение?')) return;

    try {
        const response = await apiRequest(`/api/admin/assignments/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await loadAssignments();
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
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

        return `
            <tr class="${user.status === 'pending' ? 'pending-row' : ''}">
                <td>${user.id}</td>
                <td>${user.username || '-'}</td>
                <td>${user.first_name || '-'}</td>
                <td>—</td>
                <td>
                    <select onchange="changeUserRole(${user.id}, this.value)" class="form-select-sm" ${user.username === 'admin' ? 'disabled' : ''}>
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td>${statusBadge}</td>
                <td>${user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '-'}</td>
                <td>
                    <div class="action-buttons">
                        ${user.status === 'pending' ? `
                            <button class="btn-approve" onclick="changeUserStatus(${user.id}, 'approved')">✓</button>
                            <button class="btn-reject" onclick="changeUserStatus(${user.id}, 'rejected')">✗</button>
                        ` : ''}
                        ${user.status === 'rejected' ? `
                            <button class="btn-approve" onclick="changeUserStatus(${user.id}, 'approved')">✓</button>
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
            return '<span class="status-badge status-active">Активен</span>';
        case 'pending':
            return '<span class="status-badge status-pending">Ожидает</span>';
        case 'rejected':
            return '<span class="status-badge status-rejected">Отклонен</span>';
        default:
            return '<span class="status-badge">Неизвестно</span>';
    }
}

async function changeUserRole(userId, newRole) {
    try {
        const response = await apiRequest(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            body: JSON.stringify({ role: newRole })
        });

        if (response.ok) {
            await loadUsers();
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function changeUserStatus(userId, status) {
    try {
        const response = await apiRequest(`/api/admin/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });

        if (response.ok) {
            await loadUsers();
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
    document.getElementById('summary-users').textContent = summary.unique_users || 0;

    const totalSeconds = parseInt(summary.total_duration) || 0;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.round((totalSeconds % 3600) / 60);
    document.getElementById('summary-total-time').textContent = `${hours}ч ${minutes}м`;

    const avgSeconds = parseInt(summary.avg_duration) || 0;
    const avgMinutes = Math.round(avgSeconds / 60);
    document.getElementById('summary-avg-time').textContent = `${avgMinutes}м`;
}

function renderStatsByProcess(stats) {
    const container = document.getElementById('stats-by-process');

    if (!stats || stats.length === 0) {
        container.innerHTML = '<div class="empty-state-mini">Нет данных</div>';
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
                </tr>
            </thead>
            <tbody>
                ${stats.map(row => `
                    <tr onclick="openProcessAnalytics(${row.id}, '${row.name}')" style="cursor: pointer;">
                        <td>
                            ${row.category_icon || ''} ${row.name}
                        </td>
                        <td><strong>${row.count}</strong></td>
                        <td>${formatDuration(row.total_duration)}</td>
                        <td>${formatDuration(row.avg_duration)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderStatsByUser(stats) {
    const container = document.getElementById('stats-by-user');

    if (!stats || stats.length === 0) {
        container.innerHTML = '<div class="empty-state-mini">Нет данных</div>';
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
                        <td><strong>${row.name || row.username || 'Без имени'}</strong></td>
                        <td>${row.count}</td>
                        <td>${formatDuration(row.total_duration)}</td>
                        <td>${formatDuration(row.avg_duration)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderRecordsTable(records) {
    const tbody = document.getElementById('records-table-body');

    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state-mini">Нет записей</td></tr>';
        return;
    }

    tbody.innerHTML = records.map(record => {
        const date = new Date(record.start_time);
        const dateStr = date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <tr>
                <td>${dateStr}</td>
                <td>${record.user_name || record.username || '-'}</td>
                <td>${record.process_name || '-'}</td>
                <td>${record.object_name || '-'}</td>
                <td>${record.duration_minutes ? record.duration_minutes + 'м' : '-'}</td>
                <td>${record.photo_count > 0 ? `📷 ${record.photo_count}` : '-'}</td>
                <td title="${record.comment || ''}">${(record.comment || '-').substring(0, 30)}</td>
            </tr>
        `;
    }).join('');
}

// Детальная аналитика по процессу
async function openProcessAnalytics(processId, processName) {
    document.getElementById('process-analytics-title').textContent = processName;

    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;

    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    try {
        const response = await apiRequest(`/api/admin/analytics/process/${processId}?${params}`);
        const data = await response.json();

        // Сводка
        document.getElementById('pa-total-executions').textContent = data.summary?.total_executions || 0;
        document.getElementById('pa-avg-duration').textContent = formatDuration(data.summary?.avg_duration);
        document.getElementById('pa-min-duration').textContent = formatDuration(data.summary?.min_duration);
        document.getElementById('pa-max-duration').textContent = formatDuration(data.summary?.max_duration);

        // По шагам
        const stepContainer = document.getElementById('pa-step-stats');
        if (data.stepStats && data.stepStats.length > 0) {
            stepContainer.innerHTML = data.stepStats.map(step => `
                <div class="step-stat-item">
                    <div class="step-stat-header">
                        <span class="step-stat-number">${step.step_number}</span>
                        <span class="step-stat-name">${step.step_name}</span>
                        ${step.estimated_duration > 0 ? `<span class="step-stat-expected">(ожид: ${step.estimated_duration}с)</span>` : ''}
                    </div>
                    <div class="step-stat-values">
                        <span>Выполнений: ${step.execution_count || 0}</span>
                        <span>Среднее: ${formatDuration(step.avg_duration)}</span>
                        <span>Мин: ${formatDuration(step.min_duration)}</span>
                        <span>Макс: ${formatDuration(step.max_duration)}</span>
                    </div>
                </div>
            `).join('');
        } else {
            stepContainer.innerHTML = '<div class="empty-state-mini">Нет данных по шагам</div>';
        }

        // По пользователям
        const userContainer = document.getElementById('pa-user-stats');
        if (data.userStats && data.userStats.length > 0) {
            userContainer.innerHTML = `<table class="stats-table"><tbody>${data.userStats.map(u => `
                <tr>
                    <td>${u.first_name || u.username}</td>
                    <td>${u.execution_count} раз</td>
                    <td>Сред: ${formatDuration(u.avg_duration)}</td>
                </tr>
            `).join('')}</tbody></table>`;
        } else {
            userContainer.innerHTML = '<div class="empty-state-mini">Нет данных</div>';
        }

        // По объектам
        const objectContainer = document.getElementById('pa-object-stats');
        if (data.objectStats && data.objectStats.length > 0) {
            objectContainer.innerHTML = `<table class="stats-table"><tbody>${data.objectStats.map(o => `
                <tr>
                    <td>${o.name}</td>
                    <td>${o.execution_count} раз</td>
                    <td>Сред: ${formatDuration(o.avg_duration)}</td>
                </tr>
            `).join('')}</tbody></table>`;
        } else {
            objectContainer.innerHTML = '<div class="empty-state-mini">Нет данных по объектам</div>';
        }

        document.getElementById('process-analytics-modal').classList.add('active');
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

function closeProcessAnalyticsModal() {
    document.getElementById('process-analytics-modal').classList.remove('active');
}

function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0с';
    seconds = parseInt(seconds);
    if (seconds < 60) return `${seconds}с`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (minutes < 60) return secs > 0 ? `${minutes}м ${secs}с` : `${minutes}м`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
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

    const objectSelect = document.getElementById('filter-object');
    if (objectSelect) {
        objectSelect.innerHTML = '<option value="">Все</option>' +
            objects.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
    }

    // Устанавливаем даты по умолчанию (последний месяц)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    const startInput = document.getElementById('filter-start-date');
    const endInput = document.getElementById('filter-end-date');
    if (startInput && !startInput.value) startInput.value = startDate.toISOString().split('T')[0];
    if (endInput && !endInput.value) endInput.value = endDate.toISOString().split('T')[0];
}
