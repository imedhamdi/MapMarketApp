// sw.js

// Nom du cache (à versionner si vous modifiez les fichiers de l'app shell)
const CACHE_NAME = 'mapmarket-cache-v1.2'; // Version incrémentée

// Liste des fichiers de l'application à mettre en cache (App Shell)
// Adaptez cette liste à votre structure de projet et à vos fichiers exacts.
const APP_SHELL_URLS = [
    '/', // Alias pour index.html à la racine
    '/index.html',
    '/styles.css', // Votre fichier CSS principal
    '/manifest.json', // Votre fichier manifest PWA

    // Modules JavaScript
    '/js/main.js',
    '/js/utils.js',
    '/js/state.js',
    '/js/auth.js',
    '/js/modals.js',
    '/js/map.js',
    '/js/ads.js',
    '/js/favorites.js',
    '/js/profile.js',
    '/js/filters.js',
    '/js/alerts.js',
    '/js/messages.js',
    '/js/pwa.js',
    '/js/onboarding.js',
    '/js/history.js',
    '/js/settings.js',
    '/js/notifications.js', // Assurez-vous que ce fichier existe si vous l'utilisez

    // Icônes et assets importants (adaptez les chemins et noms)
    '/icon-192x192.png', // Exemple d'icône pour le manifest
    '/icon-512x512.png', // Exemple d'icône pour le manifest
    '/avatar-default.svg',
    // Optionnel: Fichier son pour notifications (si vous l'utilisez et qu'il existe)
    // '/sounds/new_message_notification.mp3',

    // Librairies CDN (celles qui sont critiques pour le fonctionnement hors-ligne de base)
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    // Les fichiers woff2 de FontAwesome sont chargés par le CSS ci-dessus, le SW les interceptera.
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    // Les fichiers de police réels (woff2) chargés par le CSS Google Fonts sont plus difficiles à lister
    // car leurs URLs peuvent varier. Le cache du navigateur s'en charge souvent bien.
    // Mettre en cache le CSS de Google Fonts est un bon début.
    'https://cdn.socket.io/4.7.5/socket.io.min.js'
    // '/path/to/lottie.min.js', // Si vous utilisez Lottie localement
];

// Installation du Service Worker : mise en cache de l'app shell
self.addEventListener('install', (event) => {
    console.log('SW: Installation en cours (version ' + CACHE_NAME + ')...');
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then((cache) => {
            console.log('SW: Mise en cache de l\'app shell...');
            // Tenter de mettre en cache chaque URL individuellement pour un meilleur débogage
            const promises = APP_SHELL_URLS.map(url => {
                return fetch(new Request(url, { mode: 'cors' })) // Utiliser 'cors' pour les requêtes cross-origin
                    .then(response => {
                        if (!response.ok) {
                            // Ne pas mettre en cache les réponses d'erreur (ex: 404, 500)
                            // pour les ressources externes, cela pourrait cacher des problèmes.
                            // Pour les ressources locales, une erreur ici est plus critique.
                            console.error(`SW: Échec du fetch pour ${url} lors de la mise en cache (status: ${response.status}). La ressource ne sera pas mise en cache.`);
                            // Si c'est une ressource critique, vous pourriez vouloir faire échouer l'installation :
                            // if (url.startsWith(self.location.origin)) throw new Error(`Échec de la mise en cache de ${url}`);
                            return Promise.resolve(); // Continuer avec les autres
                        }
                        return cache.put(url, response);
                    })
                    .catch(error => {
                        console.error(`SW: Échec de la mise en cache de ${url}:`, error);
                        // Ne pas rejeter ici pour essayer de cacher les autres,
                        // mais l'installation pourrait échouer si une ressource critique manque.
                    });
            });
            return Promise.all(promises);
        })
        .then(() => {
            console.log("SW: App shell mise en cache avec succès. Activation de skipWaiting.");
            return self.skipWaiting(); // Force le nouveau SW à s'activer immédiatement
        })
        .catch(error => {
            console.error('SW: Erreur majeure lors de l\'événement d\'installation:', error);
            // L'installation a échoué, le SW ne sera pas activé.
        })
    );
});

// Activation du Service Worker : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
    console.log('SW: Activation en cours (version ' + CACHE_NAME + ')...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('SW: Suppression de l\'ancien cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('SW: Clients claim en cours...');
            return self.clients.claim(); // Permet au SW activé de contrôler immédiatement les clients non contrôlés.
        })
    );
});

// Stratégie de cache "Cache first, then network" pour les requêtes de l'app shell
// et "Network first, then cache" (ou network only) pour les API.
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Ignorer les requêtes non-GET
    if (event.request.method !== 'GET') {
        // console.log('SW: Requête non-GET, passage au réseau:', event.request.method, event.request.url);
        return; // Laisse le navigateur gérer
    }

    // Pour les requêtes API (ex: /api/), toujours aller au réseau en premier.
    if (requestUrl.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
            .then(networkResponse => {
                // Optionnel: mettre en cache la réponse API si elle est réussie et si la stratégie le permet
                // const cacheCopy = networkResponse.clone();
                // caches.open(CACHE_NAME_API_DYNAMIC).then(cache => cache.put(event.request, cacheCopy));
                return networkResponse;
            })
            .catch(error => {
                console.warn(`SW: Erreur fetch API (${event.request.url}), tentative de fallback cache (si implémenté):`, error);
                // Optionnel: tenter de servir depuis un cache API si le réseau échoue
                // return caches.match(event.request).then(cachedResponse => {
                //     return cachedResponse || new Response(JSON.stringify({ error: "Offline et pas de cache" }), { status: 503, headers: { 'Content-Type': 'application/json' }});
                // });
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Erreur réseau ou serveur indisponible lors de l\'appel API.'
                }), {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    status: 503
                });
            })
        );
        return;
    }

    // Pour les requêtes Socket.IO, ne pas intercepter par le SW
    if (requestUrl.pathname.startsWith('/socket.io/')) {
        // console.log('SW: Requête Socket.IO, passage au réseau:', event.request.url);
        return; // Laisse le navigateur gérer la requête
    }

    // Pour les autres requêtes (app shell, assets), stratégie Cache First
    event.respondWith(
        caches.match(event.request)
        .then((cachedResponse) => {
            if (cachedResponse) {
                // console.log('SW: Ressource servie depuis le cache:', event.request.url);
                return cachedResponse;
            }

            // console.log('SW: Ressource non en cache, fetch réseau:', event.request.url);
            return fetch(event.request).then((networkResponse) => {
                // Mettre en cache les nouvelles ressources récupérées si elles font partie de l'app shell
                // ou si c'est une stratégie de cache dynamique.
                // Ici, on ne met en cache que ce qui est dans APP_SHELL_URLS lors de l'install.
                // Si une ressource de l'app shell n'a pas été cachée à l'install (ex: erreur),
                // elle sera récupérée ici mais pas ajoutée au cache de l'app shell dynamiquement
                // sauf si on ajoute une logique spécifique ici.
                return networkResponse;
            }).catch(error => {
                console.warn(`SW: Erreur fetch réseau pour asset (${event.request.url}):`, error);
                // Optionnel: retourner une page hors-ligne générique ou un asset de fallback
                // if (event.request.destination === 'document') {
                //     return caches.match('/offline.html');
                // }
            });
        })
    );
});

// Écouter les messages du client (ex: pour skipWaiting ou synchronisation)
self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        console.log('SW: skipWaiting reçu, activation...');
        self.skipWaiting();
    }
});
