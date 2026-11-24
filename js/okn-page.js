/**
 * === ЯРОСЛАВИЯ: РЕЕСТР И КАРТА ОБЪЕКТОВ КУЛЬТУРНОГО НАСЛЕДИЯ (okn-page.js) ===
 * Интерактивная карта, аналитические дашборды и фильтрация по 2 484 объектам ОКН.
 */

(function () {
    const PAGE_SIZE = 24;
    const YAROSLAVL_CENTER = [57.85, 39.15];
    const DEFAULT_ZOOM = 8;

    let allRecords = [];
    let filteredRecords = [];
    let currentPage = 1;
    let activeRecordId = null;

    let oknMap = null;
    let mapCanvasRenderer = null;
    let markersLayer = null;
    let markerById = new Map();

    const filterState = {
        search: '',
        category: 'all',
        objectType: 'all',
        typology: 'all',
        municipality: 'all',
        era: 'all',
        onlyWithCoords: false,
        onlyUnesco: false,
        onlyWwii: false,
        sortBy: 'default'
    };

    function formatNumber(n) {
        return Number(n || 0).toLocaleString('ru-RU');
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getCategoryColor(category) {
        if (category === 'Федерального значения') {
            return { fill: '#c8a415', stroke: '#7a6108', className: 'federal', shortLabel: 'Федерального значения' };
        }
        if (category === 'Регионального значения') {
            return { fill: '#2d6a4f', stroke: '#1b4332', className: 'regional', shortLabel: 'Регионального значения' };
        }
        return { fill: '#4c6ef5', stroke: '#2b44a8', className: 'local', shortLabel: 'Местного значения' };
    }

    async function initOknPage() {
        const loadingOverlay = document.getElementById('okn-loading-overlay');
        try {
            const [oknRes, borderRes] = await Promise.all([
                fetch('data/okn_list.json'),
                fetch('data/oblast-border.json')
            ]);

            if (!oknRes.ok) {
                throw new Error('Не удалось загрузить список ОКН (HTTP ' + oknRes.status + ')');
            }

            const rawOknList = await oknRes.json();
            const borderGeoJson = borderRes.ok ? await borderRes.json() : null;

            allRecords = rawOknList.map((raw, index) => window.OknLogic.normalizeOknRecord(raw, index));

            initLeafletOknMap(borderGeoJson);
            populateFilterSelects(allRecords);
            bindFilterControls();
            bindModalControls();
            applyFiltersAndRender({ fitMap: false });

            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
        } catch (err) {
            console.error('Ошибка инициализации раздела ОКН:', err);
            if (loadingOverlay) {
                const iconHtml = typeof renderIcon === 'function' ? renderIcon('warning', 'ui-icon-lg icon-red') : '';
                loadingOverlay.innerHTML =
                    '<div class="loading-error-card">' +
                        iconHtml +
                        '<h3>Не удалось загрузить реестр ОКН</h3>' +
                        '<p>Проверьте соединение и обновите страницу.</p>' +
                        '<a href="index.html" class="btn btn-primary">На главную</a>' +
                    '</div>';
            }
        }
    }

    function initLeafletOknMap(borderGeoJson) {
        const mapEl = document.getElementById('okn-map');
        if (!mapEl || typeof L === 'undefined') return;

        const maxBounds = L.latLngBounds(
            L.latLng(55.4, 35.2),
            L.latLng(60.3, 43.2)
        );

        oknMap = L.map('okn-map', {
            center: YAROSLAVL_CENTER,
            zoom: DEFAULT_ZOOM,
            minZoom: 7,
            maxZoom: 18,
            maxBounds: maxBounds,
            maxBoundsViscosity: 0.85,
            preferCanvas: true
        });

        if (oknMap.attributionControl) {
            oknMap.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
        }

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(oknMap);

        if (borderGeoJson && borderGeoJson.features && borderGeoJson.features.length > 0) {
            try {
                const feature = borderGeoJson.features[0];
                const worldCoords = [
                    [90, -180],
                    [90, 180],
                    [-90, 180],
                    [-90, -180],
                    [90, -180]
                ];

                let holeCoords = [];
                if (feature.geometry.type === 'Polygon') {
                    holeCoords = feature.geometry.coordinates[0].map((c) => [c[1], c[0]]);
                } else if (feature.geometry.type === 'MultiPolygon') {
                    holeCoords = feature.geometry.coordinates[0][0].map((c) => [c[1], c[0]]);
                }

                if (holeCoords.length > 0) {
                    L.polygon([worldCoords, holeCoords], {
                        className: 'outside-overlay',
                        fillColor: '#1a1a2e',
                        fillOpacity: 0.55,
                        stroke: false,
                        interactive: false
                    }).addTo(oknMap);
                }

                L.geoJSON(borderGeoJson, {
                    style: {
                        className: 'oblast-border',
                        color: '#c8a415',
                        weight: 2,
                        fill: false,
                        dashArray: '5, 10',
                        interactive: false
                    }
                }).addTo(oknMap);
            } catch (borderErr) {
                console.warn('Не удалось отрисовать границу области:', borderErr);
            }
        }

        mapCanvasRenderer = L.canvas({ padding: 0.5 });
        markersLayer = L.layerGroup().addTo(oknMap);
    }

    function populateFilterSelects(records) {
        const stats = window.OknLogic.computeOknDashboardStats(records);

        const categorySelect = document.getElementById('okn-filter-category');
        if (categorySelect) {
            stats.byCategory.forEach((item) => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label + ' (' + formatNumber(item.count) + ')';
                categorySelect.appendChild(opt);
            });
        }

        const typeSelect = document.getElementById('okn-filter-type');
        if (typeSelect) {
            stats.byType.forEach((item) => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label + ' (' + formatNumber(item.count) + ')';
                typeSelect.appendChild(opt);
            });
        }

        const typologySelect = document.getElementById('okn-filter-typology');
        if (typologySelect) {
            stats.byTypology.forEach((item) => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label + ' (' + formatNumber(item.count) + ')';
                typologySelect.appendChild(opt);
            });
        }

        const municipalitySelect = document.getElementById('okn-filter-municipality');
        if (municipalitySelect) {
            stats.byMunicipality.forEach((item) => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label + ' (' + formatNumber(item.count) + ')';
                municipalitySelect.appendChild(opt);
            });
        }

        const eraSelect = document.getElementById('okn-filter-era');
        if (eraSelect) {
            stats.byEra.forEach((item) => {
                const opt = document.createElement('option');
                opt.value = item.label;
                opt.textContent = item.label + ' (' + formatNumber(item.count) + ')';
                eraSelect.appendChild(opt);
            });
        }
    }

    function bindFilterControls() {
        const searchInput = document.getElementById('okn-search-input');
        let searchTimer = null;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    filterState.search = searchInput.value;
                    currentPage = 1;
                    applyFiltersAndRender({ fitMap: false });
                }, 120);
            });
        }

        const selectMappings = [
            { id: 'okn-filter-category', key: 'category' },
            { id: 'okn-filter-type', key: 'objectType' },
            { id: 'okn-filter-typology', key: 'typology' },
            { id: 'okn-filter-municipality', key: 'municipality' },
            { id: 'okn-filter-era', key: 'era' },
            { id: 'okn-sort-select', key: 'sortBy' }
        ];

        selectMappings.forEach(({ id, key }) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', () => {
                filterState[key] = el.value;
                currentPage = 1;
                applyFiltersAndRender({ fitMap: key === 'municipality' });
            });
        });

        const toggleButtons = [
            { id: 'okn-toggle-coords', key: 'onlyWithCoords' },
            { id: 'okn-toggle-unesco', key: 'onlyUnesco' },
            { id: 'okn-toggle-wwii', key: 'onlyWwii' }
        ];

        toggleButtons.forEach(({ id, key }) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', () => {
                filterState[key] = !filterState[key];
                btn.classList.toggle('active', filterState[key]);
                btn.setAttribute('aria-pressed', String(filterState[key]));
                currentPage = 1;
                applyFiltersAndRender({ fitMap: false });
            });
        });

        const resetBtn = document.getElementById('okn-reset-filters');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                resetAllFilters();
            });
        }

        const fitBoundsBtn = document.getElementById('okn-fit-bounds-btn');
        if (fitBoundsBtn) {
            fitBoundsBtn.addEventListener('click', () => {
                fitMapToCurrentMarkers();
            });
        }

        const prevPageBtn = document.getElementById('okn-prev-page');
        const nextPageBtn = document.getElementById('okn-next-page');
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderRegistryList();
                }
            });
        }
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
                if (currentPage < totalPages) {
                    currentPage++;
                    renderRegistryList();
                }
            });
        }

        const toggleDashboardsBtn = document.getElementById('okn-toggle-dashboards-btn');
        const dashboardsGrid = document.getElementById('okn-dashboards-grid');
        if (toggleDashboardsBtn && dashboardsGrid) {
            toggleDashboardsBtn.addEventListener('click', () => {
                const isHidden = dashboardsGrid.classList.toggle('hidden');
                toggleDashboardsBtn.setAttribute('aria-expanded', String(!isHidden));
                toggleDashboardsBtn.querySelector('span').textContent = isHidden
                    ? 'Развернуть дашборды'
                    : 'Свернуть дашборды';
            });
        }
    }

    function syncControlsWithFilterState() {
        const searchInput = document.getElementById('okn-search-input');
        if (searchInput && searchInput.value !== filterState.search) {
            searchInput.value = filterState.search;
        }

        const selectMap = {
            'okn-filter-category': filterState.category,
            'okn-filter-type': filterState.objectType,
            'okn-filter-typology': filterState.typology,
            'okn-filter-municipality': filterState.municipality,
            'okn-filter-era': filterState.era,
            'okn-sort-select': filterState.sortBy
        };

        Object.entries(selectMap).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        });

        const toggleMap = {
            'okn-toggle-coords': filterState.onlyWithCoords,
            'okn-toggle-unesco': filterState.onlyUnesco,
            'okn-toggle-wwii': filterState.onlyWwii
        };

        Object.entries(toggleMap).forEach(([id, active]) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', String(active));
            }
        });
    }

    function resetAllFilters() {
        filterState.search = '';
        filterState.category = 'all';
        filterState.objectType = 'all';
        filterState.typology = 'all';
        filterState.municipality = 'all';
        filterState.era = 'all';
        filterState.onlyWithCoords = false;
        filterState.onlyUnesco = false;
        filterState.onlyWwii = false;
        filterState.sortBy = 'default';
        currentPage = 1;

        syncControlsWithFilterState();
        applyFiltersAndRender({ fitMap: true });
    }

    function applyFiltersAndRender(options) {
        const opts = options || {};
        const matched = window.OknLogic.filterOknRecords(allRecords, filterState);
        filteredRecords = window.OknLogic.sortOknRecords(matched, filterState.sortBy);

        const stats = window.OknLogic.computeOknDashboardStats(filteredRecords);
        renderKpiStrip(stats);
        renderDashboards(stats);
        renderMapMarkers(filteredRecords, opts.fitMap);
        renderRegistryList();
    }

    function renderKpiStrip(stats) {
        const totalEl = document.getElementById('kpi-total-count');
        const totalSubEl = document.getElementById('kpi-total-sub');
        const mapEl = document.getElementById('kpi-map-count');
        const mapSubEl = document.getElementById('kpi-map-sub');
        const fedEl = document.getElementById('kpi-federal-count');
        const regEl = document.getElementById('kpi-regional-count');
        const locEl = document.getElementById('kpi-local-count');
        const specEl = document.getElementById('kpi-special-count');

        if (totalEl) totalEl.textContent = formatNumber(stats.total);
        if (totalSubEl) {
            totalSubEl.textContent = stats.total === allRecords.length
                ? 'полный реестр области'
                : 'из ' + formatNumber(allRecords.length) + ' в реестре';
        }

        if (mapEl) mapEl.textContent = formatNumber(stats.withCoords);
        if (mapSubEl) {
            const pct = stats.total > 0 ? Math.round((stats.withCoords / stats.total) * 100) : 0;
            mapSubEl.textContent = pct + '% выборки с координатами';
        }

        const catLookup = {};
        stats.byCategory.forEach((c) => {
            catLookup[c.label] = c.count;
        });

        if (fedEl) fedEl.textContent = formatNumber(catLookup['Федерального значения'] || 0);
        if (regEl) regEl.textContent = formatNumber(catLookup['Регионального значения'] || 0);
        if (locEl) locEl.textContent = formatNumber(catLookup['Местного (муниципального) значения'] || 0);
        if (specEl) specEl.textContent = formatNumber(stats.unesco) + ' / ' + formatNumber(stats.wwii);
    }

    function renderBarList(containerId, items, totalBase, filterKey, maxRows, colorVariant) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = '<p class="okn-chart-empty">Нет данных для выбранных фильтров</p>';
            return;
        }

        const visibleItems = items.slice(0, maxRows || 6);
        const maxCount = Math.max(...visibleItems.map((i) => i.count), 1);

        container.innerHTML = visibleItems.map((item) => {
            const pctWidth = Math.max(4, Math.round((item.count / maxCount) * 100));
            const sharePct = totalBase > 0 ? Math.round((item.count / totalBase) * 100) : 0;
            const isActive = filterState[filterKey] === item.label;

            let barToneClass = colorVariant || 'gold';
            if (filterKey === 'category') {
                if (item.label === 'Федерального значения') barToneClass = 'federal';
                else if (item.label === 'Регионального значения') barToneClass = 'regional';
                else barToneClass = 'local';
            }

            return (
                '<button type="button" class="okn-bar-row' + (isActive ? ' active' : '') + '" ' +
                    'data-filter-key="' + escapeHtml(filterKey) + '" ' +
                    'data-filter-val="' + escapeHtml(item.label) + '" ' +
                    'title="Фильтровать: ' + escapeHtml(item.label) + '">' +
                    '<div class="okn-bar-label-row">' +
                        '<span class="okn-bar-label">' + escapeHtml(item.label) + '</span>' +
                        '<span class="okn-bar-numbers">' +
                            '<strong>' + formatNumber(item.count) + '</strong>' +
                            '<span class="okn-bar-pct">' + sharePct + '%</span>' +
                        '</span>' +
                    '</div>' +
                    '<div class="okn-bar-track">' +
                        '<div class="okn-bar-fill okn-bar-fill-' + barToneClass + '" style="width:' + pctWidth + '%"></div>' +
                    '</div>' +
                '</button>'
            );
        }).join('');

        container.querySelectorAll('.okn-bar-row').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-filter-key');
                const val = btn.getAttribute('data-filter-val');
                if (!key || !val) return;
                filterState[key] = filterState[key] === val ? 'all' : val;
                currentPage = 1;
                syncControlsWithFilterState();
                applyFiltersAndRender({ fitMap: key === 'municipality' });
            });
        });
    }

    function renderDashboards(stats) {
        renderBarList('chart-category', stats.byCategory, stats.total, 'category', 5, 'gold');
        renderBarList('chart-typology', stats.byTypology, stats.total, 'typology', 6, 'green');
        renderBarList('chart-municipality', stats.byMunicipality, stats.total, 'municipality', 6, 'gold');
        renderBarList('chart-era', stats.byEra, stats.total, 'era', 6, 'indigo');
    }

    function renderMapMarkers(records, shouldFitBounds) {
        if (!oknMap || !markersLayer) return;

        markersLayer.clearLayers();
        markerById.clear();

        const geocodedRecords = records.filter((r) => r.hasCoords && r.coords);
        const mapCounterEl = document.getElementById('okn-map-counter');
        if (mapCounterEl) {
            mapCounterEl.textContent = formatNumber(geocodedRecords.length) + ' меток на карте';
        }

        const latLngList = [];

        geocodedRecords.forEach((record) => {
            const catStyle = getCategoryColor(record.category);
            const latLng = [record.coords.lat, record.coords.lng];
            latLngList.push(latLng);

            const marker = L.circleMarker(latLng, {
                renderer: mapCanvasRenderer,
                radius: record.isUnesco ? 8 : 6.5,
                fillColor: catStyle.fill,
                color: '#ffffff',
                weight: 1.75,
                opacity: 1,
                fillOpacity: 0.9
            });

            const popupHtml =
                '<div class="okn-map-popup">' +
                    '<div class="okn-popup-meta">' +
                        escapeHtml(record.objectType) + ' · ' + escapeHtml(catStyle.shortLabel) +
                    '</div>' +
                    '<h4 class="okn-popup-title">' + escapeHtml(record.name) + '</h4>' +
                    (record.date ? '<div class="okn-popup-date">Датировка: ' + escapeHtml(record.date) + '</div>' : '') +
                    (record.address ? '<div class="okn-popup-addr">' + escapeHtml(record.address) + '</div>' : '') +
                    '<div class="okn-popup-actions">' +
                        '<button type="button" class="btn btn-primary btn-xs okn-popup-detail-btn" data-record-id="' + record.id + '">' +
                            'Паспорт объекта' +
                        '</button>' +
                    '</div>' +
                '</div>';

            marker.bindPopup(popupHtml, { maxWidth: 320 });

            marker.on('popupopen', (e) => {
                const popupEl = e.popup.getElement();
                if (!popupEl) return;
                const detailBtn = popupEl.querySelector('.okn-popup-detail-btn');
                if (detailBtn) {
                    detailBtn.addEventListener('click', () => {
                        openRecordDetailModal(record.id);
                    });
                }
            });

            marker.addTo(markersLayer);
            markerById.set(record.id, marker);
        });

        if (shouldFitBounds && latLngList.length > 0) {
            fitMapToCurrentMarkers();
        }
    }

    function fitMapToCurrentMarkers() {
        if (!oknMap) return;
        const geocoded = filteredRecords.filter((r) => r.hasCoords && r.coords);
        if (geocoded.length === 0) {
            oknMap.setView(YAROSLAVL_CENTER, DEFAULT_ZOOM);
            return;
        }
        if (geocoded.length === 1) {
            oknMap.setView([geocoded[0].coords.lat, geocoded[0].coords.lng], 15);
            return;
        }
        const bounds = L.latLngBounds(geocoded.map((r) => [r.coords.lat, r.coords.lng]));
        oknMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }

    function focusRecordOnMap(recordId) {
        const record = allRecords.find((r) => r.id === recordId);
        if (!record || !record.hasCoords || !oknMap) return;

        activeRecordId = recordId;
        highlightActiveCardInList(recordId);

        const marker = markerById.get(recordId);
        oknMap.setView([record.coords.lat, record.coords.lng], Math.max(oknMap.getZoom(), 15), {
            animate: true
        });

        if (marker) {
            marker.openPopup();
        }

        const mapEl = document.getElementById('okn-map');
        if (mapEl && window.innerWidth < 960) {
            mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function highlightActiveCardInList(recordId) {
        const container = document.getElementById('okn-list-container');
        if (!container) return;
        container.querySelectorAll('.okn-item-card').forEach((card) => {
            const id = Number(card.getAttribute('data-record-id'));
            card.classList.toggle('active', id === recordId);
        });
    }

    function renderRegistryList() {
        const container = document.getElementById('okn-list-container');
        const listCounterEl = document.getElementById('okn-list-counter');
        const pageIndicatorEl = document.getElementById('okn-page-indicator');
        const paginationStatusEl = document.getElementById('okn-pagination-status');
        const prevBtn = document.getElementById('okn-prev-page');
        const nextBtn = document.getElementById('okn-next-page');

        const total = filteredRecords.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (currentPage > totalPages) currentPage = totalPages;

        if (listCounterEl) {
            listCounterEl.textContent = 'Найдено: ' + formatNumber(total);
        }
        if (pageIndicatorEl) {
            pageIndicatorEl.textContent = 'Стр. ' + currentPage + ' из ' + totalPages;
        }

        if (!container) return;

        if (total === 0) {
            container.innerHTML =
                '<div class="okn-empty-state">' +
                    '<div class="empty-leaderboard-icon">' +
                        (typeof renderIcon === 'function' ? renderIcon('search', 'ui-icon-md') : '') +
                    '</div>' +
                    '<h3>По вашему запросу объектов не найдено</h3>' +
                    '<p>Попробуйте изменить поисковый запрос или сбросить один из активных фильтров.</p>' +
                '</div>';
            if (paginationStatusEl) paginationStatusEl.textContent = '0 из 0';
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }

        const startIdx = (currentPage - 1) * PAGE_SIZE;
        const endIdx = Math.min(startIdx + PAGE_SIZE, total);
        const pageItems = filteredRecords.slice(startIdx, endIdx);

        if (paginationStatusEl) {
            paginationStatusEl.textContent = formatNumber(startIdx + 1) + '–' + formatNumber(endIdx) + ' из ' + formatNumber(total);
        }
        if (prevBtn) prevBtn.disabled = currentPage <= 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

        const pinIcon = typeof renderIcon === 'function' ? renderIcon('mapPin', 'ui-icon-sm') : '';
        const docIcon = typeof renderIcon === 'function' ? renderIcon('fileText', 'ui-icon-sm') : '';

        container.innerHTML = pageItems.map((record) => {
            const catStyle = getCategoryColor(record.category);
            const metaParts = [
                record.objectType,
                catStyle.shortLabel,
                record.primaryTypology
            ];
            if (record.isUnesco) metaParts.push('ЮНЕСКО');
            if (record.isWwii) metaParts.push('Память ВОВ');

            const addressText = record.address || 'Точный адрес не публикуется (объект археологии / охраняемая территория)';
            const isActive = record.id === activeRecordId;

            return (
                '<article class="okn-item-card' + (isActive ? ' active' : '') + '" data-record-id="' + record.id + '">' +
                    '<div class="okn-item-top">' +
                        '<div class="okn-item-meta">' +
                            '<span class="okn-cat-dot okn-cat-dot-' + catStyle.className + '" aria-hidden="true"></span>' +
                            '<span>' + escapeHtml(metaParts.join(' · ')) + '</span>' +
                        '</div>' +
                        (record.date ? '<span class="okn-item-date">' + escapeHtml(record.date) + '</span>' : '') +
                    '</div>' +
                    '<h3 class="okn-item-title">' + escapeHtml(record.name) + '</h3>' +
                    (record.ensemble && record.ensemble !== record.name
                        ? '<div class="okn-item-ensemble">Ансамбль: ' + escapeHtml(record.ensemble) + '</div>'
                        : '') +
                    '<p class="okn-item-address">' + escapeHtml(addressText) + '</p>' +
                    '<div class="okn-item-footer">' +
                        '<span class="okn-item-regnum">Реестр № ' + escapeHtml(record.regNumber || record.accountNumber || '—') + '</span>' +
                        '<div class="okn-item-actions">' +
                            (record.hasCoords
                                ? '<button type="button" class="okn-action-btn okn-action-locate" data-locate-id="' + record.id + '">' +
                                    pinIcon +
                                    '<span>На карте</span>' +
                                  '</button>'
                                : '<span class="okn-no-coords-note">Без геометки</span>') +
                            '<button type="button" class="okn-action-btn okn-action-passport" data-passport-id="' + record.id + '">' +
                                docIcon +
                                '<span>Паспорт</span>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</article>'
            );
        }).join('');

        container.scrollTop = 0;

        container.querySelectorAll('[data-locate-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.getAttribute('data-locate-id'));
                focusRecordOnMap(id);
            });
        });

        container.querySelectorAll('[data-passport-id]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.getAttribute('data-passport-id'));
                openRecordDetailModal(id);
            });
        });
    }

    function bindModalControls() {
        const modal = document.getElementById('okn-detail-modal');
        const closeBtn = document.getElementById('okn-close-modal');
        const doneBtn = document.getElementById('okn-modal-done-btn');

        const closeModal = () => {
            if (modal) modal.classList.add('hidden');
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (doneBtn) doneBtn.addEventListener('click', closeModal);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    function openRecordDetailModal(recordId) {
        const record = allRecords.find((r) => r.id === recordId);
        if (!record) return;

        const modal = document.getElementById('okn-detail-modal');
        const body = document.getElementById('okn-modal-body');
        const kicker = document.getElementById('okn-modal-kicker');
        const locateBtn = document.getElementById('okn-modal-locate-btn');

        if (!modal || !body) return;

        if (kicker) {
            kicker.textContent = record.objectType + ' · ' + record.category;
        }

        const docsHtml = record.documents && record.documents.length > 0
            ? '<div class="okn-modal-section">' +
                '<h4>Правовые акты и документы охраны (' + record.documents.length + ')</h4>' +
                '<ul class="okn-docs-list">' +
                    record.documents.map((doc) => {
                        const title = [doc.type, doc.name].filter(Boolean).join(' — ');
                        const meta = [
                            doc.date ? 'от ' + doc.date : '',
                            doc.number ? '№ ' + doc.number : ''
                        ].filter(Boolean).join(' ');
                        return (
                            '<li>' +
                                '<div class="okn-doc-title">' + escapeHtml(title || 'Нормативный акт') + '</div>' +
                                (meta ? '<div class="okn-doc-meta">' + escapeHtml(meta) + '</div>' : '') +
                            '</li>'
                        );
                    }).join('') +
                '</ul>' +
              '</div>'
            : '';

        const coordsText = record.hasCoords
            ? record.coords.lat.toFixed(6) + '° с. ш., ' + record.coords.lng.toFixed(6) + '° в. д.'
            : 'Не опубликованы в открытом геослое';

        body.innerHTML =
            '<h3 id="okn-modal-title" class="okn-modal-title">' + escapeHtml(record.name) + '</h3>' +
            '<div class="okn-modal-grid">' +
                '<div class="okn-modal-field">' +
                    '<span class="okn-field-label">Регистрационный номер</span>' +
                    '<span class="okn-field-value">' + escapeHtml(record.regNumber || '—') + '</span>' +
                '</div>' +
                '<div class="okn-modal-field">' +
                    '<span class="okn-field-label">Учётный номер</span>' +
                    '<span class="okn-field-value">' + escapeHtml(record.accountNumber || '—') + '</span>' +
                '</div>' +
                '<div class="okn-modal-field">' +
                    '<span class="okn-field-label">Датировка / время возникновения</span>' +
                    '<span class="okn-field-value">' + escapeHtml(record.date || 'Не указана') + ' (' + escapeHtml(record.era) + ')</span>' +
                '</div>' +
                '<div class="okn-modal-field">' +
                    '<span class="okn-field-label">Видовая принадлежность</span>' +
                    '<span class="okn-field-value">' + escapeHtml(record.typologies.join(', ') || record.primaryTypology) + '</span>' +
                '</div>' +
                '<div class="okn-modal-field">' +
                    '<span class="okn-field-label">Город / район</span>' +
                    '<span class="okn-field-value">' + escapeHtml(record.municipality) + '</span>' +
                '</div>' +
                '<div class="okn-modal-field">' +
                    '<span class="okn-field-label">Координаты на карте</span>' +
                    '<span class="okn-field-value okn-coords-num">' + escapeHtml(coordsText) + '</span>' +
                '</div>' +
            '</div>' +
            (record.ensemble
                ? '<div class="okn-modal-section">' +
                    '<h4>Принадлежность к ансамблю</h4>' +
                    '<p>' + escapeHtml(record.ensemble) + '</p>' +
                  '</div>'
                : '') +
            '<div class="okn-modal-section">' +
                '<h4>Полный адрес местонахождения</h4>' +
                '<p>' + escapeHtml(record.address || 'Точный адрес не указан (объект археологического наследия или достопримечательное место).') + '</p>' +
            '</div>' +
            (record.protectionSubject
                ? '<div class="okn-modal-section">' +
                    '<h4>Описание предмета охраны</h4>' +
                    '<p>' + escapeHtml(record.protectionSubject) + '</p>' +
                  '</div>'
                : '') +
            docsHtml;

        if (locateBtn) {
            if (record.hasCoords) {
                locateBtn.classList.remove('hidden');
                locateBtn.onclick = () => {
                    modal.classList.add('hidden');
                    focusRecordOnMap(record.id);
                };
            } else {
                locateBtn.classList.add('hidden');
                locateBtn.onclick = null;
            }
        }

        modal.classList.remove('hidden');
    }

    document.addEventListener('DOMContentLoaded', initOknPage);
})();
