const { test, expect } = require('@playwright/test');

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form by default', async ({ page }) => {
    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#register-form')).toBeHidden();
  });

  test('should switch between login and register tabs', async ({ page }) => {
    // Переключение на регистрацию
    await page.click('[data-tab="register"]');
    await expect(page.locator('#register-form')).toBeVisible();
    await expect(page.locator('#login-form')).toBeHidden();

    // Переключение обратно на вход
    await page.click('[data-tab="login"]');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#register-form')).toBeHidden();
  });

  test('should show error for empty login credentials', async ({ page }) => {
    await page.click('#login-btn');
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-error')).toContainText('');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('#login-username', 'wronguser');
    await page.fill('#login-password', 'wrongpass');
    await page.click('#login-btn');

    await expect(page.locator('#login-error')).toBeVisible();
    await page.waitForTimeout(500);
  });

  test('should login as admin successfully', async ({ page }) => {
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-btn');

    // Ждём перехода на главный экран
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#auth-screen')).toBeHidden();
    await expect(page.locator('#user-greeting')).toContainText('Администратор');
  });

  test('should logout successfully', async ({ page }) => {
    // Входим
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-btn');
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });

    // Выходим
    await page.click('#logout-btn');
    await expect(page.locator('#auth-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#main-screen')).toBeHidden();
  });

  test('should register new user', async ({ page }) => {
    const randomUser = `testuser_${Date.now()}`;

    await page.click('[data-tab="register"]');
    await page.fill('#register-username', randomUser);
    await page.fill('#register-name', 'Test User');
    await page.fill('#register-password', 'test123');
    await page.fill('#register-password-confirm', 'test123');
    await page.click('#register-btn');

    // Ожидаем сообщение об успешной регистрации
    await expect(page.locator('#register-success')).toBeVisible({ timeout: 5000 });
  });

  test('should show error for password mismatch', async ({ page }) => {
    await page.click('[data-tab="register"]');
    await page.fill('#register-username', 'newuser123');
    await page.fill('#register-name', 'New User');
    await page.fill('#register-password', 'pass123');
    await page.fill('#register-password-confirm', 'different');
    await page.click('#register-btn');

    await expect(page.locator('#register-error')).toBeVisible();
  });

  test('should show error for short username', async ({ page }) => {
    await page.click('[data-tab="register"]');
    await page.fill('#register-username', 'ab');
    await page.fill('#register-name', 'Test');
    await page.fill('#register-password', 'pass123');
    await page.fill('#register-password-confirm', 'pass123');
    await page.click('#register-btn');

    await expect(page.locator('#register-error')).toBeVisible();
  });

  test('should persist session after page refresh', async ({ page }) => {
    // Входим
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-btn');
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });

    // Обновляем страницу
    await page.reload();

    // Должны остаться залогиненными
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });
  });
});
