document.addEventListener('DOMContentLoaded', () => {
    // ── Elementos comunes ────────────────────────────────────────────────────
    const loadingEl      = document.getElementById('loading');
    const loadingText    = document.getElementById('loadingText');
    const errorEl        = document.getElementById('error');
    const resultsBody    = document.getElementById('resultsTableBody');
    const thPrecio       = document.getElementById('thPrecio');
    const sortIndicator  = document.getElementById('sortIndicator');

    // ── Elementos modo búsqueda ──────────────────────────────────────────────
    const searchInput    = document.getElementById('searchInput');
    const searchBtn      = document.getElementById('searchBtn');
    const priceFilterEl  = document.getElementById('price-filter');
    const minPriceInput  = document.getElementById('minPrice');
    const maxPriceInput  = document.getElementById('maxPrice');
    const filterCountEl  = document.getElementById('filterCount');

    // ── Elementos modo vendedor ──────────────────────────────────────────────
    const sellerUrlInput = document.getElementById('sellerUrlInput');
    const loadSellerBtn  = document.getElementById('loadSellerBtn');
    const sellerPanel    = document.getElementById('seller-panel');
    const sellerNameEl   = document.getElementById('sellerName');
    const sellerMetaEl   = document.getElementById('sellerMeta');
    const categoryList   = document.getElementById('categoryList');
    const sortSelect     = document.getElementById('sortSelect');
    const paginationEl   = document.getElementById('pagination');
    const prevPageBtn    = document.getElementById('prevPage');
    const nextPageBtn    = document.getElementById('nextPage');
    const pageInfoEl     = document.getElementById('pageInfo');

    // ── Encabezados de tabla que cambian según modo ──────────────────────────
    const thCol4 = document.getElementById('thCol4');
    const thCol6 = document.getElementById('thCol6');
    const thCol7 = document.getElementById('thCol7');

    // ── Estado global ────────────────────────────────────────────────────────
    let currentMode = 'search';   // 'search' | 'seller'
    let allResults  = [];
    let sortOrder   = null;

    // Estado modo vendedor
    let seller = {
        listingUrl:    '',
        activeCatUrl:  '',
        activeCatName: 'Todos los productos',
        total:         0,
        offset:        0,
        perPage:       48,
        sort:          'SELLER_RANKING',
    };

    // ── Tabs ─────────────────────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab === currentMode) return;
            currentMode = tab;

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
            document.getElementById(`tab-${tab}`).classList.remove('hidden');

            clearResults();
            if (tab === 'search') {
                setSearchHeaders();
                paginationEl.classList.add('hidden');
                sellerPanel.classList.add('hidden');
            } else {
                setSellerHeaders();
            }
        });
    });

    // ── Headers de tabla ─────────────────────────────────────────────────────
    function setSearchHeaders() {
        thCol4.textContent = 'Financiación';
        thCol6.textContent = 'Vendedor';
        thCol7.textContent = 'Stock / Destacado';
        thPrecio.classList.add('sortable');
    }

    function setSellerHeaders() {
        thCol4.textContent = 'Descuento';
        thCol6.textContent = '';
        thCol7.textContent = 'Destacado';
        thPrecio.classList.add('sortable');
    }

    // ── Modo búsqueda ────────────────────────────────────────────────────────
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') performSearch(); });
    minPriceInput.addEventListener('input', applyFiltersAndRender);
    maxPriceInput.addEventListener('input', applyFiltersAndRender);

    thPrecio.addEventListener('click', () => {
        if (currentMode === 'search' && allResults.length === 0) return;
        if (currentMode === 'seller' && allResults.length === 0) return;
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
        sortIndicator.textContent = sortOrder === 'asc' ? '↑' : '↓';
        if (currentMode === 'search') applyFiltersAndRender();
        else renderSellerResults(sortedResults(allResults));
    });

    function getFilteredResults() {
        const min = parseFloat(minPriceInput.value) || 0;
        const max = parseFloat(maxPriceInput.value) || Infinity;
        return allResults.filter(item => {
            const p = parsePrice(item.price);
            return p >= min && p <= max;
        });
    }

    function applyFiltersAndRender() {
        let filtered = getFilteredResults();
        if (sortOrder) {
            filtered = [...filtered].sort((a, b) => {
                const pa = parsePrice(a.price), pb = parsePrice(b.price);
                return sortOrder === 'asc' ? pa - pb : pb - pa;
            });
        }
        const total = allResults.length;
        const shown = filtered.length;
        filterCountEl.textContent = shown < total
            ? `Mostrando ${shown} de ${total} resultados`
            : `${total} resultados`;
        renderSearchResults(filtered);
    }

    async function performSearch() {
        const keyword = searchInput.value.trim();
        if (!keyword) return;

        clearResults();
        showLoading('Buscando...');
        priceFilterEl.classList.add('hidden');
        allResults = [];
        sortOrder = null;
        sortIndicator.textContent = '';

        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
            const data = await res.json();
            hideLoading();

            if (!res.ok) { showError(data.error || 'Error al obtener los datos.'); return; }
            if (!data.results?.length) { showError('No se encontraron resultados.'); return; }

            allResults = data.results;
            minPriceInput.value = '';
            maxPriceInput.value = '';
            priceFilterEl.classList.remove('hidden');
            applyFiltersAndRender();
        } catch {
            hideLoading();
            showError('Error al conectar con el servidor.');
        }
    }

    // ── Modo vendedor ────────────────────────────────────────────────────────
    loadSellerBtn.addEventListener('click', loadSeller);
    sellerUrlInput.addEventListener('keypress', e => { if (e.key === 'Enter') loadSeller(); });

    sortSelect.addEventListener('change', () => {
        seller.sort = sortSelect.value;
        seller.offset = 0;
        loadSellerPage();
    });

    prevPageBtn.addEventListener('click', () => {
        if (seller.offset === 0) return;
        seller.offset = Math.max(0, seller.offset - seller.perPage);
        loadSellerPage();
    });

    nextPageBtn.addEventListener('click', () => {
        seller.offset += seller.perPage;
        loadSellerPage();
    });

    async function loadSeller() {
        const url = sellerUrlInput.value.trim();
        if (!url) return;

        clearResults();
        sellerPanel.classList.add('hidden');
        paginationEl.classList.add('hidden');
        showLoading('Cargando catálogo del vendedor...');
        setSellerHeaders();

        try {
            const res = await fetch(`/api/seller/categories?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            hideLoading();

            if (!res.ok) { showError(data.error || 'Error al cargar el vendedor.'); return; }

            seller.listingUrl   = data.listingUrl;
            seller.total        = data.total;
            seller.offset       = 0;
            seller.activeCatUrl = '';
            seller.activeCatName = 'Todos los productos';
            seller.sort         = sortSelect.value;

            sellerNameEl.textContent = data.slug.toUpperCase().replace(/-/g, ' ');
            sellerMetaEl.textContent = `${data.total} productos en total`;

            renderCategoryList(data.categories);
            sellerPanel.classList.remove('hidden');

            // Marcar "Todos" como activo
            document.querySelectorAll('.category-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.url === '');
            });

            loadSellerPage();
        } catch {
            hideLoading();
            showError('Error al conectar con el servidor.');
        }
    }

    function renderCategoryList(categories) {
        categoryList.innerHTML = '';
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'category-btn';
            btn.dataset.url = cat.url;
            btn.dataset.name = cat.name;
            btn.innerHTML = `${cat.name}${cat.count != null ? ` <span class="cat-count">${cat.count}</span>` : ''}`;
            btn.addEventListener('click', () => {
                seller.activeCatUrl  = cat.url;
                seller.activeCatName = cat.name;
                seller.offset = 0;
                document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadSellerPage();
            });
            categoryList.appendChild(btn);
        });

        // "Todos" button listener
        document.querySelector('.category-btn[data-url=""]').addEventListener('click', function() {
            seller.activeCatUrl  = '';
            seller.activeCatName = 'Todos los productos';
            seller.offset = 0;
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadSellerPage();
        });
    }

    async function loadSellerPage() {
        clearResults();
        showLoading('Cargando productos...');

        const listingUrl = seller.activeCatUrl || seller.listingUrl;

        try {
            const params = new URLSearchParams({
                url:    listingUrl,
                offset: seller.offset,
                sort:   seller.sort,
            });
            const res  = await fetch(`/api/seller/products?${params}`);
            const data = await res.json();
            hideLoading();

            if (!res.ok) { showError(data.error || 'Error al cargar productos.'); return; }

            if (data.redirected || !data.products?.length) {
                showError('No se encontraron productos para esta selección.');
                paginationEl.classList.add('hidden');
                return;
            }

            allResults = data.products;
            sortOrder = null;
            sortIndicator.textContent = '';

            updatePagination(data.total, data.offset, data.perPage);
            renderSellerResults(allResults);
        } catch {
            hideLoading();
            showError('Error al conectar con el servidor.');
        }
    }

    function updatePagination(total, offset, perPage) {
        const currentPage = Math.floor(offset / perPage) + 1;
        const totalPages  = Math.ceil(total / perPage);

        if (totalPages <= 1) {
            paginationEl.classList.add('hidden');
            return;
        }

        paginationEl.classList.remove('hidden');
        pageInfoEl.textContent = `Pág. ${currentPage} de ${totalPages}  (${total} productos)`;
        prevPageBtn.disabled = offset === 0;
        nextPageBtn.disabled = offset + perPage >= total;

        seller.offset  = offset;
        seller.perPage = perPage;
    }

    // ── Renderizado ──────────────────────────────────────────────────────────
    function renderSearchResults(results) {
        resultsBody.innerHTML = '';
        results.forEach(item => {
            const tr = document.createElement('tr');

            const imgHtml = item.image
                ? `<img src="${item.image}" alt="" loading="lazy" class="thumb">`
                : '<div class="no-img">Sin imagen</div>';

            const origHtml = item.originalPrice
                ? `<div class="original-price">${item.originalPrice}</div>`
                : '';

            let sellerHtml = '-';
            if (item.seller === 'Publicidad') {
                sellerHtml = '<span class="seller-ad">Publicidad</span>';
            } else if (item.seller) {
                const badge = item.isTiendaOficial
                    ? ' <span class="seller-oficial-badge">Tienda Oficial</span>'
                    : '';
                sellerHtml = escapeHtml(item.seller) + badge;
            }

            const stockHtml = item.stock
                ? `<span class="stock-badge">${escapeHtml(item.stock)}</span>`
                : '-';

            tr.innerHTML = `
                <td class="col-thumb">${imgHtml}</td>
                <td class="col-product"><a href="${item.link}" target="_blank" class="product-link">${escapeHtml(item.title)}</a></td>
                <td class="col-price">${origHtml}<div class="current-price">${item.price || '-'}</div></td>
                <td class="col-installments">${escapeHtml(item.installments || '-')}</td>
                <td class="col-shipping">${item.shippingStatus ? `<span class="shipping-badge">${escapeHtml(item.shippingStatus)}</span>` : '-'}</td>
                <td class="col-seller">${sellerHtml}</td>
                <td class="col-stock">${stockHtml}</td>
            `;
            resultsBody.appendChild(tr);
        });
    }

    function sortedResults(arr) {
        if (!sortOrder) return arr;
        return [...arr].sort((a, b) => {
            const pa = parsePrice(a.price), pb = parsePrice(b.price);
            return sortOrder === 'asc' ? pa - pb : pb - pa;
        });
    }

    function renderSellerResults(results) {
        resultsBody.innerHTML = '';
        results.forEach(item => {
            const tr = document.createElement('tr');

            const imgHtml = item.image
                ? `<img src="${item.image}" alt="" loading="lazy" class="thumb">`
                : '<div class="no-img">Sin imagen</div>';

            const origHtml = item.originalPrice
                ? `<div class="original-price">${item.originalPrice}</div>`
                : '';

            const discountHtml = item.discount
                ? `<span class="discount-badge">${escapeHtml(item.discount)}</span>`
                : '-';

            const bestSellerHtml = item.isBestSeller
                ? '<span class="best-seller-badge">MÁS VENDIDO</span>'
                : '-';

            tr.innerHTML = `
                <td class="col-thumb">${imgHtml}</td>
                <td class="col-product"><a href="${item.link}" target="_blank" class="product-link">${escapeHtml(item.title)}</a></td>
                <td class="col-price">${origHtml}<div class="current-price">${item.price || '-'}</div></td>
                <td class="col-installments">${discountHtml}</td>
                <td class="col-shipping">${item.shippingStatus ? `<span class="shipping-badge">${escapeHtml(item.shippingStatus)}</span>` : '-'}</td>
                <td class="col-seller">-</td>
                <td class="col-stock">${bestSellerHtml}</td>
            `;
            resultsBody.appendChild(tr);
        });
    }

    // ── Utilidades ───────────────────────────────────────────────────────────
    function clearResults() {
        resultsBody.innerHTML = '';
        errorEl.classList.add('hidden');
    }

    function showLoading(msg) {
        loadingText.textContent = msg || 'Cargando...';
        loadingEl.classList.remove('hidden');
    }

    function hideLoading() {
        loadingEl.classList.add('hidden');
    }

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    }

    function parsePrice(priceStr) {
        if (!priceStr) return 0;
        return parseFloat(priceStr.replace('$', '').trim().replace(/\./g, '').replace(',', '.')) || 0;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
});
