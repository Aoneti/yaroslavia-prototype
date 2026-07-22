// Инициализация и управление картой Leaflet

let map = null;
let guessMarker = null;
let targetMarker = null;
let foundMarkers = [];
let resultLine = null;
let outsideOverlay = null;
let oblastOutlineLayer = null; // Добавлена переменная для контроля слоя границы

// Глобальные константы для центра и границ (резервные)
const YAROSLAVL_CENTER = { lat: 57.6263877, lng: 39.8933705 };
const YAROSLAVL_BOUNDS = { south: 56.4, north: 58.9, west: 37.3, east: 41.3 };

function initMap() {
    // Если карта уже инициализирована, просто обновляем границы
    if (map) {
        ensureBoundaryLayers();
        return map;
    }

    map = L.map('map', {
        center: [YAROSLAVL_CENTER.lat, YAROSLAVL_CENTER.lng],
        zoom: 9,
        minZoom: 7,
        maxZoom: 16,
        zoomControl: true
    });

    const bounds = L.latLngBounds(
        [YAROSLAVL_BOUNDS.south - 0.5, YAROSLAVL_BOUNDS.west - 0.5],
        [YAROSLAVL_BOUNDS.north + 0.5, YAROSLAVL_BOUNDS.east + 0.5]
    );
    map.setMaxBounds(bounds);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18
    }).addTo(map);

    addOblastOutline();
    addOutsideOverlay();

    return map;
}

// Функция для гарантированного восстановления слоев границы
function ensureBoundaryLayers() {
    if (!window.OBLAST_BORDER || window.OBLAST_BORDER.length < 10) {
        console.warn('⚠️ Граница области не загружена или слишком мала');
        return;
    }
    
    // Удаляем старые слои, если они есть
    if (oblastOutlineLayer) {
        map.removeLayer(oblastOutlineLayer);
        oblastOutlineLayer = null;
    }
    if (outsideOverlay) {
        map.removeLayer(outsideOverlay);
        outsideOverlay = null;
    }
    
    // Пересоздаем слои
    addOblastOutline();
    addOutsideOverlay();
}

function addOblastOutline() {
    if (!window.OBLAST_BORDER || window.OBLAST_BORDER.length < 10) {
        console.warn('⚠️ Граница области не загружена или слишком мала');
        return;
    }
    
    // Удаляем старый слой, если он есть
    if (oblastOutlineLayer) {
        map.removeLayer(oblastOutlineLayer);
    }
    
    oblastOutlineLayer = L.polygon(window.OBLAST_BORDER, {
        color: '#c8a415',
        weight: 2,
        fillColor: '#c8a415',
        fillOpacity: 0.03,
        dashArray: '5, 10',
        className: 'oblast-border' // Важно: привязка к CSS
    }).addTo(map);
}

function addOutsideOverlay() {
    if (!window.OBLAST_BORDER || window.OBLAST_BORDER.length < 10) {
        console.warn('⚠️ Граница области не загружена или слишком мала');
        return;
    }
    
    if (outsideOverlay) {
        map.removeLayer(outsideOverlay);
    }
    
    const outerBounds = [
        [90, -180],
        [90, 180],
        [-90, 180],
        [-90, -180]
    ];
    
    outsideOverlay = L.polygon([outerBounds, window.OBLAST_BORDER], {
        color: 'transparent',
        fillColor: '#000',
        fillOpacity: 0.4,
        interactive: false,
        className: 'outside-overlay' // Важно: привязка к CSS
    }).addTo(map);
}

function createIcon(colorClass) {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div class="marker-pin marker-${colorClass}"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

function placeTargetMarker(lat, lng) {
    if (targetMarker) {
        map.removeLayer(targetMarker);
    }
    targetMarker = L.marker([lat, lng], {
        icon: createIcon('target')
    }).addTo(map);
    targetMarker.bindPopup('📍 Правильное место').openPopup();
}

function placeGuessMarker(lat, lng) {
    if (guessMarker) {
        map.removeLayer(guessMarker);
    }
    guessMarker = L.marker([lat, lng], {
        icon: createIcon('guess')
    }).addTo(map);
    guessMarker.bindPopup('🎯 Твой ответ');
}

function drawResultLine(guessLat, guessLng, targetLat, targetLng) {
    if (resultLine) {
        map.removeLayer(resultLine);
    }
    resultLine = L.polyline(
        [[guessLat, guessLng], [targetLat, targetLng]],
        { color: '#b22222', weight: 3, dashArray: '8, 8', opacity: 0.7 }
    ).addTo(map);
}

function addFoundMarker(lat, lng, name) {
    const marker = L.marker([lat, lng], {
        icon: createIcon('found')
    }).addTo(map);
    marker.bindPopup(`✅ ${name}`);
    foundMarkers.push(marker);
}

function clearAllMarkers() {
    if (guessMarker) {
        map.removeLayer(guessMarker);
        guessMarker = null;
    }
    if (targetMarker) {
        map.removeLayer(targetMarker);
        targetMarker = null;
    }
    if (resultLine) {
        map.removeLayer(resultLine);
        resultLine = null;
    }
    foundMarkers.forEach(m => map.removeLayer(m));
    foundMarkers = [];
}

function onMapClick(e) {
    if (gameState.mode !== 'geoguesser' || !gameState.isPlaying) return;
    if (gameState.roundAnswered) return;

    const { lat, lng } = e.latlng;
    placeGuessMarker(lat, lng);
    gameState.currentGuess = { lat, lng };
}

function bindMapClick() {
    map.on('click', onMapClick);
}

function unbindMapClick() {
    map.off('click', onMapClick);
}