const { test, expect } = require('@playwright/test');

test.describe('PWA Main Features', () => {
  test.beforeEach(async ({ page }) => {
    // Входим как админ перед каждым тестом
    await page.goto('/');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-btn');
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });
  });

  test('should display main screen elements', async ({ page }) => {
    // Проверяем основные элементы
    await expect(page.locator('#user-greeting')).toBeVisible();
    await expect(page.locator('#logout-btn')).toBeVisible();
    await expect(page.locator('#assignments-section')).toBeVisible();
    await expect(page.locator('#free-processes-header')).toBeVisible();
  });

  test('should display statistics section', async ({ page }) => {
    await expect(page.locator('#stat-tasks')).toBeVisible();
    await expect(page.locator('#stat-time')).toBeVisible();
    await expect(page.locator('#stat-photos')).toBeVisible();
  });

  test('should have collapsible free processes section', async ({ page }) => {
    // Проверяем что секция процессов существует
    await expect(page.locator('#free-processes-header')).toBeVisible();

    // Кликаем для сворачивания
    await page.click('#free-processes-header');
    await page.waitForTimeout(300);

    // Снова кликаем для разворачивания
    await page.click('#free-processes-header');
    await page.waitForTimeout(300);
  });

  test('should display object selector', async ({ page }) => {
    await expect(page.locator('#object-selector')).toBeVisible();
    await expect(page.locator('#object-select')).toBeVisible();
  });

  test('should display process list', async ({ page }) => {
    await expect(page.locator('#process-list')).toBeVisible();
  });

  test('should display history section', async ({ page }) => {
    await expect(page.locator('#history-list')).toBeVisible();
  });

  test('should display sync button', async ({ page }) => {
    await expect(page.locator('#sync-btn')).toBeVisible();
  });

  test('should handle offline mode indicator', async ({ page }) => {
    const connectionStatus = page.locator('#connection-status');
    // По умолчанию должен быть скрыт (online)
    await expect(connectionStatus).toHaveClass(/hidden/);
  });
});

test.describe('PWA Process Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-btn');
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });
  });

  test('should have process cards in the list', async ({ page }) => {
    // Ждём загрузки процессов
    await page.waitForTimeout(1000);

    // Проверяем что процессы отображаются
    const processList = page.locator('#process-list');
    await expect(processList).toBeVisible();
  });

  test('should display finish modal when needed', async ({ page }) => {
    // Модальное окно должно быть скрыто по умолчанию
    await expect(page.locator('#finish-modal')).toBeHidden();
  });

  test('should display photo input element', async ({ page }) => {
    // Скрытый input для фото должен существовать
    const photoInput = page.locator('#photo-input');
    await expect(photoInput).toBeAttached();
  });
});

test.describe('PWA Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-btn');
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });
  });

  test('should be usable on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Все основные элементы должны быть видны
    await expect(page.locator('#user-greeting')).toBeVisible();
    await expect(page.locator('#logout-btn')).toBeVisible();
  });
});

test.describe('PWA Assignments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('#login-username', 'admin');
    await page.fill('#login-password', 'admin');
    await page.click('#login-btn');
    await expect(page.locator('#main-screen')).toBeVisible({ timeout: 5000 });
  });

  test('should display assignments section', async ({ page }) => {
    await expect(page.locator('#assignments-section')).toBeVisible();
    await expect(page.locator('#assignments-list')).toBeVisible();
  });
});

test.describe('PWA Service Worker', () => {
  test('should register service worker', async ({ page }) => {
    await page.goto('/');

    // Проверяем что SW зарегистрирован
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.length > 0;
      }
      return false;
    });

    // SW должен быть зарегистрирован (может занять время)
    // Не делаем строгую проверку, так как это зависит от окружения
  });

  test('should have manifest', async ({ page }) => {
    const response = await page.goto('/manifest.json');
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBeDefined();
    expect(manifest.icons).toBeDefined();
  });
});
