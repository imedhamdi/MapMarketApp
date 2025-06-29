import { secureFetch } from './utils.js';

const token = localStorage.getItem('mapmarket_auth_token');
if (!token) {
    window.location.replace('/index.html');
}

const mainContent = document.getElementById('admin-main-content');
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
    const res = await secureFetch('/api/admin/users');
    const users = res.data.users;

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
                <tbody>
                    ${users.map(u => `
                        <tr data-id="${u._id}">
                            <td>${u.name}</td>
                            <td>${u.email}</td>
                            <td>${u.role}</td>
                            <td>${u.isActive ? 'Oui' : 'Non'}</td>
                            <td class="table-actions">
                                <button class="btn-delete">Supprimer</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function renderAds() {
    const res = await secureFetch('/api/admin/ads');
    const ads = res.data.ads;

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
                <tbody>
                    ${ads.map(ad => `
                        <tr data-id="${ad._id}">
                            <td>${ad.title}</td>
                            <td>${ad.userId ? ad.userId.name : 'N/A'}</td>
                            <td>${ad.price} €</td>
                            <td>${ad.category}</td>
                            <td class="table-actions">
                                <button class="btn-delete">Supprimer</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
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
