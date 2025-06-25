// sw.js

// Nom du cache (à versionner si vous modifiez les fichiers de l'app shell)
const CACHE_NAME = 'mapmarket-cache-v1.3'; // Version incrémentée

// Liste des fichiers de l'application à mettre en cache (App Shell)
// Adaptez cette liste à votre structure de projet et à vos fichiers exacts.
const APP_SHELL_URLS = [
    '/', // Alias pour index.html à la racine
    '/index.html',
    '/css/main.css',
    '/css/profile.css',
    '/css/messages.css',
    '/css/map.css',
    '/css/products.css',
    '/css/transactions.css',
    '/css/auth.css',
    '/css/responsive.css',
    '/css/utilities.css',
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

    // --- CORRECTION : Ajout de l'image de secours locale ---
    '/images/placeholder-image.svg', // Chemin vers votre image de secours

    // Icônes et assets importants (adaptez les chemins et noms)
    '/icon-192x192.png',
    '/icon-512x512.png',
    '/avatar-default.svg',
    // Optionnel: Fichier son pour notifications (si vous l'utilisez et qu'il existe)
    // '/sounds/new_message_notification.mp3',

    // Librairies CDN (celles qui sont critiques pour le fonctionnement hors-ligne de base)
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdn.socket.io/4.7.5/socket.io.min.js'
];

// Installation du Service Worker : mise en cache de l'app shell
self.addEventListener('install', (event) => {
    console.log('SW: Installation en cours (version ' + CACHE_NAME + ')...');
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then((cache) => {
            console.log('SW: Mise en cache de l\'app shell...');
            const promises = APP_SHELL_URLS.map(url => {
                return fetch(new Request(url, { mode: 'cors' }))
                    .then(response => {
                        if (!response.ok) {
                            console.error(`SW: Échec du fetch pour ${url} lors de la mise en cache (status: ${response.status}). La ressource ne sera pas mise en cache.`);
                            return Promise.resolve();
                        }
                        return cache.put(url, response);
                    })
                    .catch(error => {
                        console.error(`SW: Échec de la mise en cache de ${url}:`, error);
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
            return self.clients.claim();
        })
    );
});


// --- CORRECTION : Gestionnaire fetch entièrement remplacé ---
/**
 * Intercepte les requêtes réseau et applique des stratégies de cache.
 * - API & Socket.IO : Réseau d'abord (Network First).
 * - Autres assets : Cache d'abord, puis réseau avec un fallback robuste (Cache First with Fallback).
 */
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Ignorer les requêtes qui ne sont pas des GET
    if (event.request.method !== 'GET') {
        return; // Laisse le navigateur gérer les requêtes POST, PUT, DELETE, etc.
    }

    // Stratégie pour les appels API : Toujours essayer le réseau d'abord.
    if (requestUrl.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
            .catch(error => {
                // En cas d'échec réseau pour une API, retourner une réponse d'erreur JSON standard.
                console.warn(`SW: Erreur fetch API (${event.request.url}):`, error);
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Erreur réseau ou serveur indisponible. Veuillez vérifier votre connexion.'
                }), {
                    status: 503, // Service Unavailable
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Ne pas intercepter les requêtes Socket.IO, elles sont gérées par leur propre mécanisme.
    if (requestUrl.pathname.startsWith('/socket.io/')) {
        return;
    }

    // Stratégie "Cache First" pour tous les autres assets (HTML, CSS, JS, images...).
    event.respondWith(
        caches.match(event.request)
        .then((cachedResponse) => {
            // Si la ressource est trouvée dans le cache, on la sert directement.
            if (cachedResponse) {
                return cachedResponse;
            }

            // Si la ressource n'est pas en cache, on tente de la récupérer via le réseau.
            return fetch(event.request).catch(error => {
                // Cette partie est exécutée si le fetch réseau échoue (ex: utilisateur hors ligne).
                console.warn(`SW: Erreur fetch réseau pour l'asset (${event.request.url}):`, error);

                // On vérifie le type de ressource demandé pour fournir un fallback approprié.
                if (event.request.destination === 'image') {
                    // Si c'est une image, on retourne l'image de secours qui a été mise en cache.
                    return caches.match('/images/placeholder-image.svg');
                }
                
                // Pour tout autre cas (ex: un script ou une police qui n'a pas pu être chargé),
                // on retourne une réponse d'erreur explicite au lieu de 'undefined'.
                // Ceci empêche l'erreur fatale dans la console.
                return new Response('Ressource non disponible hors ligne et non mise en cache.', {
                    status: 404,
                    statusText: 'Not Found',
                    headers: { 'Content-Type': 'text/plain' }
                });
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