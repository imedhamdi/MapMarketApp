import { secureFetch, showToast } from './utils.js';

const mainContent = document.getElementById('mainContent');
const navLinks = document.querySelectorAll('#navLinks .nav-link');
let currentPage = '';

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    loadPage(link.dataset.page);
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('mapmarket_auth_token');
  window.location.replace('/index.html');
});

async function loadPage(page) {
  if (currentPage === page) return;
  currentPage = page;
  navLinks.forEach(l => l.classList.toggle('active', l.dataset.page === page));
  mainContent.innerHTML = '<div class="text-center py-5"><div class="spinner-border" role="status"></div></div>';
  if (page === 'dashboard') await loadDashboard();
  if (page === 'users') await loadUsers();
  if (page === 'ads') await loadAds();
}

async function loadDashboard() {
  const res = await secureFetch('/api/admin/stats');
  mainContent.innerHTML = `
    <h3 class="mb-4">Dashboard</h3>
    <div class="d-flex flex-wrap gap-3 mb-4" id="statsCards"></div>
    <canvas id="usersChart" height="120"></canvas>
  `;
  const c = document.getElementById('statsCards');
  c.innerHTML = `
    <div class="card card-stat p-3"><div>Total Utilisateurs</div><h4>${res.data.totalUsers}</h4></div>
    <div class="card card-stat p-3"><div>Total Annonces</div><h4>${res.data.totalAds}</h4></div>
    <div class="card card-stat p-3"><div>Annonces actives</div><h4>${res.data.activeAds}</h4></div>
    <div class="card card-stat p-3"><div>Nouv. utilisateurs 30j</div><h4>${res.data.newUsersLast30Days}</h4></div>
    <div class="card card-stat p-3"><div>Nouv. annonces 30j</div><h4>${res.data.newAdsLast30Days}</h4></div>
  `;
  const trend = await secureFetch('/api/admin/stats/new-users');
  const labels = trend.data.map(d => d.month);
  const counts = trend.data.map(d => d.count);
  new Chart(document.getElementById('usersChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Nouveaux utilisateurs', data: counts, backgroundColor: '#0d6efd' }] },
    options: { responsive: true }
  });
}

async function loadUsers() {
  mainContent.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3>Utilisateurs</h3>
      <input type="search" id="userSearch" class="form-control w-auto" placeholder="Recherche">
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Créé le</th><th>Actions</th></tr></thead>
        <tbody id="usersBody"></tbody>
      </table>
    </div>`;
  document.getElementById('userSearch').addEventListener('input', debounce(updateUsers, 400));
  await updateUsers();
}

async function updateUsers() {
  const term = document.getElementById('userSearch').value.trim();
  const res = await secureFetch(`/api/admin/users?search=${encodeURIComponent(term)}`, {}, false);
  const body = document.getElementById('usersBody');
  body.innerHTML = res.data.users.map(u => `
    <tr data-id="${u._id}">
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td>${new Date(u.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-sm btn-danger btn-delete-user">Supprimer</button>
        <button class="btn btn-sm ${u.isBanned ? 'btn-success btn-unban-user' : 'btn-warning btn-ban-user'}">${u.isBanned ? 'Débannir' : 'Bannir'}</button>
      </td>
    </tr>`).join('');
}

mainContent.addEventListener('click', async e => {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.classList.contains('btn-delete-user')) {
    confirmAction('Supprimer cet utilisateur ?', async () => {
      await secureFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      showToast('Utilisateur supprimé', 'success');
      updateUsers();
    });
  }
  if (e.target.classList.contains('btn-ban-user')) {
    await secureFetch(`/api/admin/users/${id}/ban`, { method: 'POST' });
    showToast('Utilisateur banni', 'success');
    updateUsers();
  }
  if (e.target.classList.contains('btn-unban-user')) {
    await secureFetch(`/api/admin/users/${id}/unban`, { method: 'POST' });
    showToast('Utilisateur débanni', 'success');
    updateUsers();
  }
});

async function loadAds() {
  mainContent.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3>Annonces</h3>
      <input type="search" id="adSearch" class="form-control w-auto" placeholder="Recherche">
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Titre</th><th>Auteur</th><th>Catégorie</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="adsBody"></tbody>
      </table>
    </div>`;
  document.getElementById('adSearch').addEventListener('input', debounce(updateAds, 400));
  await updateAds();
}

async function updateAds() {
  const term = document.getElementById('adSearch').value.trim();
  const res = await secureFetch(`/api/admin/ads?title[regex]=${encodeURIComponent(term)}`, {}, false);
  const body = document.getElementById('adsBody');
  body.innerHTML = res.data.ads.map(ad => `
    <tr data-id="${ad._id}">
      <td>${ad.title}</td>
      <td>${ad.userId ? ad.userId.name : ''}</td>
      <td>${ad.category}</td>
      <td>${ad.status}</td>
      <td><button class="btn btn-sm btn-danger btn-delete-ad">Supprimer</button></td>
    </tr>`).join('');
}

mainContent.addEventListener('click', async e => {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.classList.contains('btn-delete-ad')) {
    confirmAction('Supprimer cette annonce ?', async () => {
      await secureFetch(`/api/admin/ads/${id}`, { method: 'DELETE' });
      showToast('Annonce supprimée', 'success');
      updateAds();
    });
  }
});

function confirmAction(text, action) {
  const modalEl = document.getElementById('confirmModal');
  document.getElementById('confirmText').textContent = text;
  const modal = new bootstrap.Modal(modalEl);
  const btn = document.getElementById('confirmBtn');
  const handler = async () => {
    modal.hide();
    btn.removeEventListener('click', handler);
    await action();
  };
  btn.addEventListener('click', handler);
  modal.show();
}

function debounce(fn, delay) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

loadPage('dashboard');
