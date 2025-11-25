// Админ-панель JavaScript
let processes = [];
let categories = [];
let users = [];
let currentProcess = null;
let stepCounter = 0;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadData();
    setupEventListeners();
});

function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Активируем вкладку
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Показываем контент
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-${tabName}`).classList.add('active');
        });
    });
}

function setupEventListeners() {
    document.getElementById('btn-add-process').addEventListener('click', () => openProcessModal());
    document.getElementById('process-form').addEventListener('submit', handleProcessSubmit);
    document.getElementById('process-sequential').addEventListener('change', toggleStepsSection);
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
        const response = await fetch('/api/admin/processes');
        processes = await response.json();
        renderProcesses();
    } catch (error) {
        console.error('Ошибка загрузки процессов:', error);
        alert('Ошибка загрузки процессов');
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
        document.getElementById('steps-section').style.display = 'none';
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
    document.getElementById('steps-section').style.display = isSequential ? 'block' : 'none';
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

    // Перенумеруем шаги
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

    // Собираем шаги если процесс последовательный
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

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
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
        const response = await fetch(`/api/admin/processes/${id}`);
        const process = await response.json();
        openProcessModal(id);
    } catch (error) {
        console.error('Ошибка загрузки процесса:', error);
        alert('Ошибка загрузки процесса');
    }
}

async function deleteProcess(id) {
    if (!confirm('Удалить этот процесс?')) return;

    try {
        const response = await fetch(`/api/admin/processes/${id}`, { method: 'DELETE' });
        if (response.ok) {
            alert('Процесс удален');
            await loadProcesses();
        } else {
            alert('Ошибка удаления');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка удаления');
    }
}

// ============ КАТЕГОРИИ ============

async function loadCategories() {
    try {
        const response = await fetch('/api/admin/categories');
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
        const response = await fetch('/api/admin/users');
        users = await response.json();
        renderUsers();
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

function renderUsers() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = users.map(user => `
        <tr>
            <td style="padding: 12px;">${user.id}</td>
            <td style="padding: 12px;">${user.first_name || user.username || '-'}</td>
            <td style="padding: 12px;">${user.telegram_id || '-'}</td>
            <td style="padding: 12px;">
                <select onchange="changeUserRole(${user.id}, this.value)" style="padding: 6px; border-radius: 4px;">
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td style="padding: 12px;">${new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
            <td style="padding: 12px;">
                <span style="color: ${user.role === 'admin' ? '#4CAF50' : '#757575'};">
                    ${user.role === 'admin' ? '👑 Админ' : '👤 Пользователь'}
                </span>
            </td>
        </tr>
    `).join('');
}

async function changeUserRole(userId, newRole) {
    if (!confirm(`Изменить роль пользователя на "${newRole}"?`)) {
        await loadUsers();
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });

        if (response.ok) {
            alert('Роль изменена');
            await loadUsers();
        } else {
            alert('Ошибка изменения роли');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка изменения роли');
    }
}
