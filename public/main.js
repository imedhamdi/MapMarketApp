 // --- APPLICATION MAPMARKET ---
        // Toute la logique JavaScript reste INCHANGÉE.
        // Les modifications concernent uniquement le HTML et le CSS (via les classes Tailwind et la balise <style>).

        // --- ÉTAT GLOBAL DE L'APPLICATION ---
        const APP_STATE = {
            currentUser: null,
            items: [],
            favorites: [],
            threads: [],
            messages: {},
            currentFilters: { searchText: '', priceMin: null, priceMax: null, distance: 50, categories: [], etat: null },
            map: null,
            markerClusterGroup: null,
            userLocation: null,
            draggableMarker: null,
            currentOpenModal: null,
            socket: null,
            activeNav: 'map',
        };

        const API_BASE_URL = '/api';

        const CATEGORIES = {
            all: { name: 'Tout', icon: 'fa-asterisk', color: 'bg-gray-500', markerColor: '#6B7280' },
            immobilier: { name: 'Immobilier', icon: 'fa-home', color: 'bg-blue-500', markerColor: '#3B82F6' },
            vehicules: { name: 'Véhicules', icon: 'fa-car', color: 'bg-red-500', markerColor: '#EF4444' },
            emploi: { name: 'Emploi/Services', icon: 'fa-briefcase', color: 'bg-orange-500', markerColor: '#F97316' },
            mode: { name: 'Mode', icon: 'fa-tshirt', color: 'bg-pink-500', markerColor: '#EC4899' },
            enfants: { name: 'Enfants', icon: 'fa-baby-carriage', color: 'bg-yellow-400', markerColor: '#FACC15' },
            multimedia: { name: 'Électronique', icon: 'fa-laptop', color: 'bg-green-500', markerColor: '#22C55E' },
            maison: { name: 'Maison', icon: 'fa-couch', color: 'bg-amber-700', markerColor: '#B45309' },
            loisirs: { name: 'Loisirs', icon: 'fa-futbol', color: 'bg-cyan-500', markerColor: '#06B6D4' },
            videgrenier: { name: 'Vide Grenier', icon: 'fa-shopping-bag', color: 'bg-purple-500', markerColor: '#A855F7' },
            alerte: { name: 'Alerte', icon: 'fa-search-location', color: 'bg-sky-600', markerColor: '#0284C7' }
        };

        const ETATS = {
            neuf: "Neuf",
            tres_bon_etat: "Très bon état",
            bon_etat: "Bon état",
            satisfaisant: "Satisfaisant",
            pour_pieces: "Pour pièces"
        };

        // --- FONCTIONS UTILITAIRES ---
        function showGlobalLoader() {
            document.getElementById('globalLoader').classList.remove('hidden');
        }
        function hideGlobalLoader() {
            document.getElementById('globalLoader').classList.add('hidden');
        }

        function showToast(message, duration = 3000, type = 'info') {
            const toast = document.getElementById('toastNotification');
            const messageSpan = document.getElementById('toastMessage');
            messageSpan.textContent = message;
            toast.classList.remove('opacity-0', 'bg-gray-900', 'bg-red-600', 'bg-green-600', 'transform', 'translate-y-5');

            if (type === 'error') toast.classList.add('bg-red-600');
            else if (type === 'success') toast.classList.add('bg-green-600');
            else toast.classList.add('bg-gray-900'); // Toast par défaut plus sombre

            toast.classList.remove('translate-y-5');
            setTimeout(() => {
                toast.classList.add('opacity-0', 'transform', 'translate-y-5');
            }, duration);
        }

        function openModal(modalId) {
            if (APP_STATE.currentOpenModal) closeModal(APP_STATE.currentOpenModal.id);
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.add('active');
                APP_STATE.currentOpenModal = modal;
                document.body.style.overflow = 'hidden'; // Empêcher le scroll du body
            }
        }

        function closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal && modal.classList.contains('active')) {
                modal.classList.remove('active');
                if (APP_STATE.currentOpenModal && APP_STATE.currentOpenModal.id === modalId) {
                    APP_STATE.currentOpenModal = null;
                }
                // Ne rétablir le scroll que si aucune autre modale n'est ouverte
                if (!APP_STATE.currentOpenModal) {
                    document.body.style.overflow = '';
                }
            }
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && APP_STATE.currentOpenModal) {
                closeModal(APP_STATE.currentOpenModal.id);
            }
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) closeModal(modal.id);
            });
        });

        function loadUserFromLocalStorage() {
            const userString = localStorage.getItem('mapMarketUser');
            if (userString) {
                APP_STATE.currentUser = JSON.parse(userString);
            } else {
                APP_STATE.currentUser = null;
            }
        }
        function saveUserToLocalStorage(user) {
            if (user) {
                localStorage.setItem('mapMarketUser', JSON.stringify(user));
            } else {
                localStorage.removeItem('mapMarketUser');
            }
        }
        function getToken() {
            return APP_STATE.currentUser?.token || null;
        }

        function haversineDistance(coords1, coords2) {
            function toRad(x) { return x * Math.PI / 180; }
            const R = 6371;
            const dLat = toRad(coords2.lat - coords1.lat);
            const dLon = toRad(coords2.lng - coords1.lng);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        // --- GESTION DES APPELS API ---
        async function apiFetch(endpoint, options = {}) {
            showGlobalLoader();
            const token = getToken();
            const headers = { ...options.headers };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            if (!(options.body instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
                if (options.body) options.body = JSON.stringify(options.body);
            }

            try {
                const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
                hideGlobalLoader();

                if (response.status === 401) {
                    showToast("Session expirée. Veuillez vous reconnecter.", 3000, 'error');
                    handleLogout();
                    showLoginForm();
                    return Promise.reject(new Error("Non autorisé"));
                }
                const data = await response.json().catch(() => null);

                if (!response.ok) {
                    const errorMessage = data?.message || data?.error || `Erreur ${response.status}: ${response.statusText}`;
                    console.error(`API Error ${response.status} for ${options.method || 'GET'} ${endpoint}:`, errorMessage, data);
                    return Promise.reject({ status: response.status, message: errorMessage, data });
                }
                return data;
            } catch (error) {
                hideGlobalLoader();
                console.error(`Erreur réseau ou de l'application pour ${options.method || 'GET'} ${endpoint}:`, error);
                showToast("Une erreur de communication est survenue. Veuillez réessayer.", 3000, 'error');
                return Promise.reject(error);
            }
        }


        // --- AUTHENTIFICATION ---
        function showLoginForm() {
            const content = document.getElementById('authModalContent');
            content.innerHTML = `
                <h2 class="text-2xl font-bold mb-6 text-center text-gray-800">Bienvenue !</h2>
                <form id="loginForm" class="space-y-4">
                    <div><label for="loginEmail" class="block text-sm font-medium text-gray-700">Adresse e-mail</label><input type="email" id="loginEmail" required class="input-style mt-1 block w-full" placeholder="vous@exemple.com" autocomplete="email"></div>
                    <div><label for="loginPassword" class="block text-sm font-medium text-gray-700">Mot de passe</label><input type="password" id="loginPassword" required class="input-style mt-1 block w-full" placeholder="********" autocomplete="current-password"></div>
                    <button type="submit" class="w-full btn-primary py-3 text-base">Se connecter</button>
                </form>
                <div class="mt-6 text-center text-sm">
                    <button id="showSignupFormBtn" class="font-medium text-purple-600 hover:text-purple-500 hover:underline">Pas encore de compte ? S'inscrire</button>
                    <p class="my-2 text-gray-400">&bull;</p>
                    <button id="showForgotPasswordFormBtn" class="font-medium text-purple-600 hover:text-purple-500 hover:underline">Mot de passe oublié ?</button>
                </div>
                <button id="closeAuthModalBtnLogin" class="mt-8 w-full btn-secondary bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5">Fermer</button>
            `;
            openModal('authModal');
            document.getElementById('loginForm').addEventListener('submit', handleLogin);
            document.getElementById('showSignupFormBtn').addEventListener('click', showSignupForm);
            document.getElementById('showForgotPasswordFormBtn').addEventListener('click', showForgotPasswordForm);
            document.getElementById('closeAuthModalBtnLogin').addEventListener('click', () => closeModal('authModal'));
        }
        function showSignupForm() {
            const content = document.getElementById('authModalContent');
            content.innerHTML = `
                <h2 class="text-2xl font-bold mb-6 text-center text-gray-800">Créer un compte</h2>
                <form id="signupForm" class="space-y-4">
                    <div><label for="signupUsername" class="block text-sm font-medium text-gray-700">Pseudo</label><input type="text" id="signupUsername" required class="input-style mt-1 block w-full" placeholder="Votre nom d'utilisateur" autocomplete="username"></div>
                    <div><label for="signupEmail" class="block text-sm font-medium text-gray-700">Adresse e-mail</label><input type="email" id="signupEmail" required class="input-style mt-1 block w-full" placeholder="vous@exemple.com" autocomplete="email"></div>
                    <div><label for="signupPassword" class="block text-sm font-medium text-gray-700">Mot de passe</label><input type="password" id="signupPassword" required class="input-style mt-1 block w-full" placeholder="Au moins 6 caractères" autocomplete="new-password"></div>
                    <button type="submit" class="w-full btn-primary py-3 text-base">S'inscrire</button>
                </form>
                <div class="mt-6 text-center text-sm"><button id="showLoginFormBtn" class="font-medium text-purple-600 hover:text-purple-500 hover:underline">Déjà un compte ? Se connecter</button></div>
                <button id="closeAuthModalBtnSignup" class="mt-8 w-full btn-secondary bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5">Fermer</button>
            `;
            openModal('authModal');
            document.getElementById('signupForm').addEventListener('submit', handleSignup);
            document.getElementById('showLoginFormBtn').addEventListener('click', showLoginForm);
            document.getElementById('closeAuthModalBtnSignup').addEventListener('click', () => closeModal('authModal'));
        }
        function showForgotPasswordForm() {
            const content = document.getElementById('authModalContent');
            content.innerHTML = `
                <h2 class="text-2xl font-bold mb-6 text-center text-gray-800">Réinitialiser le mot de passe</h2>
                <p class="text-sm text-gray-600 mb-4 text-center">Entrez votre adresse e-mail. Nous vous enverrons un lien pour réinitialiser votre mot de passe.</p>
                <form id="forgotPasswordForm" class="space-y-4">
                    <div><label for="forgotEmail" class="block text-sm font-medium text-gray-700">Adresse e-mail</label><input type="email" id="forgotEmail" required class="input-style mt-1 block w-full" placeholder="vous@exemple.com" autocomplete="email"></div>
                    <button type="submit" class="w-full btn-primary py-3 text-base">Envoyer le lien</button>
                </form>
                <div class="mt-6 text-center text-sm"><button id="showLoginFormBtnForgot" class="font-medium text-purple-600 hover:text-purple-500 hover:underline">Retour à la connexion</button></div>
                <button id="closeAuthModalBtnForgot" class="mt-8 w-full btn-secondary bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5">Fermer</button>
            `;
            openModal('authModal');
            document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);
            document.getElementById('showLoginFormBtnForgot').addEventListener('click', showLoginForm);
            document.getElementById('closeAuthModalBtnForgot').addEventListener('click', () => closeModal('authModal'));
        }

        async function handleLogin(event) {
            event.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            try {
                const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
                APP_STATE.currentUser = data.user;
                APP_STATE.currentUser.token = data.token;
                saveUserToLocalStorage(APP_STATE.currentUser);
                await loadUserSpecificDataAfterLogin();
                updateAuthStateUI();
                closeModal('authModal');
                showToast(`Bienvenue ${APP_STATE.currentUser.username} !`, 3000, 'success');
                refreshMapMarkers();
                connectWebSocket();
            } catch (error) {
                showToast(error.message || "Erreur de connexion. Vérifiez vos identifiants.", 5000, 'error');
            }
        }

        async function handleSignup(event) {
            event.preventDefault();
            const username = document.getElementById('signupUsername').value;
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            if (password.length < 6) { showToast("Le mot de passe doit faire au moins 6 caractères.", 3000, 'error'); return; }
            try {
                const data = await apiFetch('/auth/signup', { method: 'POST', body: { username, email, password } });
                if (data.token && data.user) {
                    APP_STATE.currentUser = data.user;
                    APP_STATE.currentUser.token = data.token;
                    saveUserToLocalStorage(APP_STATE.currentUser);
                    await loadUserSpecificDataAfterLogin();
                    updateAuthStateUI();
                    closeModal('authModal');
                    showToast("Inscription réussie ! Vous êtes connecté.", 3000, 'success');
                    refreshMapMarkers();
                    connectWebSocket();
                } else {
                    closeModal('authModal');
                    showToast(data.message || "Inscription réussie ! Vérifiez votre email.", 5000, 'success');
                }
            } catch (error) {
                showToast(error.message || "Erreur d'inscription.", 5000, 'error');
            }
        }
        async function handleForgotPassword(event) {
            event.preventDefault();
            const email = document.getElementById('forgotEmail').value;
            try {
                const data = await apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
                showToast(data.message || "Lien de réinitialisation envoyé.", 5000, 'success');
                closeModal('authModal');
            } catch (error) {
                showToast(error.message || "Erreur lors de la demande.", 5000, 'error');
            }
        }
        async function handleEmailVerification() {
            const urlParams = new URLSearchParams(window.location.search);
            const verificationToken = urlParams.get('token');
            if (verificationToken) {
                try {
                    const data = await apiFetch(`/auth/verify-email?token=${verificationToken}`);
                    showToast(data.message || "Email vérifié !", 5000, 'success');
                    window.history.replaceState({}, document.title, window.location.pathname);
                } catch (error) {
                    showToast(error.message || "Erreur vérification email.", 5000, 'error');
                }
            }
        }


        function handleLogout() {
            APP_STATE.currentUser = null;
            APP_STATE.favorites = [];
            APP_STATE.threads = [];
            APP_STATE.messages = {};
            saveUserToLocalStorage(null);
            updateAuthStateUI();
            if (APP_STATE.currentOpenModal?.id === 'profileModal') closeModal('profileModal');
            showToast("Déconnexion réussie.", 3000, 'success');
            refreshMapMarkers();
            disconnectWebSocket();
        }

        function updateAuthStateUI() {
            const profileNavButtonText = document.querySelector('.nav-item[data-target-view="profile"] span:last-child');
            const profileAvatarSmall = document.getElementById('userAvatarSmall');
            const profileAvatarBtnTopNav = document.getElementById('profileAvatarBtn');
            const notificationBadge = document.getElementById('notificationBadge');

            if (APP_STATE.currentUser) {
                profileNavButtonText.textContent = APP_STATE.currentUser.username.substring(0, 7);
                profileAvatarSmall.src = APP_STATE.currentUser.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(APP_STATE.currentUser.username)}&background=A78BFA&color=fff&size=36`;
                profileAvatarBtnTopNav.onclick = () => { setActiveNav('profile'); showProfileModal(); };

                const unreadCount = APP_STATE.threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
                notificationBadge.textContent = unreadCount > 9 ? '9+' : unreadCount.toString();
                notificationBadge.classList.toggle('hidden', unreadCount === 0);
            } else {
                profileNavButtonText.textContent = "Profil";
                profileAvatarSmall.src = 'https://placehold.co/36x36/E5E7EB/4B5563?text=U';
                profileAvatarBtnTopNav.onclick = () => { setActiveNav('profile'); showLoginForm(); };
                notificationBadge.classList.add('hidden');
            }
        }

        async function loadUserSpecificDataAfterLogin() {
            if (!APP_STATE.currentUser) return;
            try {
                showGlobalLoader();
                const [favoritesData, threadsData] = await Promise.all([
                    apiFetch('/favorites').catch(err => { console.error("Erreur chargement favoris:", err); return []; }),
                    apiFetch('/messages/threads').catch(err => { console.error("Erreur chargement threads:", err); return []; })
                ]);
                APP_STATE.favorites = favoritesData.map(fav => fav.id || fav._id || fav);
                APP_STATE.threads = threadsData;
                updateAuthStateUI();
            } catch (error) {
                console.error("Erreur chargement données utilisateur:", error);
            } finally {
                hideGlobalLoader();
            }
        }


        // --- CARTE (Leaflet) ---
        function initMap() {
            APP_STATE.map = L.map('map', { zoomControl: false }).setView([48.8566, 2.3522], 12);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(APP_STATE.map);
            L.control.zoom({ position: 'bottomright' }).addTo(APP_STATE.map);

            APP_STATE.markerClusterGroup = L.markerClusterGroup({
                spiderfyOnMaxZoom: true, showCoverageOnHover: false, zoomToBoundsOnClick: true,
                iconCreateFunction: function (cluster) {
                    const count = cluster.getChildCount();
                    let size = ' marker-cluster-';
                    if (count < 10) size += 'small';
                    else if (count < 100) size += 'medium';
                    else size += 'large';
                    return L.divIcon({
                        html: `<div><span>${count}</span></div>`,
                        className: `marker-cluster ${size}`,
                        iconSize: L.point(40, 40)
                    });
                }
            }).addTo(APP_STATE.map);

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(position => {
                    APP_STATE.userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                    APP_STATE.map.setView(APP_STATE.userLocation, 13);
                    L.circleMarker(APP_STATE.userLocation, { radius: 8, color: '#8B5CF6', fillColor: '#A78BFA', fillOpacity: 0.6, weight: 2, interactive: false }).addTo(APP_STATE.map);
                    loadItemsAndRefreshMap();
                }, () => {
                    showToast("Position non récupérée. Affichage par défaut.", 3000, 'info');
                    loadItemsAndRefreshMap();
                });
            } else {
                showToast("Géolocalisation non supportée.", 3000, 'error');
                loadItemsAndRefreshMap();
            }
        }

        function createCustomMarkerIcon(item) {
            const categoryInfo = CATEGORIES[item.category] || CATEGORIES.videgrenier;
            const itemTypeInfo = item.type === 'alerte' ? CATEGORIES.alerte : categoryInfo;
            let priceBadge = '';
            if (item.type === 'annonce' && item.price != null) {
                priceBadge = `<div class="custom-marker-price">€${item.price.toLocaleString()}</div>`;
            }
            const iconHtml = `<div class="custom-marker-icon" style="background-color: ${itemTypeInfo.markerColor}; position: relative;"><i class="fas ${itemTypeInfo.icon}"></i>${priceBadge}</div>`;
            return L.divIcon({ html: iconHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 36] });
        }
        function addMarkerToMap(item) {
            if (item.lat == null || item.lng == null) return;
            const marker = L.marker([item.lat, item.lng], { icon: createCustomMarkerIcon(item) });
            marker.on('click', () => { showItemDetailModal(item.id || item._id); }); // Utiliser _id si id n'existe pas (MongoDB)
            APP_STATE.markerClusterGroup.addLayer(marker);
        }
        async function loadItemsAndRefreshMap() {
            try {
                const items = await apiFetch('/items');
                APP_STATE.items = items.map(item => ({ ...item, id: item._id || item.id })); // Normaliser l'ID
                refreshMapMarkers();
            } catch (error) {
                console.error("Erreur chargement articles :", error);
            }
        }
        function refreshMapMarkers() {
            if (APP_STATE.markerClusterGroup) APP_STATE.markerClusterGroup.clearLayers();
            const displayableItems = APP_STATE.items.filter(it => it.type === 'annonce' || it.type === 'alerte');
            const trulyFilteredItems = applyFilters(displayableItems);
            trulyFilteredItems.forEach(item => addMarkerToMap(item));
        }
        function addDraggableMarker(lat, lng) {
            if (APP_STATE.draggableMarker) APP_STATE.map.removeLayer(APP_STATE.draggableMarker);
            const markerColor = CATEGORIES.alerte.markerColor;
            const draggableIcon = L.divIcon({
                html: `<div class="custom-marker-icon animate-pulse ring-2 ring-white" style="background-color: ${markerColor}; width: 40px; height: 40px; font-size: 18px;"><i class="fas fa-map-pin fa-lg"></i></div>`,
                className: '', iconSize: [40, 40], iconAnchor: [20, 40]
            });
            APP_STATE.draggableMarker = L.marker([lat, lng], { icon: draggableIcon, draggable: true, zIndexOffset: 1000 }).addTo(APP_STATE.map);

            function updateCoordsDisplay(position) {
                document.getElementById('itemLat').value = position.lat.toFixed(6);
                document.getElementById('itemLng').value = position.lng.toFixed(6);
                document.getElementById('itemPositionCoords').textContent = `Lat: ${position.lat.toFixed(4)}, Lng: ${position.lng.toFixed(4)}`;
            }
            APP_STATE.draggableMarker.on('dragend', (event) => {
                const position = event.target.getLatLng();
                updateCoordsDisplay(position);
                APP_STATE.map.panTo(position);
            });
            updateCoordsDisplay({ lat, lng });
            APP_STATE.map.setView([lat, lng], APP_STATE.map.getZoom() < 15 ? 15 : APP_STATE.map.getZoom());
        }
        function removeDraggableMarker() {
            if (APP_STATE.draggableMarker) { APP_STATE.map.removeLayer(APP_STATE.draggableMarker); APP_STATE.draggableMarker = null; }
        }

        // --- GESTION DES ARTICLES (Annonces & Alertes) ---
        function populateCategorySelect(selectElementId, includeAlertCategory = false) {
            const select = document.getElementById(selectElementId);
            select.innerHTML = '<option value="">Sélectionnez une catégorie...</option>';
            for (const key in CATEGORIES) {
                if (key === 'all' || (key === 'alerte' && !includeAlertCategory)) continue;
                const option = document.createElement('option');
                option.value = key; option.textContent = CATEGORIES[key].name;
                select.appendChild(option);
            }
        }
        function populateStateSelect(selectElementId) {
            const select = document.getElementById(selectElementId);
            select.innerHTML = '<option value="">Sélectionnez l\'état...</option>';
            for (const key in ETATS) {
                const option = document.createElement('option');
                option.value = key; option.textContent = ETATS[key];
                select.appendChild(option);
            }
        }

        document.getElementById('publishFab').addEventListener('click', () => {
            if (!APP_STATE.currentUser) { showToast("Veuillez vous connecter pour publier.", 3000, 'info'); showLoginForm(); return; }
            showItemFormModal();
        });

        let selectedImageFiles = [];

        function showItemFormModal(itemToEdit = null) {
            const form = document.getElementById('itemForm');
            form.reset();
            document.getElementById('imagePreviewContainer').innerHTML = '';
            selectedImageFiles = [];

            populateCategorySelect('itemCategory');
            populateStateSelect('itemState');

            const itemTypeSelect = document.getElementById('itemType');
            const priceContainer = document.getElementById('itemPriceContainer');
            const priceRangeContainer = document.getElementById('itemPriceRangeContainer');
            const imageUploadContainer = document.getElementById('itemImageUploadContainer');
            const stateContainer = document.getElementById('itemStateContainer');
            const itemFormTitle = document.getElementById('itemFormTitle');
            const positionCoordsEl = document.getElementById('itemPositionCoords');

            function toggleFormFields() {
                const isAlerte = itemTypeSelect.value === 'alerte';
                priceContainer.classList.toggle('hidden', isAlerte);
                priceRangeContainer.classList.toggle('hidden', !isAlerte);
                imageUploadContainer.classList.toggle('hidden', isAlerte);
                stateContainer.classList.toggle('hidden', isAlerte);
                itemFormTitle.textContent = isAlerte ? "Créer une Alerte de Recherche" : "Publier une Nouvelle Annonce";
                document.getElementById('itemPrice').required = !isAlerte;
                document.getElementById('itemState').required = !isAlerte;
            }
            itemTypeSelect.removeEventListener('change', toggleFormFields);
            itemTypeSelect.addEventListener('change', toggleFormFields);

            if (itemToEdit) {
                itemFormTitle.textContent = `Modifier ${itemToEdit.type === 'annonce' ? 'l\'Annonce' : 'l\'Alerte'}`;
                document.getElementById('itemId').value = itemToEdit.id || itemToEdit._id;
                itemTypeSelect.value = itemToEdit.type;
                document.getElementById('itemTitle').value = itemToEdit.title;
                document.getElementById('itemCategory').value = itemToEdit.category;
                document.getElementById('itemDescription').value = itemToEdit.description;
                if (itemToEdit.type === 'annonce') {
                    document.getElementById('itemPrice').value = itemToEdit.price || '';
                    document.getElementById('itemState').value = itemToEdit.etat || '';
                } else {
                    document.getElementById('itemMinPrice').value = itemToEdit.minPrice || '';
                    document.getElementById('itemMaxPrice').value = itemToEdit.maxPrice || '';
                }
                addDraggableMarker(itemToEdit.lat, itemToEdit.lng);
                positionCoordsEl.textContent = `Lat: ${itemToEdit.lat.toFixed(4)}, Lng: ${itemToEdit.lng.toFixed(4)}`;
            } else {
                const center = APP_STATE.userLocation || APP_STATE.map.getCenter();
                addDraggableMarker(center.lat, center.lng);
                positionCoordsEl.textContent = `Lat: ${center.lat.toFixed(4)}, Lng: ${center.lng.toFixed(4)}`;
            }

            toggleFormFields();
            openModal('itemFormModal');
        }

        document.getElementById('modifyPositionBtn').addEventListener('click', () => {
            if (APP_STATE.draggableMarker) {
                APP_STATE.map.panTo(APP_STATE.draggableMarker.getLatLng());
                showToast("Déplacez le marqueur bleu sur la carte pour ajuster la position.", 2500);
            } else {
                const currentLat = parseFloat(document.getElementById('itemLat').value) || APP_STATE.map.getCenter().lat;
                const currentLng = parseFloat(document.getElementById('itemLng').value) || APP_STATE.map.getCenter().lng;
                addDraggableMarker(currentLat, currentLng);
                showToast("Marqueur ajouté. Déplacez-le pour définir la position.", 2500);
            }
        });

        const photoUploadArea = document.getElementById('photoUploadArea');
        const itemImagesInput = document.getElementById('itemImages');
        photoUploadArea.addEventListener('click', () => itemImagesInput.click());
        photoUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); photoUploadArea.classList.add('border-purple-500', 'bg-purple-50'); });
        photoUploadArea.addEventListener('dragleave', () => photoUploadArea.classList.remove('border-purple-500', 'bg-purple-50'));
        photoUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            photoUploadArea.classList.remove('border-purple-500', 'bg-purple-50');
            if (e.dataTransfer.files) {
                itemImagesInput.files = e.dataTransfer.files;
                handleImagePreview(e.dataTransfer.files);
            }
        });
        itemImagesInput.addEventListener('change', (e) => handleImagePreview(e.target.files));

        function handleImagePreview(files) {
            const previewContainer = document.getElementById('imagePreviewContainer');
            previewContainer.innerHTML = ''; selectedImageFiles = [];
            if (files.length > 3) { showToast("Maximum 3 images autorisées.", 3000, 'error'); itemImagesInput.value = ''; return; }
            Array.from(files).forEach(file => {
                if (!file.type.startsWith('image/')) { showToast(`Le fichier ${file.name} n'est pas une image.`, 2000, 'error'); return; }
                selectedImageFiles.push(file);
                const reader = new FileReader();
                reader.onload = (e) => {
                    const imgWrapper = document.createElement('div');
                    imgWrapper.className = 'relative w-20 h-20 rounded border border-gray-200 overflow-hidden shadow-sm';
                    const img = document.createElement('img');
                    img.src = e.target.result; img.alt = `Prévisualisation de ${file.name}`; img.className = 'w-full h-full object-cover';
                    imgWrapper.appendChild(img);
                    previewContainer.appendChild(imgWrapper);
                }
                reader.readAsDataURL(file);
            });
        }

        document.getElementById('itemForm').addEventListener('submit', async function (event) {
            event.preventDefault();
            if ((document.getElementById('itemLat').value === '' || document.getElementById('itemLng').value === '')) {
                showToast("Veuillez définir la localisation sur la carte.", 3000, 'error'); return;
            }
            const form = event.target;
            const formData = new FormData(form);

            if (formData.get('type') === 'annonce' && selectedImageFiles.length > 0) {
                formData.delete('images');
                selectedImageFiles.forEach((file) => {
                    formData.append('images', file, file.name);
                });
            } else if (formData.get('type') === 'annonce') {
                formData.delete('images');
            }


            const itemId = formData.get('id');
            const endpoint = itemId ? `/items/${itemId}` : '/items';
            const method = itemId ? 'PUT' : 'POST';

            try {
                const result = await apiFetch(endpoint, { method, body: formData });
                showToast(itemId ? "Modifications enregistrées !" : "Publication réussie !", 3000, 'success');
                closeModal('itemFormModal');
                removeDraggableMarker();
                await loadItemsAndRefreshMap();
            } catch (error) {
                showToast(error.message || "Erreur lors de la sauvegarde.", 5000, 'error');
            }
        });
        document.getElementById('cancelItemForm').addEventListener('click', () => { closeModal('itemFormModal'); removeDraggableMarker(); });
        document.getElementById('closeItemFormModal').addEventListener('click', () => { closeModal('itemFormModal'); removeDraggableMarker(); });

        function showItemDetailModal(itemId) {
            const item = APP_STATE.items.find(i => (i.id || i._id) === itemId);
            if (!item) { console.error("Article non trouvé:", itemId); return; }

            document.getElementById('itemDetailTitle').textContent = item.title;
            const categoryBadge = document.getElementById('itemDetailCategoryBadge');
            categoryBadge.textContent = CATEGORIES[item.category]?.name || 'Inconnue';
            categoryBadge.className = `text-xs font-semibold inline-block py-1 px-2.5 uppercase rounded-full text-white ${CATEGORIES[item.category]?.color || 'bg-gray-500'}`;

            const priceEl = document.getElementById('itemDetailPrice');
            const stateTextEl = document.getElementById('itemDetailStateText');
            const stateContainerEl = document.getElementById('itemDetailStateDisplay');
            const offerSection = document.getElementById('offerSection');

            if (item.type === 'annonce') {
                priceEl.textContent = item.price != null ? `€${item.price.toLocaleString()}` : "Prix non spécifié";
                stateTextEl.textContent = ETATS[item.etat] || 'Non spécifié';
                stateContainerEl.classList.remove('hidden');
                priceEl.classList.remove('hidden');
                offerSection.classList.remove('hidden');
            } else {
                let priceRangeText = "Fourchette de prix non spécifiée";
                if (item.minPrice != null && item.maxPrice != null) priceRangeText = `Entre €${item.minPrice} et €${item.maxPrice}`;
                else if (item.minPrice != null) priceRangeText = `À partir de €${item.minPrice}`;
                else if (item.maxPrice != null) priceRangeText = `Jusqu'à €${item.maxPrice}`;
                priceEl.textContent = priceRangeText;
                stateContainerEl.classList.add('hidden');
                priceEl.classList.remove('hidden');
                offerSection.classList.add('hidden');
            }

            document.getElementById('itemDetailDescription').textContent = item.description;
            document.getElementById('itemDetailLocationText').textContent = `Proche de (${item.lat.toFixed(2)}, ${item.lng.toFixed(2)})`;

            const distanceEl = document.getElementById('itemDetailDistance');
            if (APP_STATE.userLocation && item.lat != null && item.lng != null) {
                const dist = haversineDistance(APP_STATE.userLocation, { lat: item.lat, lng: item.lng });
                distanceEl.textContent = `À ${dist.toFixed(1)} km de vous`;
                distanceEl.classList.remove('hidden');
            } else { distanceEl.classList.add('hidden'); }

            const imageCarousel = document.getElementById('itemDetailImageCarousel');
            imageCarousel.innerHTML = '';
            if (item.images && item.images.length > 0) {
                // TODO: Implémenter un vrai carrousel si plusieurs images
                const img = document.createElement('img');
                img.src = item.images[0]; img.alt = `Image de ${item.title}`;
                img.onerror = () => { img.src = 'https://placehold.co/600x400/D1D5DB/4B5563?text=Image+Indisponible'; img.alt = 'Image indisponible'; }
                img.className = 'w-full h-full object-cover';
                img.loading = 'lazy'; // Lazy loading pour les images
                imageCarousel.appendChild(img);
            } else {
                imageCarousel.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-gray-400"><i class="fas ${CATEGORIES[item.category]?.icon || 'fa-image'} fa-4x" style="color: ${CATEGORIES[item.category]?.markerColor || '#CBD5E1'}"></i></div>`;
            }

            // L'API /api/items doit retourner les informations du vendeur (userId)
            // Pour obtenir les détails du vendeur (nom, avatar, rating), il faudrait un autre appel API
            // ou que l'API /api/items "popule" ces informations.
            // Pour la démo, on va essayer de trouver le vendeur dans APP_STATE.items si c'est un objet utilisateur.
            // C'est une simplification; en production, l'API /items/:id devrait retourner les infos vendeur.
            const seller = APP_STATE.items.find(u => (u.id || u._id) === item.userId && u.type === '_user_');
            if (seller) {
                document.getElementById('itemDetailSellerAvatar').src = seller.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(seller.username)}&background=A78BFA&color=fff&size=48`;
                document.getElementById('itemDetailSellerName').textContent = seller.username;
                const ratingStarsContainer = document.getElementById('itemDetailSellerRating');
                ratingStarsContainer.innerHTML = '';
                const score = seller.rating?.score || 0;
                const count = seller.rating?.count || 0;
                for (let i = 1; i <= 5; i++) {
                    ratingStarsContainer.innerHTML += `<i class="fas fa-star ${i <= score ? '' : 'empty'}"></i>`;
                }
                ratingStarsContainer.innerHTML += ` <span class="text-xs text-gray-500 ml-1">(${count} avis)</span>`;
            } else {
                document.getElementById('itemDetailSellerName').textContent = "Vendeur"; // Placeholder
                document.getElementById('itemDetailSellerAvatar').src = 'https://placehold.co/48x48/E5E7EB/4B5563?text=?';
                document.getElementById('itemDetailSellerRating').innerHTML = '<span class="text-xs text-gray-500">Infos vendeur non disponibles</span>';
            }

            const favoriteBtn = document.getElementById('itemDetailFavoriteBtn');
            const isFavorite = APP_STATE.currentUser ? APP_STATE.favorites.includes(item.id || item._id) : false;
            favoriteBtn.innerHTML = `<i class="${isFavorite ? 'fas text-pink-500' : 'far'} fa-heart"></i>`;
            favoriteBtn.setAttribute('aria-pressed', isFavorite.toString());
            favoriteBtn.dataset.itemId = item.id || item._id;
            favoriteBtn.onclick = () => toggleFavorite(item.id || item._id, favoriteBtn);

            const contactBtn = document.getElementById('itemDetailContactBtn');
            if (APP_STATE.currentUser && APP_STATE.currentUser.id === item.userId) {
                contactBtn.innerHTML = `<i class="fas fa-edit mr-2"></i> Modifier mon annonce`;
                contactBtn.onclick = () => { closeModal('itemDetailModal'); showItemFormModal(item); };
                offerSection.classList.add('hidden');
            } else {
                contactBtn.innerHTML = `<i class="fas fa-comments mr-2"></i> Contacter le vendeur`;
                contactBtn.onclick = () => {
                    if (!APP_STATE.currentUser) { showToast("Connectez-vous pour contacter le vendeur.", 3000, 'info'); showLoginForm(); return; }
                    closeModal('itemDetailModal');
                    startNewOrOpenChat(item.userId, (item.id || item._id), item.title, item.images ? item.images[0] : null);
                };
                if (item.type === 'annonce') offerSection.classList.remove('hidden');
            }

            document.getElementById('submitOfferBtn').onclick = () => {
                const amountInput = document.getElementById('offerAmount');
                const amount = amountInput.value;
                if (amount && parseFloat(amount) > 0) {
                    showToast(`Votre offre de €${amount} a été envoyée (simulation pour l'instant).`, 3000, 'success');
                    amountInput.value = '';
                } else { showToast("Veuillez entrer un montant valide pour l'offre.", 3000, 'error'); }
            };

            document.getElementById('itemDetailGoToBtn').onclick = () => {
                if (item.lat && item.lng) {
                    window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`, '_blank');
                } else {
                    showToast("Coordonnées de destination non disponibles.", 2000, 'error');
                }
            };

            document.getElementById('closeItemDetailModal').onclick = () => closeModal('itemDetailModal');
            openModal('itemDetailModal');
        }

        // --- GESTION DES FAVORIS ---
        async function toggleFavorite(itemId, buttonElement) {
            if (!APP_STATE.currentUser) { showToast("Connectez-vous pour gérer vos favoris.", 3000, 'info'); showLoginForm(); return; }
            const isCurrentlyFavorite = APP_STATE.favorites.includes(itemId);
            const method = isCurrentlyFavorite ? 'DELETE' : 'POST';
            const endpoint = `/favorites/${itemId}`; // L'API devrait gérer l'ID de l'utilisateur via le token
            try {
                await apiFetch(endpoint, { method });
                if (isCurrentlyFavorite) {
                    APP_STATE.favorites = APP_STATE.favorites.filter(id => id !== itemId);
                    if (buttonElement) {
                        buttonElement.innerHTML = '<i class="far fa-heart"></i>';
                        buttonElement.classList.remove('text-pink-500');
                        buttonElement.setAttribute('aria-pressed', 'false');
                        // Animation de "dé-favori"
                        buttonElement.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
                    }
                    showToast("Retiré des favoris.", 2000, 'success');
                } else {
                    APP_STATE.favorites.push(itemId);
                    if (buttonElement) {
                        buttonElement.innerHTML = '<i class="fas fa-heart text-pink-500"></i>';
                        buttonElement.classList.add('text-pink-500');
                        buttonElement.setAttribute('aria-pressed', 'true');
                        // Animation de "favori"
                        buttonElement.animate([{ transform: 'scale(1.3)', color: '#EC4899' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
                    }
                    showToast("Ajouté aux favoris !", 2000, 'success');
                }
                localStorage.setItem(`mapMarketFavorites_${APP_STATE.currentUser.id}`, JSON.stringify(APP_STATE.favorites));
            } catch (error) {
                showToast(error.message || "Erreur lors de la mise à jour des favoris.", 3000, 'error');
            }
        }

        // --- MESSAGERIE INSTANTANÉE (Socket.IO) ---
        function connectWebSocket() {
            if (APP_STATE.socket && APP_STATE.socket.connected) return;

            APP_STATE.socket = io({ query: { token: getToken() } });

            APP_STATE.socket.on('connect', () => {
                console.log('Connecté au serveur WebSocket ID:', APP_STATE.socket.id);
                showToast("Messagerie connectée.", 2000, 'success');
                APP_STATE.threads.forEach(thread => APP_STATE.socket.emit('join', { threadId: thread.id }));
            });

            APP_STATE.socket.on('disconnect', (reason) => {
                console.log('Déconnecté du serveur WebSocket:', reason);
                showToast("Messagerie déconnectée.", 2000, 'error');
            });

            APP_STATE.socket.on('connect_error', (err) => {
                console.error("Erreur de connexion WebSocket:", err.message);
                showToast("Erreur connexion messagerie.", 2000, 'error');
            });

            APP_STATE.socket.on('newMessage', (message) => {
                console.log('Nouveau message reçu via WebSocket:', message);
                if (!APP_STATE.messages[message.threadId]) APP_STATE.messages[message.threadId] = [];
                if (!APP_STATE.messages[message.threadId].find(m => m.id === message.id)) {
                    APP_STATE.messages[message.threadId].push(message);
                }

                const thread = APP_STATE.threads.find(t => t.id === message.threadId);
                if (thread) {
                    thread.lastMessage = message.text; thread.timestamp = message.timestamp;
                    const chatView = document.getElementById('chatView');
                    const currentChatThreadId = chatView.dataset.currentThreadId;
                    if (APP_STATE.currentUser && message.senderId !== APP_STATE.currentUser.id && (chatView.classList.contains('hidden') || currentChatThreadId !== message.threadId)) {
                        thread.unreadCount = (thread.unreadCount || 0) + 1;
                        updateAuthStateUI();
                    }
                } else {
                    loadThreads();
                }
                if (APP_STATE.currentOpenModal?.id === 'messagingModal') {
                    if (!document.getElementById('threadsListView').classList.contains('hidden')) renderThreadsList();
                    else if (!document.getElementById('chatView').classList.contains('hidden') && document.getElementById('chatView').dataset.currentThreadId === message.threadId) {
                        appendMessageToChatView(message);
                        if (APP_STATE.currentUser && message.senderId !== APP_STATE.currentUser.id) markMessagesAsRead(message.threadId);
                    }
                }
                const senderUser = APP_STATE.items.find(u => (u.id || u._id) === message.senderId && u.type === '_user_');
                if (APP_STATE.currentUser && message.senderId !== APP_STATE.currentUser.id) {
                    showToast(`Nouveau message de ${senderUser ? senderUser.username : 'quelqu\'un'}`);
                }
            });

            APP_STATE.socket.on('messageReadUpdate', (data) => {
                console.log('Confirmation de lecture WebSocket:', data);
                const messagesInThread = APP_STATE.messages[data.threadId];
                if (messagesInThread && APP_STATE.currentUser && data.readerId !== APP_STATE.currentUser.id) {
                    (data.messageIds || [data.messageId]).forEach(msgIdToMark => {
                        const msg = messagesInThread.find(m => (m.id || m._id) === msgIdToMark && m.senderId === APP_STATE.currentUser.id);
                        if (msg) msg.isRead = true;
                    });
                    if (APP_STATE.currentOpenModal?.id === 'messagingModal' && !document.getElementById('chatView').classList.contains('hidden') && document.getElementById('chatView').dataset.currentThreadId === data.threadId) {
                        renderChatMessages(data.threadId);
                    }
                }
            });
        }
        function disconnectWebSocket() {
            if (APP_STATE.socket) {
                APP_STATE.socket.disconnect();
                APP_STATE.socket = null;
                console.log("WebSocket déconnecté.");
            }
        }

        async function loadThreads() {
            if (!APP_STATE.currentUser) return;
            try {
                const threads = await apiFetch('/messages/threads');
                APP_STATE.threads = threads.map(t => ({ ...t, id: t._id || t.id })); // Normaliser ID
                updateAuthStateUI();
                if (APP_STATE.currentOpenModal?.id === 'messagingModal' && !document.getElementById('threadsListView').classList.contains('hidden')) {
                    renderThreadsList();
                }
            } catch (error) {
                console.error("Erreur chargement threads:", error);
            }
        }

        async function showMessagingInterface() {
            if (!APP_STATE.currentUser) { showToast("Connectez-vous pour accéder à la messagerie.", 3000, 'info'); showLoginForm(); return; }
            document.getElementById('threadsListView').classList.remove('hidden');
            document.getElementById('chatView').classList.add('hidden');
            document.getElementById('messagingTitle').textContent = "Messagerie";
            await loadThreads();
            renderThreadsList();
            openModal('messagingModal');
        }
        function renderThreadsList() {
            const threadsListContainer = document.getElementById('threadsList');
            threadsListContainer.innerHTML = '';
            const noThreadsText = document.getElementById('noThreadsText');
            const userThreads = APP_STATE.threads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            if (userThreads.length === 0) { noThreadsText.classList.remove('hidden'); return; }
            noThreadsText.classList.add('hidden');

            userThreads.forEach(thread => {
                const displayName = thread.user2Name || "Utilisateur Inconnu";
                const avatar = thread.user2Avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff&size=48`;

                const threadDiv = document.createElement('div');
                threadDiv.className = 'p-4 hover:bg-purple-50 cursor-pointer thread-item flex items-center space-x-4 transition-colors duration-150';
                threadDiv.dataset.threadId = thread.id;
                threadDiv.setAttribute('role', 'button');
                threadDiv.setAttribute('tabindex', '0');
                threadDiv.innerHTML = `
                    <img src="${avatar}" alt="Avatar de ${displayName}" class="w-12 h-12 rounded-full object-cover flex-shrink-0">
                    <div class="flex-grow overflow-hidden">
                        <div class="flex justify-between items-center">
                            <span class="font-semibold text-gray-800 truncate">${displayName}</span>
                            <span class="text-xs text-gray-500">${new Date(thread.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p class="text-sm text-gray-600 truncate">${thread.lastMessage || 'Aucun message.'}</p>
                    </div>
                    ${thread.unreadCount > 0 ? `<span class="ml-auto bg-pink-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full">${thread.unreadCount > 9 ? '9+' : thread.unreadCount}</span>` : ''}
                `;
                threadDiv.addEventListener('click', () => openChatView(thread.id, displayName, avatar));
                threadDiv.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openChatView(thread.id, displayName, avatar); });
                threadsListContainer.appendChild(threadDiv);
            });
        }
        async function openChatView(threadId, otherUserName, avatarUrl = null) {
            document.getElementById('threadsListView').classList.add('hidden');
            const chatViewEl = document.getElementById('chatView');
            chatViewEl.classList.remove('hidden');
            chatViewEl.dataset.currentThreadId = threadId;

            document.getElementById('messagingTitle').textContent = `Chat avec ${otherUserName}`;
            document.getElementById('chatWithUser').textContent = otherUserName;
            document.getElementById('chatWithAvatar').src = avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUserName)}&background=random&color=fff&size=40`;

            if (threadId) {
                APP_STATE.socket.emit('join', { threadId });
                try {
                    const messages = await apiFetch(`/messages/thread/${threadId}`);
                    APP_STATE.messages[threadId] = messages.map(m => ({ ...m, id: m._id || m.id })); // Normaliser ID
                    renderChatMessages(threadId);
                    markMessagesAsRead(threadId);
                } catch (error) {
                    showToast("Impossible de charger les messages.", 3000, 'error');
                }
            } else {
                document.getElementById('chatMessagesContainer').innerHTML = '';
            }
        }
        async function markMessagesAsRead(threadId) {
            const thread = APP_STATE.threads.find(t => t.id === threadId);
            if (thread && thread.unreadCount > 0) {
                const oldUnreadCount = thread.unreadCount;
                thread.unreadCount = 0;
                updateAuthStateUI();
                try {
                    // L'API devrait marquer les messages comme lus pour l'utilisateur actuel
                    await apiFetch(`/messages/thread/${threadId}/read`, { method: 'POST' });
                    APP_STATE.socket.emit('messageRead', { threadId, readerId: APP_STATE.currentUser.id });
                } catch (error) {
                    console.warn("Erreur marquage messages lus serveur:", error);
                    thread.unreadCount = oldUnreadCount;
                    updateAuthStateUI();
                }
            }
            const messagesInThread = APP_STATE.messages[threadId];
            if (messagesInThread) {
                messagesInThread.forEach(msg => {
                    if (APP_STATE.currentUser && msg.receiverId === APP_STATE.currentUser.id && !msg.isRead) {
                        msg.isRead = true;
                    }
                });
            }
            if (APP_STATE.currentOpenModal?.id === 'messagingModal' && !document.getElementById('threadsListView').classList.contains('hidden')) {
                renderThreadsList();
            }
        }
        function renderChatMessages(threadId) {
            const messagesContainer = document.getElementById('chatMessagesContainer');
            messagesContainer.innerHTML = '';
            const messages = APP_STATE.messages[threadId] || [];
            messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(msg => appendMessageToChatView(msg));
        }
        function appendMessageToChatView(message) {
            const messagesContainer = document.getElementById('chatMessagesContainer');
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('chat-bubble', 'mb-2', 'flex', 'flex-col');
            const isSent = APP_STATE.currentUser && message.senderId === APP_STATE.currentUser.id;
            msgDiv.classList.add(isSent ? 'chat-bubble-sent' : 'chat-bubble-received');

            let readReceiptIcon = '';
            if (isSent) {
                readReceiptIcon = message.isRead ? '<i class="fas fa-check-double text-blue-300 text-xs ml-1" aria-label="Lu"></i>' : '<i class="fas fa-check text-gray-300 text-xs ml-1" aria-label="Envoyé"></i>';
            }

            msgDiv.innerHTML = `
                <p class="text-sm">${message.text.replace(/\n/g, '<br>')}</p>
                <div class="text-xs mt-1 self-end ${isSent ? 'opacity-75' : 'text-gray-500'}">
                    ${new Date(message.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    ${isSent ? readReceiptIcon : ''}
                </div>
            `;
            messagesContainer.appendChild(msgDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        document.getElementById('sendMessageForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const messageInput = document.getElementById('messageInput');
            const text = messageInput.value.trim();
            let threadId = document.getElementById('chatView').dataset.currentThreadId;
            let receiverId = document.getElementById('chatView').dataset.prospectiveReceiverId;
            const itemContextId = document.getElementById('chatView').dataset.prospectiveItemContextId;

            if (!threadId && !receiverId) {
                showToast("Destinataire inconnu.", 3000, 'error'); return;
            }

            if (text) {
                messageInput.value = '';
                try {
                    const payload = { text, receiverId, itemContextId };
                    if (threadId && threadId !== "null") payload.threadId = threadId;

                    const savedMessage = await apiFetch('/messages/send', { method: 'POST', body: payload });

                    if (!threadId || threadId === "null") {
                        threadId = savedMessage.threadId;
                        document.getElementById('chatView').dataset.currentThreadId = threadId;
                        document.getElementById('chatView').removeAttribute('data-prospective-receiver-id');
                        document.getElementById('chatView').removeAttribute('data-prospective-item-context-id');
                        await loadThreads();
                    }

                    if (!APP_STATE.messages[threadId]) APP_STATE.messages[threadId] = [];
                    APP_STATE.messages[threadId].push(savedMessage);

                    const threadToUpdate = APP_STATE.threads.find(t => t.id === threadId);
                    if (threadToUpdate) {
                        threadToUpdate.lastMessage = savedMessage.text;
                        threadToUpdate.timestamp = savedMessage.timestamp;
                    }

                    renderChatMessages(threadId);
                } catch (error) {
                    showToast(error.message || "Erreur d'envoi.", 3000, 'error');
                    messageInput.value = text;
                }
            }
        });
        document.getElementById('backToThreadsBtn').addEventListener('click', () => {
            document.getElementById('chatView').classList.add('hidden');
            document.getElementById('chatView').removeAttribute('data-current-thread-id');
            document.getElementById('chatView').removeAttribute('data-prospective-receiver-id');
            document.getElementById('chatView').removeAttribute('data-prospective-item-context-id');
            document.getElementById('threadsListView').classList.remove('hidden');
            document.getElementById('messagingTitle').textContent = "Messagerie";
            renderThreadsList();
        });

        async function startNewOrOpenChat(otherUserId, itemId = null, itemTitle = null, itemImage = null) {
            if (!APP_STATE.currentUser) { showToast("Veuillez vous connecter.", 3000, 'info'); showLoginForm(); return; }
            if (otherUserId === APP_STATE.currentUser.id) { showToast("Vous ne pouvez pas discuter avec vous-même.", 3000, 'info'); return; }

            await loadThreads();

            let existingThread = APP_STATE.threads.find(t =>
                ((t.user1Id === APP_STATE.currentUser.id && t.user2Id === otherUserId) || (t.user1Id === otherUserId && t.user2Id === APP_STATE.currentUser.id)) &&
                (itemId ? t.itemContext?.id === itemId : true)
            );

            const otherUser = APP_STATE.items.find(u => (u.id || u._id) === otherUserId && u.type === '_user_');
            const displayName = otherUser ? otherUser.username : "Utilisateur";
            const avatar = otherUser ? otherUser.avatarUrl : (itemImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&color=fff&size=40`);

            showMessagingInterface();
            if (existingThread) {
                openChatView(existingThread.id, displayName, avatar);
            } else {
                openChatView(null, displayName, avatar);
                document.getElementById('chatView').dataset.prospectiveReceiverId = otherUserId;
                if (itemId) document.getElementById('chatView').dataset.prospectiveItemContextId = itemId;
                document.getElementById('messagingTitle').textContent = `Chat avec ${displayName}`;
                if (itemTitle) {
                    const systemMessage = { id: `sys${Date.now()}`, threadId: null, senderId: '_system_', text: `Vous discutez à propos de "${itemTitle}".`, timestamp: new Date().toISOString(), isRead: true };
                    appendMessageToChatView(systemMessage);
                }
            }
        }


        // --- FILTRES ---
        function populateFilterCategoriesButtons() {
            const container = document.getElementById('filterCategoriesContainer');
            container.innerHTML = `<button type="button" data-category-key="all" class="filter-category-btn col-span-full sm:col-span-1 bg-purple-500 text-white py-2.5 px-3 rounded-lg text-sm font-medium">Tout</button>`;
            Object.keys(CATEGORIES).forEach(key => {
                if (key === 'all' || key === 'alerte') return;
                const cat = CATEGORIES[key];
                const button = document.createElement('button');
                button.type = 'button'; button.dataset.categoryKey = key;
                button.className = 'filter-category-btn bg-gray-100 text-gray-700 py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors';
                button.innerHTML = `<i class="fas ${cat.icon} mr-1.5 text-xs opacity-80"></i> ${cat.name}`;
                container.appendChild(button);
            });
            container.querySelectorAll('.filter-category-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const key = e.currentTarget.dataset.categoryKey;
                    if (key === 'all') {
                        APP_STATE.currentFilters.categories = [];
                        container.querySelectorAll('.filter-category-btn').forEach(b => { b.classList.remove('bg-purple-500', 'text-white'); b.classList.add('bg-gray-100', 'text-gray-700'); });
                        e.currentTarget.classList.add('bg-purple-500', 'text-white'); e.currentTarget.classList.remove('bg-gray-100', 'text-gray-700');
                    } else {
                        container.querySelector('[data-category-key="all"]').classList.remove('bg-purple-500', 'text-white');
                        container.querySelector('[data-category-key="all"]').classList.add('bg-gray-100', 'text-gray-700');
                        const index = APP_STATE.currentFilters.categories.indexOf(key);
                        if (index > -1) APP_STATE.currentFilters.categories.splice(index, 1);
                        else APP_STATE.currentFilters.categories.push(key);
                        e.currentTarget.classList.toggle('bg-purple-500'); e.currentTarget.classList.toggle('text-white');
                        e.currentTarget.classList.toggle('bg-gray-100'); e.currentTarget.classList.toggle('text-gray-700');
                        if (APP_STATE.currentFilters.categories.length === 0) {
                            container.querySelector('[data-category-key="all"]').classList.add('bg-purple-500', 'text-white');
                            container.querySelector('[data-category-key="all"]').classList.remove('bg-gray-100', 'text-gray-700');
                        }
                    }
                });
            });
        }
        function populateFilterStateButtons() {
            const container = document.getElementById('filterStateContainer');
            container.innerHTML = `<button type="button" data-etat-key="all" class="filter-etat-btn bg-purple-500 text-white py-2.5 px-3 rounded-lg text-sm font-medium">Tout état</button>`;
            Object.keys(ETATS).forEach(key => {
                const button = document.createElement('button');
                button.type = 'button'; button.dataset.etatKey = key;
                button.className = 'filter-etat-btn bg-gray-100 text-gray-700 py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors';
                button.textContent = ETATS[key];
                container.appendChild(button);
            });
            container.querySelectorAll('.filter-etat-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const key = e.currentTarget.dataset.etatKey;
                    APP_STATE.currentFilters.etat = key === 'all' ? null : key;
                    container.querySelectorAll('.filter-etat-btn').forEach(b => { b.classList.remove('bg-purple-500', 'text-white'); b.classList.add('bg-gray-100', 'text-gray-700'); });
                    e.currentTarget.classList.add('bg-purple-500', 'text-white'); e.currentTarget.classList.remove('bg-gray-100', 'text-gray-700');
                });
            });
        }
        document.querySelectorAll('#filterDistanceContainer .filter-distance-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                APP_STATE.currentFilters.distance = parseInt(e.currentTarget.dataset.distance);
                document.getElementById('filterDistanceInput').value = APP_STATE.currentFilters.distance;
                document.querySelectorAll('#filterDistanceContainer .filter-distance-btn').forEach(b => { b.classList.remove('bg-purple-500', 'text-white'); b.classList.add('bg-gray-100', 'text-gray-700'); });
                e.currentTarget.classList.add('bg-purple-500', 'text-white'); e.currentTarget.classList.remove('bg-gray-100', 'text-gray-700');
            });
        });

        document.getElementById('applyFiltersBtn').addEventListener('click', () => {
            APP_STATE.currentFilters.searchText = document.getElementById('filterSearchText').value.toLowerCase().trim();
            APP_STATE.currentFilters.priceMin = document.getElementById('filterPriceMin').value ? parseFloat(document.getElementById('filterPriceMin').value) : null;
            APP_STATE.currentFilters.priceMax = document.getElementById('filterPriceMax').value ? parseFloat(document.getElementById('filterPriceMax').value) : null;
            refreshMapMarkers();
            closeModal('filtersModal'); showToast("Filtres appliqués.");
        });
        document.getElementById('resetFiltersBtn').addEventListener('click', () => {
            document.getElementById('filtersForm').reset();
            APP_STATE.currentFilters = { searchText: '', priceMin: null, priceMax: null, distance: 50, categories: [], etat: null };
            document.querySelectorAll('#filterCategoriesContainer .filter-category-btn, #filterStateContainer .filter-etat-btn, #filterDistanceContainer .filter-distance-btn').forEach(btn => {
                btn.classList.remove('bg-purple-500', 'text-white');
                btn.classList.add('bg-gray-100', 'text-gray-700');
            });
            document.querySelector('#filterCategoriesContainer .filter-category-btn[data-category-key="all"]').classList.add('bg-purple-500', 'text-white');
            document.querySelector('#filterStateContainer .filter-etat-btn[data-etat-key="all"]').classList.add('bg-purple-500', 'text-white');
            document.querySelector('#filterDistanceContainer .filter-distance-btn[data-distance="50"]').classList.add('bg-purple-500', 'text-white');
            document.getElementById('filterDistanceInput').value = 50;

            refreshMapMarkers();
            showToast("Filtres réinitialisés.");
        });

        function applyFilters(itemsToFilter) {
            return itemsToFilter.filter(item => {
                if (item.type !== 'annonce' && item.type !== 'alerte') return false;
                const { searchText, priceMin, priceMax, distance, categories, etat } = APP_STATE.currentFilters;

                if (searchText && !(item.title.toLowerCase().includes(searchText) || item.description.toLowerCase().includes(searchText))) return false;

                if (item.type === 'annonce') {
                    if (item.price != null) {
                        if (priceMin !== null && item.price < priceMin) return false;
                        if (priceMax !== null && item.price > priceMax) return false;
                    } else if (priceMin !== null || priceMax !== null) {
                        return false;
                    }
                    if (etat && item.etat !== etat) return false;
                } else {
                    if (item.minPrice != null && priceMax != null && item.minPrice > priceMax) return false;
                    if (item.maxPrice != null && priceMin != null && item.maxPrice < priceMin) return false;
                }

                if (APP_STATE.userLocation && item.lat != null && item.lng != null) {
                    if (haversineDistance(APP_STATE.userLocation, { lat: item.lat, lng: item.lng }) > distance) return false;
                } else if (distance < 100 && APP_STATE.userLocation == null) { }

                if (categories.length > 0 && !categories.includes(item.category)) return false;

                return true;
            });
        }


        // --- PROFIL UTILISATEUR ---
        function showProfileModal() {
            if (!APP_STATE.currentUser) { showLoginForm(); return; }
            document.getElementById('profileUsername').textContent = APP_STATE.currentUser.username;
            document.getElementById('profileEmail').textContent = APP_STATE.currentUser.email;
            document.getElementById('profileView').classList.remove('hidden');
            document.getElementById('editProfileView').classList.add('hidden');
            document.getElementById('userItemsView').classList.add('hidden');
            openModal('profileModal');
        }
        document.getElementById('editProfileBtn').addEventListener('click', () => {
            document.getElementById('profileView').classList.add('hidden');
            document.getElementById('editProfileView').classList.remove('hidden');
            document.getElementById('editUsername').value = APP_STATE.currentUser.username;
            document.getElementById('editEmail').value = APP_STATE.currentUser.email;
            document.getElementById('editPassword').value = '';
        });
        document.getElementById('cancelEditProfileBtn').addEventListener('click', () => {
            document.getElementById('editProfileView').classList.add('hidden');
            document.getElementById('profileView').classList.remove('hidden');
        });
        document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const newUsername = document.getElementById('editUsername').value;
            const newEmail = document.getElementById('editEmail').value;
            const newPassword = document.getElementById('editPassword').value;

            showToast("Fonctionnalité de mise à jour du profil non implémentée avec l'API réelle.", 3000, 'info');
        });
        document.getElementById('myItemsBtn').addEventListener('click', () => showUserItems('annonce', 'Mes Annonces'));
        document.getElementById('myAlertsBtn').addEventListener('click', () => showUserItems('alerte', 'Mes Alertes de Recherche'));
        function showUserItems(type, title) {
            document.getElementById('profileView').classList.add('hidden');
            document.getElementById('editProfileView').classList.add('hidden');
            document.getElementById('userItemsView').classList.remove('hidden');
            document.getElementById('userItemsTitle').textContent = title;
            const listContainer = document.getElementById('userItemsList');
            listContainer.innerHTML = '';

            const userItems = APP_STATE.items.filter(item => item.userId === APP_STATE.currentUser.id && item.type === type);
            if (userItems.length === 0) {
                listContainer.innerHTML = `<p class="text-gray-500 text-center py-4">Vous n'avez aucune ${type === 'annonce' ? 'annonce' : 'alerte'} pour le moment.</p>`;
                return;
            }
            userItems.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'p-3 border border-gray-200 rounded-lg bg-white flex justify-between items-center hover:shadow-md transition-shadow duration-200';
                itemDiv.innerHTML = `
                    <div class="overflow-hidden">
                        <h4 class="font-semibold text-gray-700 truncate" title="${item.title}">${item.title}</h4>
                        <p class="text-xs text-gray-500">${CATEGORIES[item.category]?.name || 'Inconnue'} - ${new Date(item.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div class="flex-shrink-0 space-x-2">
                        <button data-id="${item.id || item._id}" class="edit-user-item-btn text-blue-500 hover:text-blue-700 p-2 rounded-md hover:bg-blue-50 transition-colors" title="Modifier"><i class="fas fa-edit"></i></button>
                        <button data-id="${item.id || item._id}" class="delete-user-item-btn text-red-500 hover:text-red-700 p-2 rounded-md hover:bg-red-50 transition-colors" title="Supprimer"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                listContainer.appendChild(itemDiv);
            });

            listContainer.querySelectorAll('.edit-user-item-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const itemId = e.currentTarget.dataset.id;
                    const itemToEdit = APP_STATE.items.find(i => (i.id || i._id) === itemId);
                    closeModal('profileModal');
                    showItemFormModal(itemToEdit);
                });
            });
            listContainer.querySelectorAll('.delete-user-item-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const itemId = e.currentTarget.dataset.id;
                    const itemToDelete = APP_STATE.items.find(i => (i.id || i._id) === itemId);
                    if (!itemToDelete) return;

                    if (await showConfirmationModal("Êtes-vous sûr de vouloir supprimer cette publication ?")) {
                        try {
                            const endpoint = itemToDelete.type === 'alerte' ? `/alerts/${itemId}` : `/items/${itemId}`;
                            await apiFetch(endpoint, { method: 'DELETE' });
                            await loadItemsAndRefreshMap();
                            showUserItems(type, title);
                            showToast("Publication supprimée.", 2000, 'success');
                        } catch (error) {
                            showToast(error.message || "Erreur suppression.", 3000, 'error');
                        }
                    }
                });
            });
        }
        document.getElementById('backToProfileBtn').addEventListener('click', () => {
            document.getElementById('userItemsView').classList.add('hidden');
            document.getElementById('profileView').classList.remove('hidden');
        });

        async function showConfirmationModal(message) {
            return new Promise((resolve) => {
                const existingModal = document.getElementById('confirmationModal');
                if (existingModal) existingModal.remove();

                const modalHTML = `
                    <div id="confirmationModal" class="modal active fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center p-4 z-[1100]">
                        <div class="modal-content bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
                            <p class="text-gray-700 mb-6 text-base">${message}</p>
                            <div class="flex justify-center space-x-4">
                                <button id="confirmNo" class="btn-secondary px-8 py-2.5">Non</button>
                                <button id="confirmYes" class="btn-primary bg-red-500 hover:bg-red-600 px-8 py-2.5">Oui</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                const confirmationModal = document.getElementById('confirmationModal');
                document.getElementById('confirmYes').onclick = () => { confirmationModal.remove(); resolve(true); };
                document.getElementById('confirmNo').onclick = () => { confirmationModal.remove(); resolve(false); };
                confirmationModal.onclick = (e) => { if (e.target === confirmationModal) { confirmationModal.remove(); resolve(false); } };
            });
        }


        // --- NAVIGATION & INITIALISATION DE L'APPLICATION ---
        function setActiveNav(targetView) {
            document.querySelectorAll('#bottomNav .nav-item').forEach(item => {
                item.classList.remove('active', 'text-purple-500');
                item.classList.add('text-gray-500');
                item.querySelector('.nav-item-icon').classList.replace('fa-solid', 'fa-light') || item.querySelector('.nav-item-icon').classList.replace('fas', 'far'); // Tentative de changer le style d'icône
            });
            const activeBtn = document.querySelector(`#bottomNav .nav-item[data-target-view="${targetView}"]`);
            if (activeBtn) {
                activeBtn.classList.add('active', 'text-purple-500');
                activeBtn.classList.remove('text-gray-500');
                activeBtn.querySelector('.nav-item-icon').classList.replace('fa-light', 'fa-solid') || activeBtn.querySelector('.nav-item-icon').classList.replace('far', 'fas');
            }
            APP_STATE.activeNav = targetView;
        }

        document.querySelectorAll('#bottomNav .nav-item').forEach(item => {
            item.addEventListener('click', (event) => {
                const targetView = event.currentTarget.dataset.targetView;
                setActiveNav(targetView);
                if (APP_STATE.currentOpenModal) closeModal(APP_STATE.currentOpenModal.id);

                if (targetView === 'map') {
                    APP_STATE.map.setView(APP_STATE.userLocation || [48.8566, 2.3522], APP_STATE.map.getZoom());
                }
                else if (targetView === 'filters') {
                    populateFilterCategoriesButtons();
                    populateFilterStateButtons();
                    document.getElementById('filterSearchText').value = APP_STATE.currentFilters.searchText;
                    document.getElementById('filterPriceMin').value = APP_STATE.currentFilters.priceMin || '';
                    document.getElementById('filterPriceMax').value = APP_STATE.currentFilters.priceMax || '';
                    document.querySelectorAll('#filterCategoriesContainer .filter-category-btn').forEach(btn => {
                        const key = btn.dataset.categoryKey;
                        const isActive = (key === 'all' && APP_STATE.currentFilters.categories.length === 0) || APP_STATE.currentFilters.categories.includes(key);
                        btn.classList.toggle('bg-purple-500', isActive); btn.classList.toggle('text-white', isActive);
                        btn.classList.toggle('bg-gray-100', !isActive); btn.classList.toggle('text-gray-700', !isActive);
                    });
                    document.querySelectorAll('#filterStateContainer .filter-etat-btn').forEach(btn => {
                        const key = btn.dataset.etatKey;
                        const isActive = (key === 'all' && !APP_STATE.currentFilters.etat) || APP_STATE.currentFilters.etat === key;
                        btn.classList.toggle('bg-purple-500', isActive); btn.classList.toggle('text-white', isActive);
                        btn.classList.toggle('bg-gray-100', !isActive); btn.classList.toggle('text-gray-700', !isActive);
                    });
                    document.querySelectorAll('#filterDistanceContainer .filter-distance-btn').forEach(btn => {
                        const isActive = parseInt(btn.dataset.distance) === APP_STATE.currentFilters.distance;
                        btn.classList.toggle('bg-purple-500', isActive); btn.classList.toggle('text-white', isActive);
                        btn.classList.toggle('bg-gray-100', !isActive); btn.classList.toggle('text-gray-700', !isActive);
                    });
                    document.getElementById('filterDistanceInput').value = APP_STATE.currentFilters.distance;
                    openModal('filtersModal');
                }
                else if (targetView === 'messages') { showMessagingInterface(); }
                else if (targetView === 'profile') {
                    if (APP_STATE.currentUser) showProfileModal(); else showLoginForm();
                }
            });
        });

        document.getElementById('closeFiltersModal').addEventListener('click', () => closeModal('filtersModal'));
        document.getElementById('closeProfileModalBtn').addEventListener('click', () => closeModal('profileModal'));
        document.getElementById('closeMessagingModalBtn').addEventListener('click', () => closeModal('messagingModal'));
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('notificationBtn').addEventListener('click', () => {
            if (APP_STATE.currentUser) {
                const unreadCount = APP_STATE.threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
                showToast(`Vous avez ${unreadCount} message(s) non lu(s).`);
                if (unreadCount > 0) {
                    setActiveNav('messages');
                    showMessagingInterface();
                }
            } else {
                showToast("Connectez-vous pour voir vos notifications.", 2000, 'info');
            }
        });
        document.getElementById('profileAvatarBtn').addEventListener('click', () => {
            if (APP_STATE.currentUser) { setActiveNav('profile'); showProfileModal(); }
            else { setActiveNav('profile'); showLoginForm(); }
        });

        async function initApp() {
            loadUserFromLocalStorage();
            updateAuthStateUI();
            initMap();

            populateCategorySelect('itemCategory');
            populateStateSelect('itemState');

            if (APP_STATE.currentUser) {
                await loadUserSpecificDataAfterLogin();
                connectWebSocket();
            }

            handleEmailVerification();

            setActiveNav('map');
            console.log("MapMarket App Initialisée (Mode API Réelle)!");
        }

        document.addEventListener('DOMContentLoaded', initApp);

        const inputStyleClasses = ['block', 'w-full', 'px-4', 'py-2.5', 'text-sm', 'text-gray-700', 'bg-white', 'border', 'border-gray-300', 'rounded-lg', 'shadow-sm', 'focus:outline-none', 'focus:ring-2', 'focus:ring-purple-400', 'focus:border-purple-400', 'transition-all', 'duration-150', 'ease-in-out'];
        const btnPrimaryClasses = ['px-6', 'py-2.5', 'text-sm', 'font-semibold', 'text-white', 'bg-purple-600', 'rounded-lg', 'hover:bg-purple-700', 'focus:outline-none', 'focus:ring-2', 'focus:ring-offset-2', 'focus:ring-purple-500', 'transition-all', 'duration-150', 'ease-in-out', 'shadow-md', 'hover:shadow-lg', 'disabled:opacity-60', 'disabled:cursor-not-allowed'];
        const btnSecondaryClasses = ['px-6', 'py-2.5', 'text-sm', 'font-medium', 'text-gray-700', 'bg-gray-100', 'rounded-lg', 'hover:bg-gray-200', 'focus:outline-none', 'focus:ring-2', 'focus:ring-offset-1', 'focus:ring-gray-400', 'transition-colors', 'duration-150', 'ease-in-out', 'border', 'border-gray-300', 'disabled:opacity-60'];

        function applyCommonStyles() {
            document.querySelectorAll('.input-style').forEach(el => el.classList.add(...inputStyleClasses));
            document.querySelectorAll('.btn-primary').forEach(el => el.classList.add(...btnPrimaryClasses));
            document.querySelectorAll('.btn-secondary').forEach(el => el.classList.add(...btnSecondaryClasses));
        }
        document.addEventListener('DOMContentLoaded', applyCommonStyles); 