// Инициализация и управление картой Leaflet

let map = null;
let guessMarker = null;
let targetMarker = null;
let foundMarkers = [];
let resultLine = null;
let outsideOverlay = null;

function initMap() {
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

function addOblastOutline() {
    if (!OBLAST_BORDER || OBLAST_BORDER.length === 0) {
        console.warn('Граница области не загружена');
        return;
    }
    
    L.polygon(OBLAST_BORDER, {
        color: '#c8a415',
        weight: 2,
        fillColor: '#c8a415',
        fillOpacity: 0.03,
        dashArray: '5, 10'
    }).addTo(map);
}

function addOutsideOverlay() {
    if (!OBLAST_BORDER || OBLAST_BORDER.length === 0) {
        console.warn('Граница области не загружена');
        return;
    }
    
    const outerBounds = [
        [90, -180],
        [90, 180],
        [-90, 180],
        [-90, -180]
    ];
    
    outsideOverlay = L.polygon([outerBounds, OBLAST_BORDER], {
        color: 'transparent',
        fillColor: '#000',
        fillOpacity: 0.4,
        interactive: false
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

// Пересоздание границ и маски (если нужно)
function recreateBoundaryLayers() {
    // Очищаем старые слои если есть
    if (outsideOverlay) {
        map.removeLayer(outsideOverlay);
        outsideOverlay = null;
    }
    
    // Пересоздаем слои
    addOblastOutline();
    addOutsideOverlay();
}