const { test, expect } = require('@playwright/test');

test.describe('Admin Panel - Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
  });

  test('should display admin login form', async ({ page }) => {
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
  });

  test('should login as admin', async ({ page }) => {
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');

    // Ждём загрузки админ-панели
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('#login-username', 'wrong');
    await page.fill('#login-password', 'wrong');
    await page.click('#login-form button[type="submit"]');

    await expect(page.locator('#login-error')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Admin Panel - Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
  });

  test('should display navigation tabs', async ({ page }) => {
    await expect(page.locator('.tabs')).toBeVisible();
    await expect(page.locator('.tab[data-tab="processes"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="objects"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="groups"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="assignments"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="users"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="analytics"]')).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    // Переключаемся на вкладку пользователей
    await page.click('.tab[data-tab="users"]');
    await expect(page.locator('#tab-users')).toBeVisible();

    // Переключаемся на вкладку объектов
    await page.click('.tab[data-tab="objects"]');
    await expect(page.locator('#tab-objects')).toBeVisible();

    // Переключаемся на вкладку групп
    await page.click('.tab[data-tab="groups"]');
    await expect(page.locator('#tab-groups')).toBeVisible();

    // Переключаемся на вкладку назначений
    await page.click('.tab[data-tab="assignments"]');
    await expect(page.locator('#tab-assignments')).toBeVisible();

    // Переключаемся на вкладку аналитики
    await page.click('.tab[data-tab="analytics"]');
    await expect(page.locator('#tab-analytics')).toBeVisible();

    // Возвращаемся на процессы
    await page.click('.tab[data-tab="processes"]');
    await expect(page.locator('#tab-processes')).toBeVisible();
  });

  test('should logout from admin panel', async ({ page }) => {
    await page.click('#logout-btn');
    await expect(page.locator('#login-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#admin-content')).toBeHidden();
  });
});

test.describe('Admin Panel - Users Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="users"]');
    await expect(page.locator('#tab-users')).toBeVisible();
  });

  test('should display users table', async ({ page }) => {
    await expect(page.locator('#users-table-body')).toBeVisible();
  });

  test('should have filter checkbox', async ({ page }) => {
    await expect(page.locator('#filter-pending')).toBeVisible();
  });
});

test.describe('Admin Panel - Processes Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="processes"]');
  });

  test('should display processes section', async ({ page }) => {
    await expect(page.locator('#tab-processes')).toBeVisible();
    await expect(page.locator('#processes-grid')).toBeVisible();
  });

  test('should have create process button', async ({ page }) => {
    await expect(page.locator('#tab-processes button:has-text("Создать процесс")')).toBeVisible();
  });

  test('should open process modal', async ({ page }) => {
    await page.click('#tab-processes button:has-text("Создать процесс")');
    await expect(page.locator('#process-modal')).toBeVisible();
    await expect(page.locator('#process-form')).toBeVisible();
  });

  test('should close process modal', async ({ page }) => {
    await page.click('#tab-processes button:has-text("Создать процесс")');
    await expect(page.locator('#process-modal')).toBeVisible();
    // Закрываем модальное окно
    await page.click('#process-modal button:has-text("×")');
    await expect(page.locator('#process-modal')).toBeHidden();
  });
});

test.describe('Admin Panel - Groups Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="groups"]');
  });

  test('should display groups section', async ({ page }) => {
    await expect(page.locator('#tab-groups')).toBeVisible();
    await expect(page.locator('#groups-grid')).toBeVisible();
  });

  test('should have create group button', async ({ page }) => {
    await expect(page.locator('#tab-groups button:has-text("Создать группу")')).toBeVisible();
  });

  test('should open group modal', async ({ page }) => {
    await page.click('#tab-groups button:has-text("Создать группу")');
    await expect(page.locator('#group-modal')).toBeVisible();
    await expect(page.locator('#group-form')).toBeVisible();
  });
});

test.describe('Admin Panel - Objects Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="objects"]');
  });

  test('should display objects section', async ({ page }) => {
    await expect(page.locator('#tab-objects')).toBeVisible();
    await expect(page.locator('#objects-grid')).toBeVisible();
  });

  test('should have create object button', async ({ page }) => {
    await expect(page.locator('#tab-objects button:has-text("Добавить объект")')).toBeVisible();
  });

  test('should open object modal', async ({ page }) => {
    await page.click('#tab-objects button:has-text("Добавить объект")');
    await expect(page.locator('#object-modal')).toBeVisible();
    await expect(page.locator('#object-form')).toBeVisible();
  });
});

test.describe('Admin Panel - Assignments Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="assignments"]');
  });

  test('should display assignments section', async ({ page }) => {
    await expect(page.locator('#tab-assignments')).toBeVisible();
    await expect(page.locator('#assignments-grid')).toBeVisible();
  });

  test('should have create assignment button', async ({ page }) => {
    await expect(page.locator('#tab-assignments button:has-text("Создать назначение")')).toBeVisible();
  });

  test('should open assignment modal', async ({ page }) => {
    await page.click('#tab-assignments button:has-text("Создать назначение")');
    await expect(page.locator('#assignment-modal')).toBeVisible();
    await expect(page.locator('#assignment-form')).toBeVisible();
  });
});

test.describe('Admin Panel - Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin.html');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="analytics"]');
  });

  test('should display analytics section', async ({ page }) => {
    await expect(page.locator('#tab-analytics')).toBeVisible();
  });

  test('should have filter controls', async ({ page }) => {
    await expect(page.locator('#filter-start-date')).toBeVisible();
    await expect(page.locator('#filter-end-date')).toBeVisible();
    await expect(page.locator('#filter-user')).toBeVisible();
    await expect(page.locator('#filter-process')).toBeVisible();
    await expect(page.locator('#filter-object')).toBeVisible();
  });

  test('should have summary cards', async ({ page }) => {
    await expect(page.locator('#summary-records')).toBeVisible();
    await expect(page.locator('#summary-total-time')).toBeVisible();
    await expect(page.locator('#summary-avg-time')).toBeVisible();
    await expect(page.locator('#summary-users')).toBeVisible();
  });

  test('should have apply filter button', async ({ page }) => {
    await expect(page.locator('#tab-analytics button:has-text("Применить")')).toBeVisible();
  });
});

test.describe('Admin Panel - Mobile View', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin.html');
  });

  test('should display login form on mobile', async ({ page }) => {
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('should login and show admin panel on mobile', async ({ page }) => {
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');

    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate tabs on mobile', async ({ page }) => {
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#admin-content')).toBeVisible({ timeout: 10000 });

    // Проверяем что табы работают на мобильном
    await page.click('.tab[data-tab="users"]');
    await expect(page.locator('#tab-users')).toBeVisible();
  });
});
