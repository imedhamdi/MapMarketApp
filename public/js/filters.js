const FiltersModule = (() => {
    // --- 1. Catégories disponibles ---
    const categories = [
        { id: 'toutes', label: 'Toutes', iconClass: 'fa-solid fa-border-all' },
        { id: 'immobilier', label: 'Immobilier', iconClass: 'fa-solid fa-house-chimney' },
        { id: 'vehicules', label: 'Véhicules', iconClass: 'fa-solid fa-car' },
        { id: 'electronique', label: 'Électronique', iconClass: 'fa-solid fa-mobile-screen-button' },
        { id: 'mode', label: 'Mode & Accessoires', iconClass: 'fa-solid fa-shirt' },
        { id: 'maison', label: 'Maison & Jardin', iconClass: 'fa-solid fa-couch' },
        { id: 'loisirs', label: 'Loisirs & Divertissement', iconClass: 'fa-solid fa-puzzle-piece' },
        { id: 'services', label: 'Services', iconClass: 'fa-solid fa-handshake-angle' },
        { id: 'autres', label: 'Autres', iconClass: 'fa-solid fa-ellipsis' }
    ];

    // --- 2. État interne des filtres ---
    let state = {
        keywords: '',
        category: 'toutes',
        priceMin: '',
        priceMax: '',
        radius: 25,
        sortBy: 'createdAt_desc'
    };

    // --- 3. Cache des éléments du DOM ---
    const DOM = {};

    // --- 4. Fonction de debounce ---
    const debounce = (func, delay) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(null, args), delay);
        };
    };

    // --- 5. Fonctions internes ---
    const updateFilterState = (key, value) => {
        state[key] = value;
    };

    const renderCategoryPills = () => {
        if (!DOM.categoryPills) return;
        DOM.categoryPills.innerHTML = '';
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'category-pill';
            btn.dataset.categoryId = cat.id;
            btn.innerHTML = `<i class="${cat.iconClass}"></i> ${cat.label}`;
            if (cat.id === state.category) btn.classList.add('active');
            DOM.categoryPills.appendChild(btn);
        });
    };

    const handleCategoryClick = (e) => {
        const target = e.target.closest('.category-pill');
        if (!target) return;
        updateFilterState('category', target.dataset.categoryId);
        renderCategoryPills();
    };

    const updateRadiusDisplay = () => {
        if (DOM.radiusDisplay && DOM.radiusSlider) {
            DOM.radiusDisplay.textContent = `${DOM.radiusSlider.value}km`;
        }
    };

    const handleRadiusChange = debounce(() => {
        if (DOM.radiusSlider) {
            updateFilterState('radius', parseInt(DOM.radiusSlider.value, 10));
            updateRadiusDisplay();
        }
    }, 300);

    const applyFilters = () => {
        if (DOM.keywords) updateFilterState('keywords', DOM.keywords.value.trim());
        if (DOM.priceMin) updateFilterState('priceMin', DOM.priceMin.value.trim());
        if (DOM.priceMax) updateFilterState('priceMax', DOM.priceMax.value.trim());
        if (DOM.sortBy) updateFilterState('sortBy', DOM.sortBy.value);

        if (window.Ads && typeof window.Ads.refresh === 'function') {
            window.Ads.refresh(getFilters());
        }

        document.dispatchEvent(new CustomEvent('mapmarket:closeModal', {
            detail: { modalId: 'filters-modal' }
        }));
    };

    const resetFilters = () => {
        state = {
            keywords: '',
            category: 'toutes',
            priceMin: '',
            priceMax: '',
            radius: 25,
            sortBy: 'createdAt_desc'
        };
        if (DOM.form) DOM.form.reset();
        if (DOM.radiusSlider) DOM.radiusSlider.value = state.radius;
        updateRadiusDisplay();
        renderCategoryPills();
    };

    const bindEvents = () => {
        if (!DOM.form) return;
        DOM.form.addEventListener('submit', (e) => {
            e.preventDefault();
            applyFilters();
        });
        DOM.form.addEventListener('reset', resetFilters);
        if (DOM.radiusSlider) DOM.radiusSlider.addEventListener('input', handleRadiusChange);
        if (DOM.categoryPills) DOM.categoryPills.addEventListener('click', handleCategoryClick);
    };

    // --- 8. Fonction d'initialisation publique ---
    const init = () => {
        DOM.modal = document.getElementById('filters-modal');
        DOM.form = document.getElementById('filters-form');
        if (!DOM.form) {
            console.error('Filters: éléments du formulaire manquants.');
            return;
        }
        DOM.keywords = document.getElementById('filter-keywords');
        DOM.priceMin = document.getElementById('filter-price-min');
        DOM.priceMax = document.getElementById('filter-price-max');
        DOM.radiusSlider = document.getElementById('filter-distance');
        DOM.radiusDisplay = document.getElementById('filter-distance-value-display');
        DOM.sortBy = document.getElementById('filter-sort-by');
        DOM.categoryPills = document.getElementById('filter-category-pills');

        renderCategoryPills();
        updateRadiusDisplay();
        bindEvents();
    };

    const getFilters = () => ({ ...state });

    return { init, getFilters };
})();

export const init = FiltersModule.init;
export const getFilters = FiltersModule.getFilters;
