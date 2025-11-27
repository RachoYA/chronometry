const CACHE_NAME = 'chronometry-v6';
const urlsToCache = [
    '/',
    '/index.html',
    '/telegram-app.html',
    '/admin.html',
    '/styles.css',
    '/admin-styles.css',
    '/app.js',
    '/admin.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/icon.svg'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
    console.log('[SW] Установка Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Кэширование файлов приложения');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
    console.log('[SW] Активация Service Worker');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Удаление старого кэша:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Стратегия: Cache First, fallback to Network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Если ресурс в кэше - возвращаем его
                if (response) {
                    return response;
                }

                // Иначе пытаемся загрузить из сети
                return fetch(event.request)
                    .then((response) => {
                        // Проверяем валидность ответа
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Клонируем ответ для кэша
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Если сеть недоступна, возвращаем оффлайн страницу
                        if (event.request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});

// Background Sync для синхронизации данных
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-records') {
        console.log('[SW] Фоновая синхронизация данных...');
        event.waitUntil(syncRecords());
    }
});

async function syncRecords() {
    // Здесь будет логика синхронизации с сервером
    console.log('[SW] Синхронизация данных с сервером');

    // TODO: Получить несинхронизированные записи из IndexedDB
    // TODO: Отправить их на сервер
    // TODO: Пометить как синхронизированные
}

// Push-уведомления (для будущих функций)
self.addEventListener('push', (event) => {
    console.log('[SW] Push уведомление получено');

    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Хронометраж';
    const options = {
        body: data.body || 'У вас новое уведомление',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Клик по уведомлению');
    event.notification.close();

    event.waitUntil(
        clients.openWindow('/')
    );
});

console.log('[SW] Service Worker загружен');
