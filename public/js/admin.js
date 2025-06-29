import { secureFetch, debounce } from './utils.js';

const token = localStorage.getItem('mapmarket_auth_token');
if (!token) {
    window.location.replace('/index.html');
}

const mainContent = document.getElementById('admin-main-content');
const filterContainer = document.getElementById('admin-filters');
const navLinks = document.querySelectorAll('.nav-link');

const routes = {
    '#dashboard': renderDashboard,
    '#users': renderUsers,
    '#ads': renderAds,
    '#categories': () => { mainContent.innerHTML = '<h1>Catégories</h1><p>Section en construction.</p>'; },
    '#settings': () => { mainContent.innerHTML = '<h1>Paramètres</h1><p>Section en construction.</p>'; }
};

async function router() {
    const hash = window.location.hash || '#dashboard';
    const handler = routes[hash];

    navLinks.forEach(link => {
        if (link.getAttribute('href') === hash) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    if (handler) {
        try {
            mainContent.innerHTML = '<p>Chargement...</p>';
            await handler();
        } catch (err) {
            console.error(err);
            if (err.status === 403) {
                mainContent.innerHTML = '<h1>Accès refusé</h1>';
            } else {
                mainContent.innerHTML = '<h1>Erreur</h1>';
            }
        }
    }
}

async function renderDashboard() {
    const res = await secureFetch('/api/admin/stats');
    const { totalUsers, totalAds, recentUsers, recentAds } = res.data;

    mainContent.innerHTML = `
        <h1 class="content-header">Dashboard</h1>
        <div class="dashboard-grid">
            <div class="widget">
                <h2 class="widget-title">Utilisateurs</h2>
                <p class="widget-value">${totalUsers}</p>
            </div>
            <div class="widget">
                <h2 class="widget-title">Annonces</h2>
                <p class="widget-value">${totalAds}</p>
            </div>
        </div>
        <div class="dashboard-grid" style="margin-top: 2rem;">
            <div class="table-container">
                <h2>Derniers Utilisateurs</h2>
                <ul style="list-style: none; padding: 0;">
                    ${recentUsers.map(u => `<li>${u.name} - ${u.email}</li>`).join('')}
                </ul>
            </div>
            <div class="table-container">
                <h2>Dernières Annonces</h2>
                <ul style="list-style: none; padding: 0;">
                    ${recentAds.map(a => `<li>${a.title} (par ${a.userId ? a.userId.name : 'N/A'})</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
}

async function renderUsers() {
    filterContainer.innerHTML = `
        <div class="filter-bar">
            <div class="search-wrapper">
                <i class="fa-solid fa-search search-input-icon"></i>
                <input type="text" id="user-search" placeholder="Recherche nom/email">
            </div>
            <select id="role-filter">
                <option value="">Tous les rôles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
            </select>
        </div>`;

    mainContent.innerHTML = `
        <h1 class="content-header">Gestion des Utilisateurs</h1>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Nom</th>
                        <th>Email</th>
                        <th>Rôle</th>
                        <th>Actif</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="users-tbody">
                    <tr><td colspan="5"><div class="spinner"></div></td></tr>
                </tbody>
            </table>
        </div>`;

    await updateUsers();
    setupEventListeners('users');
}

async function renderAds() {
    filterContainer.innerHTML = `
        <div class="filter-bar">
            <div class="search-wrapper">
                <i class="fa-solid fa-search search-input-icon"></i>
                <input type="text" id="ad-search" placeholder="Recherche titre">
            </div>
            <select id="category-filter">
                <option value="">Toutes catégories</option>
                <option value="Auto">Auto</option>
                <option value="Immobilier">Immobilier</option>
                <option value="Services">Services</option>
                <option value="Informatique">Informatique</option>
            </select>
        </div>`;

    mainContent.innerHTML = `
        <h1 class="content-header">Gestion des Annonces</h1>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Titre</th>
                        <th>Utilisateur</th>
                        <th>Prix</th>
                        <th>Catégorie</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="ads-tbody">
                    <tr><td colspan="5"><div class="spinner"></div></td></tr>
                </tbody>
            </table>
        </div>`;

    await updateAds();
    setupEventListeners('ads');
}

async function updateUsers() {
    const search = document.getElementById('user-search').value.trim();
    const role = document.getElementById('role-filter').value;
    const params = [];
    if (search) {
        params.push(`name[regex]=${encodeURIComponent(search)}`);
        params.push(`email[regex]=${encodeURIComponent(search)}`);
    }
    if (role) params.push(`role=${encodeURIComponent(role)}`);
    const query = params.length ? `?${params.join('&')}` : '';
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = `<tr><td colspan="5"><div class="spinner"></div></td></tr>`;
    const res = await secureFetch(`/api/admin/users${query}`, {}, false);
    const users = res.data.users;
    tbody.innerHTML = users.map(u => `
        <tr data-id="${u._id}">
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td>${u.role}</td>
            <td>${u.isActive ? 'Oui' : 'Non'}</td>
            <td class="table-actions">
                <button class="btn-delete"><i class="fa-solid fa-trash"></i> Supprimer</button>
            </td>
        </tr>
    `).join('');
}

async function updateAds() {
    const search = document.getElementById('ad-search').value.trim();
    const category = document.getElementById('category-filter').value;
    const params = [];
    if (search) params.push(`title[regex]=${encodeURIComponent(search)}`);
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    const query = params.length ? `?${params.join('&')}` : '';
    const tbody = document.getElementById('ads-tbody');
    tbody.innerHTML = `<tr><td colspan="5"><div class="spinner"></div></td></tr>`;
    const res = await secureFetch(`/api/admin/ads${query}`, {}, false);
    const ads = res.data.ads;
    tbody.innerHTML = ads.map(ad => `
        <tr data-id="${ad._id}">
            <td>${ad.title}</td>
            <td>${ad.userId ? ad.userId.name : 'N/A'}</td>
            <td>${ad.price} €</td>
            <td>${ad.category}</td>
            <td class="table-actions">
                <button class="btn-delete"><i class="fa-solid fa-trash"></i> Supprimer</button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners(type) {
    if (type === 'users') {
        const debounced = debounce(updateUsers, 350);
        document.getElementById('user-search').addEventListener('input', debounced);
        document.getElementById('role-filter').addEventListener('change', updateUsers);
    } else if (type === 'ads') {
        const debounced = debounce(updateAds, 350);
        document.getElementById('ad-search').addEventListener('input', debounced);
        document.getElementById('category-filter').addEventListener('change', updateAds);
    }
}

window.addEventListener('hashchange', router);
window.addEventListener('load', router);

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('mapmarket_auth_token');
    window.location.replace('/index.html');
});

const modal = document.getElementById('confirmation-modal');
const confirmBtn = document.getElementById('confirm-action-btn');
const cancelBtn = document.getElementById('cancel-action-btn');
let actionToConfirm = null;

function showConfirmationModal(text, onConfirm) {
    document.getElementById('modal-text').textContent = text;
    modal.classList.replace('modal-hidden', 'modal-visible');
    actionToConfirm = onConfirm;
}

confirmBtn.addEventListener('click', () => {
    if (actionToConfirm) actionToConfirm();
    modal.classList.replace('modal-visible', 'modal-hidden');
});

cancelBtn.addEventListener('click', () => {
    modal.classList.replace('modal-visible', 'modal-hidden');
});

mainContent.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-delete')) {
        const row = e.target.closest('tr');
        const id = row.dataset.id;
        const route = window.location.hash;

        if (route === '#users') {
            showConfirmationModal('Supprimer cet utilisateur ?', async () => {
                await secureFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
                renderUsers();
            });
        } else if (route === '#ads') {
            showConfirmationModal('Supprimer cette annonce ?', async () => {
                await secureFetch(`/api/admin/ads/${id}`, { method: 'DELETE' });
                renderAds();
            });
        }
    }
});
