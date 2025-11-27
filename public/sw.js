const CACHE_NAME = 'chronometry-v7';
const urlsToCache = [
    '/',
    '/index.html',
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

// Файлы которые должны всегда обновляться из сети (Network First)
const networkFirstUrls = ['/app.js', '/admin.js', '/api/'];

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

// Проверка нужна ли Network First стратегия
function shouldNetworkFirst(url) {
    return networkFirstUrls.some(pattern => url.includes(pattern));
}

// Стратегия: Network First для JS/API, Cache First для остального
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // API запросы - всегда из сети
    if (url.includes('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Network First для JS файлов
    if (shouldNetworkFirst(url)) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache First для остальных ресурсов
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then((response) => {
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                        return response;
                    })
                    .catch(() => {
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
