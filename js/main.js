// Главный скрипт: инициализация, роутинг, обработчики событий

// Глобальные переменные для данных
window.LOCATIONS = [];
window.OBLAST_BORDER = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Определяем страницу СРАЗУ: главной странице не нужны данные локаций/границы
    // (раньше fetch выполнялся безусловно для обеих страниц — код-ревью §High/2)
    const isGamePage = document.getElementById('map') !== null;

    if (!isGamePage) {
        initHomePage();
        return;
    }

    try {
        console.log("🔄 Начинаем загрузку данных...");

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

        initGamePage();

    } catch (error) {
        console.error("❌ КРИТИЧЕСКАЯ ОШИБКА ЗАГРУЗКИ:", error);
        // Пользователю — понятное сообщение и способ восстановиться,
        // технические детали остаются в консоли (код-ревью §Low/4)
        const shouldRetry = confirm(
            'Не удалось загрузить данные игры. Проверьте подключение к интернету.\n\nПопробовать снова?'
        );
        if (shouldRetry) {
            location.reload();
        }
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
        // Экранируем ВСЕ поля записи, а не только name (код-ревью §Low/1) —
        // это локальные данные из localStorage, но единообразная санитизация
        // дешевле, чем гадать, какое поле останется "безопасным" навсегда.
        html += `<tr><td>${escapeHtml(String(i + 1))}</td><td>${escapeHtml(entry.name)}</td><td><strong>${escapeHtml(String(entry.score))}</strong></td><td>${escapeHtml(stats)}</td><td>${escapeHtml(entry.date)}</td></tr>`;
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
        startGameFromSettings();
    });

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', showSettingsModal);
    }
}

// Читаем автоприближение из чекбокса АКТИВНОГО режима, а не из обоих подряд.
// Раньше оба чекбокса существуют в DOM одновременно (второй просто скрыт через
// display:none у родителя), и функция читала оба без учёта режима — в
// результате в ГеоКвесте значение всегда перезаписывалось состоянием
// невидимого чекбокса "Знатока" (код-ревью §High/3, первопричина 1).
function updateSettingsFromUI() {
    const checkboxId = window.gameState.mode === 'writename'
        ? 'auto-zoom-checkbox-wn'
        : 'auto-zoom-checkbox';
    const checkbox = document.getElementById(checkboxId);
    if (checkbox) {
        window.gameState.settings.autoZoom = checkbox.checked;
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
