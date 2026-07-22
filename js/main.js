// Главный скрипт: инициализация, роутинг, обработчики событий

// Глобальные переменные для данных
window.LOCATIONS = [];
window.OBLAST_BORDER = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("🔄 Начинаем загрузку данных...");

        // Используем правильные пути (без пробелов)
        const locationsResponse = await fetch('data/locations.json');
        if (!locationsResponse.ok) {
            throw new Error(`Не удалось найти locations.json (Статус: ${locationsResponse.status})`);
        }
        window.LOCATIONS = await locationsResponse.json();
        console.log(`✅ Загружено ${window.LOCATIONS.length} локаций`);

        const borderResponse = await fetch('data/oblast-border.json');
        if (!borderResponse.ok) {
            throw new Error(`Не удалось найти oblast-border.json (Статус: ${borderResponse.status})`);
        }
        const borderGeoJSON = await borderResponse.json();
        
        // Инвертируем координаты [lng, lat] -> [lat, lng] для Leaflet
        window.OBLAST_BORDER = borderGeoJSON.features[0].geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
        console.log(`✅ Загружена граница области (${window.OBLAST_BORDER.length} точек)`);
        
        // Проверка загрузки
        if (window.LOCATIONS.length === 0) {
            throw new Error("Список локаций пуст");
        }
        if (window.OBLAST_BORDER.length < 10) {
            throw new Error("Граница области содержит недостаточно точек");
        }

        // Определяем, на какой странице мы
        const isGamePage = document.getElementById('map') !== null;
        if (isGamePage) {
            initGamePage();
        } else {
            initHomePage();
        }

    } catch (error) {
        console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ЗАГРУЗКИ:", error);
        alert(`Ошибка загрузки данных: ${error.message}\n\n1. Проверьте, что файлы лежат в папке data/\n2. Имена файлов должны быть: locations.json и oblast-border.json\n3. В locations.json должен быть чистый JSON (без const, let и т.д.)`);
    }
});

// === ГЛАВНАЯ СТРАНИЦА ===
function initHomePage() {
    renderHomeLeaderboard();
    setupSettingsHandlers();
}

function renderHomeLeaderboard() {
    const geoguesserContainer = document.getElementById('geoguesser-leaderboard');
    const writenameContainer = document.getElementById('writename-leaderboard');
    
    if (!geoguesserContainer || !writenameContainer) return;

    const leaderboard = JSON.parse(localStorage.getItem('yaroslavia_leaderboard') || '[]');
    const geoguesserEntries = leaderboard.filter(e => e.mode === 'ГеоКвест').slice(0, 10);
    const writenameEntries = leaderboard.filter(e => e.mode === 'Знаток Ярославщины').slice(0, 10);

    if (geoguesserEntries.length === 0) {
        geoguesserContainer.innerHTML = '<p class="empty-leaderboard">Пока никто не играл</p>';
    } else {
        geoguesserContainer.innerHTML = renderLeaderboardTable(geoguesserEntries);
    }

    if (writenameEntries.length === 0) {
        writenameContainer.innerHTML = '<p class="empty-leaderboard">Пока никто не играл</p>';
    } else {
        writenameContainer.innerHTML = renderLeaderboardTable(writenameEntries);
    }
}

function renderLeaderboardTable(entries) {
    let html = `<table><thead><tr><th>#</th><th>Имя</th><th>Очки</th><th>Статистика</th><th>Дата</th></tr></thead><tbody>`;
    entries.forEach((entry, i) => {
        const stats = entry.mode === 'ГеоКвест' 
            ? `${entry.rounds} раундов` 
            : `${entry.rounds} мест`;
        html += `<tr><td>${i + 1}</td><td>${escapeHtml(entry.name)}</td><td><strong>${entry.score}</strong></td><td>${stats}</td><td>${entry.date}</td></tr>`;
    });
    html += '</tbody></table>';
    return html;
}

// === СТРАНИЦА ИГРЫ ===
function initGamePage() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'geoguesser';
    
    const titleEl = document.getElementById('game-mode-title');
    if (mode === 'geoguesser') {
        titleEl.textContent = '🎯 ГеоКвест';
        document.getElementById('geoguesser-settings').style.display = 'block';
        document.getElementById('writename-settings').style.display = 'none';
    } else {
        titleEl.textContent = '✍️ Знаток Ярославщины';
        document.getElementById('geoguesser-settings').style.display = 'none';
        document.getElementById('writename-settings').style.display = 'block';
    }
    
    window.gameState.mode = mode;
    loadSettings();
    initMap();
    setupSettingsHandlers();
    setupGameHandlers();
    setupSettingsCheckboxes();
    
    if (mode === 'writename') {
        const endGameBtn = document.getElementById('end-game-btn-writename');
        if (endGameBtn) {
            endGameBtn.addEventListener('click', endGameEarly);
        }
    }
}

function showSettingsModal() {
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'settings-modal';
    settingsPanel.className = 'settings-modal';
    settingsPanel.innerHTML = `
        <div class="settings-modal-content">
            <div class="settings-modal-header">
                <h3>Настройки</h3>
                <button class="close-settings">&times;</button>
            </div>
            <div class="settings-modal-body">
                <div class="setting-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="modal-auto-zoom" ${window.gameState.settings.autoZoom ? 'checked' : ''}> Автоприближение карты
                    </label>
                </div>
            </div>
            <div class="settings-modal-footer">
                <button id="save-settings-btn" class="btn btn-primary">Сохранить</button>
            </div>
        </div>
    `;
    document.body.appendChild(settingsPanel);
    
    settingsPanel.style.display = 'flex';
    
    document.querySelector('.close-settings').addEventListener('click', () => {
        settingsPanel.remove();
    });
    
    document.getElementById('save-settings-btn').addEventListener('click', () => {
        window.gameState.settings.autoZoom = document.getElementById('modal-auto-zoom').checked;
        saveSettings();
        settingsPanel.remove();
    });
}

function setupSettingsHandlers() {
    const startBtn = document.getElementById('start-game-btn');
    startBtn.addEventListener('click', () => {
        updateSettingsFromUI();
        startGameFromSettings();
    });
    
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', showSettingsModal);
    }
}

function updateSettingsFromUI() {
    const autoZoomCheckbox = document.getElementById('auto-zoom-checkbox');
    if (autoZoomCheckbox) {
        window.gameState.settings.autoZoom = autoZoomCheckbox.checked;
    }
    
    const autoZoomWnCheckbox = document.getElementById('auto-zoom-checkbox-wn');
    if (autoZoomWnCheckbox) {
        window.gameState.settings.autoZoom = autoZoomWnCheckbox.checked;
    }
}

function startGameFromSettings() {
    updateSettingsFromUI();
    
    const mode = window.gameState.mode;
    
    document.getElementById('settings-panel').style.display = 'none';
    document.getElementById('game-area').style.display = 'flex';
    document.getElementById('game-over').style.display = 'none';
    
    setTimeout(() => {
        if (typeof map !== 'undefined' && map) map.invalidateSize();
    }, 100);
    
    if (mode === 'geoguesser') {
        const ggMode = document.querySelector('input[name="gg-mode"]:checked').value;
        const totalRounds = parseInt(document.getElementById('total-rounds').value);
        
        window.gameState.ggMode = ggMode;
        window.gameState.totalRounds = totalRounds;
        
        document.getElementById('guess-panel').style.display = 'block';
        document.getElementById('side-panel').style.display = 'none';
        startGeoguesser();
    } else {
        startWriteName();
    }
}

function setupGameHandlers() {
    document.getElementById('confirm-guess-btn').addEventListener('click', confirmGuess);
    document.getElementById('next-round-btn').addEventListener('click', nextGeoguesserRound);
    document.getElementById('submit-place-btn').addEventListener('click', submitPlaceName);
    
    document.getElementById('place-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitPlaceName();
    });
    
    document.getElementById('save-score-btn').addEventListener('click', saveScore);
    document.getElementById('play-again-btn').addEventListener('click', resetGame);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupSettingsCheckboxes() {
    const ggCheckbox = document.getElementById('auto-zoom-checkbox');
    const wnCheckbox = document.getElementById('auto-zoom-checkbox-wn');
    
    if (ggCheckbox) {
        ggCheckbox.checked = window.gameState.settings.autoZoom;
    }
    if (wnCheckbox) {
        wnCheckbox.checked = window.gameState.settings.autoZoom;
    }
}

if (typeof window.gameState !== 'undefined') {
    loadSettings();
}