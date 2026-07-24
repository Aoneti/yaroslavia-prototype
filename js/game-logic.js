// Игровая логика: расчёты, режимы, очки

// === ИМЕНОВАННЫЕ КОНСТАНТЫ (вместо магических чисел, см. код-ревью §Nitpick) ===
const EARTH_RADIUS_KM = 6371;
const MAX_ROUND_SCORE = 5000;          // Макс. очков за раунд ГеоКвеста
const PERFECT_GUESS_RADIUS_KM = 0.5;   // В пределах этого радиуса — 100% очков
const ZERO_SCORE_DISTANCE_KM = 200;    // За этим расстоянием — 0 очков
const SCORE_DECAY_KM = 50;             // "Постоянная затухания" экспоненты очков
const EXCELLENT_SCORE_THRESHOLD = 4000;
const GOOD_SCORE_THRESHOLD = 2000;
const OK_SCORE_THRESHOLD = 500;
const POINTS_PER_PLACE = 500;          // Базовые очки за место в "Знатоке" (делятся между омонимами)
const MIN_NAME_LENGTH_EXACT = 3;       // Мин. длина ввода для точного поиска
const MIN_NAME_LENGTH_PREFIX = 4;      // Мин. длина ввода для поиска по началу слова
const ROUND_TIMER_SECONDS = 300;       // 5 минут на игру "На время"
const MAX_LEADERBOARD_ENTRIES = 50;

// Формула Haversine для расчёта расстояния между двумя точками (в км)
function haversineDistance(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

// Расчёт очков за раунд ГеоКвеста (максимум MAX_ROUND_SCORE, минимум 0)
function calculateScore(distanceKm) {
    if (distanceKm <= PERFECT_GUESS_RADIUS_KM) return MAX_ROUND_SCORE;
    if (distanceKm >= ZERO_SCORE_DISTANCE_KM) return 0;

    const score = MAX_ROUND_SCORE * Math.exp(-distanceKm / SCORE_DECAY_KM);
    return Math.round(score);
}

// Нормализация строки для сравнения
function normalizeString(str) {
    return str
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .replace(/[-–—]/g, ' ')
        .replace(/[.,!?;:]/g, '')
        .replace(/\b(с\.|с\.п\.|п\.|п\.п\.|д\.п\.|д\.|р\.|п\.к\.|ж\.р\.|м\.|к\.|з\.|снт|днт|дп|кп|мкрг|мкр)\b/g, '')
        .trim();
}

// Индекс "нормализованное имя -> [локации]", строится один раз лениво и
// переиспользуется при каждом вызове checkPlaceName вместо повторного
// прогона normalizeString() по всем локациям на каждый ввод игрока
// (код-ревью §Medium/4). Пересобирается автоматически, если передан другой
// массив локаций (в этом проекте такого не происходит, но так безопаснее).
let _normalizedNameIndex = null;
let _normalizedNameIndexSource = null;

function getNormalizedNameIndex(locations) {
    if (_normalizedNameIndex && _normalizedNameIndexSource === locations) {
        return _normalizedNameIndex;
    }
    const index = new Map();
    for (const loc of locations) {
        const key = normalizeString(loc.name);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(loc);
    }
    _normalizedNameIndex = index;
    _normalizedNameIndexSource = locations;
    return index;
}

// Проверка названия места - точное или максимально строгое сопоставление.
// Намеренно возвращает ВСЕ точные совпадения (а не первое) — в датасете есть
// места-омонимы (разные реальные населённые пункты с одинаковым названием),
// и игрок не должен терять доступ к любому из них. Начисление очков за
// несколько совпадений одним вводом обрабатывается в submitPlaceName().
function checkPlaceName(input, locations) {
    const normalized = normalizeString(input);

    if (normalized.length < MIN_NAME_LENGTH_EXACT) return [];

    const index = getNormalizedNameIndex(locations);

    const exact = index.get(normalized);
    if (exact && exact.length > 0) return exact;

    // Фолбэк по началу слова. Раньше засчитывалось первое совпадение по
    // порядку массива (по факту — по возрастанию OSM id), то есть по сути
    // случайное значение с точки зрения игрока (код-ревью §Medium/5).
    // Теперь засчитываем только однозначный случай: если под введённое
    // начало подходит больше одного места, ничего не начисляем — не
    // заставляя игрока выбирать, но и не выбирая за него произвольно.
    if (normalized.length >= MIN_NAME_LENGTH_PREFIX) {
        const prefixMatches = [];
        for (const [key, group] of index) {
            if (key.startsWith(normalized)) {
                prefixMatches.push(...group);
                if (prefixMatches.length > 1) break;
            }
        }
        if (prefixMatches.length === 1) return prefixMatches;
    }

    return [];
}

// Перемешивание массива (Fisher-Yates)
function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// === СОСТОЯНИЕ ИГРЫ ===
window.gameState = {
    mode: 'geoguesser',
    isPlaying: false,
    roundAnswered: false,
    ggMode: 'free',
    totalRounds: 10,
    currentRound: 0,
    currentLocation: null,
    currentGuess: null,
    gameLocations: [],
    totalScore: 0,
    roundScores: [],
    timeLeft: ROUND_TIMER_SECONDS,
    timerInterval: null,
    foundLocations: [],
    allLocations: [], // ранее назывался availableLocations, хотя никогда не уменьшался — см. код-ревью §Info
    settings: {
        autoZoom: true
    }
};

// === ЛОГИКА ГЕОКВЕСТА ===
function startGeoguesser() {
    gameState.mode = 'geoguesser';
    gameState.isPlaying = true;
    gameState.roundAnswered = false;
    gameState.currentRound = 0;
    gameState.totalScore = 0;
    gameState.roundScores = [];

    const shuffled = shuffleArray(window.LOCATIONS);
    gameState.gameLocations = shuffled.slice(0, gameState.totalRounds);

    if (gameState.ggMode === 'time') {
        gameState.timeLeft = ROUND_TIMER_SECONDS;
        startTimer();
    }

    updateGameUI();
    clearAllMarkers();
    bindMapClick();

    if (typeof ensureBoundaryLayers === 'function') ensureBoundaryLayers();

    nextGeoguesserRound();
}

function nextGeoguesserRound() {
    if (gameState.currentRound >= gameState.totalRounds) {
        endGame();
        return;
    }

    if (gameState.ggMode === 'time' && gameState.timeLeft <= 0) {
        endGame();
        return;
    }

    gameState.roundAnswered = false;
    gameState.currentGuess = null;
    gameState.currentRound++;

    gameState.currentLocation = gameState.gameLocations[gameState.currentRound - 1];

    if (guessMarker) map.removeLayer(guessMarker);
    if (targetMarker) map.removeLayer(targetMarker);
    if (resultLine) map.removeLayer(resultLine);
    guessMarker = null;
    targetMarker = null;
    resultLine = null;

    map.setView([YAROSLAVL_CENTER.lat, YAROSLAVL_CENTER.lng], 9);

    document.getElementById('location-name').textContent = gameState.currentLocation.name;
    const hint = gameState.currentLocation.hint || getDefaultHint(gameState.currentLocation.type);
    document.getElementById('location-hint').textContent = hint;
    document.getElementById('round-display').textContent = `Раунд: ${gameState.currentRound}/${gameState.totalRounds}`;

    updateRoundProgress();

    document.getElementById('guess-panel').style.display = 'block';
    document.getElementById('round-result').style.display = 'none';

    updateGameUI();
}

function getDefaultHint(type) {
    const hints = {
        city: 'Крупный город Ярославской области',
        town: 'Город или посёлок городского типа',
        village: 'Село или деревня',
        settlement: 'Населённый пункт',
        nature: 'Природный объект'
    };
    return hints[type] || 'Населённый пункт Ярославской области';
}

function confirmGuess() {
    if (!gameState.currentGuess || gameState.roundAnswered) return;

    gameState.roundAnswered = true;

    const guess = gameState.currentGuess;
    const target = gameState.currentLocation;

    const distance = haversineDistance(guess.lat, guess.lng, target.lat, target.lng);
    const score = calculateScore(distance);
    gameState.totalScore += score;
    gameState.roundScores.push(score);

    placeTargetMarker(target.lat, target.lng);
    drawResultLine(guess.lat, guess.lng, target.lat, target.lng);

    document.getElementById('result-distance').textContent = `Расстояние: ${distance.toFixed(1)} км`;
    document.getElementById('result-score').textContent = `Очки за раунд: ${score}`;

    const scorePercent = (score / MAX_ROUND_SCORE) * 100;
    document.getElementById('result-line').style.setProperty('--score-percent', scorePercent + '%');

    if (score >= EXCELLENT_SCORE_THRESHOLD) {
        document.getElementById('result-title').textContent = '🎉 Отлично!';
    } else if (score >= GOOD_SCORE_THRESHOLD) {
        document.getElementById('result-title').textContent = '👍 Хорошо!';
    } else if (score >= OK_SCORE_THRESHOLD) {
        document.getElementById('result-title').textContent = '😐 Можно лучше';
    } else {
        document.getElementById('result-title').textContent = '😅 В следующий раз!';
    }

    document.getElementById('guess-panel').style.display = 'none';
    document.getElementById('round-result').style.display = 'flex';

    updateGameUI();

    // Автоприближение теперь реально учитывает настройку игрока (было безусловным — код-ревью §High/3)
    if (gameState.settings.autoZoom) {
        const bounds = L.latLngBounds(
            [Math.min(guess.lat, target.lat), Math.min(guess.lng, target.lng)],
            [Math.max(guess.lat, target.lat), Math.max(guess.lng, target.lng)]
        );
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
}

function startTimer() {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);

    // Точка отсчёта в реальном времени, а не декремент счётчика на каждый
    // тик — раньше таймер мог разойтись с реальным временем при троттлинге
    // фоновых/неактивных вкладок браузером, особенно на мобильных
    // устройствах (код-ревью §Low/3). Теперь оставшееся время всегда
    // пересчитывается от фактической разницы во времени, поэтому даже
    // после троттлинга счётчик "догоняет" правильное значение сам.
    const endTimestamp = Date.now() + gameState.timeLeft * 1000;

    gameState.timerInterval = setInterval(() => {
        const remainingMs = endTimestamp - Date.now();
        gameState.timeLeft = Math.max(0, Math.ceil(remainingMs / 1000));
        updateTimerDisplay();

        if (remainingMs <= 0) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
            endGame();
        }
    }, 500);
}

function updateTimerDisplay() {
    const minutes = Math.floor(gameState.timeLeft / 60);
    const seconds = gameState.timeLeft % 60;
    document.getElementById('timer-display').textContent = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// === ЛОГИКА "ЗНАТОК ЯРОСЛАВЩИНЫ" ===
function startWriteName() {
    gameState.mode = 'writename';
    gameState.isPlaying = true;
    gameState.foundLocations = [];
    gameState.allLocations = window.LOCATIONS; // без копирования — список не мутируется, копия не нужна (было [...window.LOCATIONS])
    gameState.totalScore = 0;

    clearAllMarkers();
    unbindMapClick();

    if (typeof ensureBoundaryLayers === 'function') ensureBoundaryLayers();

    document.getElementById('side-panel').style.display = 'flex';
    document.getElementById('guess-panel').style.display = 'none';
    document.getElementById('round-result').style.display = 'none';
    document.getElementById('round-display').textContent = `Найдено: 0/${window.LOCATIONS.length}`;
    document.getElementById('found-count').textContent = '0';
    document.getElementById('found-places').innerHTML = '';
    document.getElementById('place-input').value = '';
    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';

    document.getElementById('score-display').classList.add('hidden');
    document.getElementById('round-display').classList.add('hidden');

    updateGameUI();
}

function submitPlaceName() {
    const input = document.getElementById('place-input');
    const feedback = document.getElementById('feedback');
    const value = input.value.trim();

    if (!value) return;

    const matches = checkPlaceName(value, gameState.allLocations);

    if (matches.length === 0) {
        feedback.textContent = '❌ Место не найдено. Попробуй ещё!';
        feedback.className = 'feedback error';
        input.value = '';
        input.focus();
        return;
    }

    const newMatches = matches.filter(match => {
        const isDuplicate = gameState.foundLocations.some(l => l.id === match.id);
        return !isDuplicate;
    });

    if (newMatches.length === 0) {
        feedback.textContent = '⚠️ Это место уже найдено!';
        feedback.className = 'feedback error';
        input.value = '';
        input.focus();
        return;
    }

    // Если названию соответствует несколько разных реальных мест (омонимы),
    // делим базовые очки поровну между ними, а не начисляем POINTS_PER_PLACE
    // за каждое — иначе частые названия ("Ивановское" и т.п.) дают
    // непропорционально много очков за один ввод (код-ревью, Critical #1).
    // Игроку не нужно ничего выбирать — засчитываются все совпадения сразу.
    const pointsPerMatch = Math.max(1, Math.round(POINTS_PER_PLACE / newMatches.length));

    newMatches.forEach(found => {
        gameState.foundLocations.push(found);
        gameState.totalScore += pointsPerMatch;
        addFoundMarker(found.lat, found.lng, found.name);

        const li = document.createElement('li');
        li.textContent = newMatches.length > 1
            ? `${found.name} (+${pointsPerMatch})`
            : found.name;
        li.classList.add('fade-in');
        document.getElementById('found-places').appendChild(li);
    });

    document.getElementById('found-count').textContent = gameState.foundLocations.length;
    document.getElementById('round-display').textContent = `Найдено: ${gameState.foundLocations.length}/${window.LOCATIONS.length}`;

    if (newMatches.length === 1) {
        feedback.textContent = `✅ Верно! ${newMatches[0].name} (+${pointsPerMatch})`;
    } else {
        const totalAwarded = pointsPerMatch * newMatches.length;
        feedback.textContent = `✅ Есть сразу ${newMatches.length} мест «${newMatches[0].name}»: +${totalAwarded} очков`;
    }
    feedback.className = 'feedback success';

    if (gameState.settings.autoZoom) {
        if (newMatches.length === 1) {
            map.setView([newMatches[0].lat, newMatches[0].lng], 12);
        } else {
            const bounds = L.latLngBounds(newMatches.map(l => [l.lat, l.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 });
        }
    }

    input.value = '';
    input.focus();
    updateGameUI();
}

// === ОБЩАЯ ЛОГИКА ===
function updateRoundProgress() {
    const progressContainer = document.getElementById('round-progress');
    if (gameState.mode === 'geoguesser' && gameState.isPlaying) {
        progressContainer.style.display = 'block';
        const progressPercent = ((gameState.currentRound - 1) / gameState.totalRounds) * 100;
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progressPercent}%`;
        }
        document.getElementById('progress-text').textContent = `Раунд ${gameState.currentRound} из ${gameState.totalRounds}`;
    }
}

function updateGameUI() {
    if (gameState.isPlaying) {
        document.getElementById('score-display').classList.remove('hidden');

        if (gameState.mode === 'geoguesser') {
            document.getElementById('round-display').classList.remove('hidden');
            if (gameState.ggMode === 'time') {
                document.getElementById('timer-display').classList.remove('hidden');
            } else {
                document.getElementById('timer-display').classList.add('hidden');
            }
            updateRoundProgress();
        } else {
            document.getElementById('round-display').classList.add('hidden');
            document.getElementById('timer-display').classList.add('hidden');
        }

        document.getElementById('score-display').textContent = `Очки: ${gameState.totalScore}`;
    }
}

function endGame() {
    gameState.isPlaying = false;

    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }

    unbindMapClick();

    document.getElementById('game-area').style.display = 'none';
    document.getElementById('game-over').style.display = 'flex';

    document.getElementById('score-display').classList.add('hidden');
    document.getElementById('round-display').classList.add('hidden');
    document.getElementById('timer-display').classList.add('hidden');
    document.getElementById('round-progress').style.display = 'none';

    document.getElementById('final-score').textContent = gameState.totalScore;

    if (gameState.mode === 'geoguesser') {
        const avgScore = gameState.roundScores.length > 0
            ? gameState.roundScores.reduce((a, b) => a + b, 0) / gameState.roundScores.length
            : 0;
        const accuracy = Math.round((avgScore / MAX_ROUND_SCORE) * 100);
        document.getElementById('final-accuracy').textContent = accuracy + '%';
        document.getElementById('final-rounds').textContent = gameState.roundScores.length;
    } else {
        const accuracy = Math.round((gameState.foundLocations.length / window.LOCATIONS.length) * 100);
        document.getElementById('final-accuracy').textContent = accuracy + '%';
        document.getElementById('final-rounds').textContent = gameState.foundLocations.length;
    }
}

function endGameEarly() {
    endGame();
}

function saveScore() {
    const name = (document.getElementById('player-name').value.trim() || 'Аноним').slice(0, 20);

    let leaderboard = JSON.parse(localStorage.getItem('yaroslavia_leaderboard') || '[]');

    leaderboard.push({
        name: name,
        score: gameState.totalScore,
        mode: gameState.mode === 'geoguesser' ? 'ГеоКвест' : 'Знаток Ярославщины',
        date: new Date().toLocaleDateString('ru-RU'),
        rounds: gameState.mode === 'geoguesser' ? gameState.roundScores.length : gameState.foundLocations.length
    });

    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, MAX_LEADERBOARD_ENTRIES);

    localStorage.setItem('yaroslavia_leaderboard', JSON.stringify(leaderboard));

    alert('✅ Результат сохранён!');
    document.getElementById('save-score-btn').disabled = true;
    document.getElementById('save-score-btn').textContent = 'Сохранено ✓';
}

function resetGame() {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('settings-panel').style.display = 'flex';
    document.getElementById('game-area').style.display = 'none';
    document.getElementById('save-score-btn').disabled = false;
    document.getElementById('save-score-btn').textContent = 'Сохранить результат';
    document.getElementById('player-name').value = '';

    gameState.isPlaying = false;
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
    }
}

function loadSettings() {
    const saved = localStorage.getItem('yaroslavia_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.autoZoom !== undefined) {
                gameState.settings.autoZoom = parsed.autoZoom;
            }
        } catch (e) {
            console.error('Ошибка загрузки настроек:', e);
        }
    }
}

function saveSettings() {
    localStorage.setItem('yaroslavia_settings', JSON.stringify(gameState.settings));
}
