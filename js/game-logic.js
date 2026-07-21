// Игровая логика: расчёты, режимы, очки

// Формула Haversine для расчёта расстояния между двумя точками (в км)
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Радиус Земли в км
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRad(deg) {
    return deg * (Math.PI / 180);
}

// Расчёт очков (максимум 5000, минимум 0)
function calculateScore(distanceKm) {
    const maxScore = 5000;
    if (distanceKm <= 0.5) return maxScore;
    if (distanceKm >= 200) return 0;
    
    const score = maxScore * Math.exp(-distanceKm / 50);
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
        .trim();
}

// Проверка названия места - возвращает массив всех совпадений
function checkPlaceName(input, locations) {
    const normalized = normalizeString(input);
    const matches = [];
    
    for (const loc of locations) {
        const locNorm = normalizeString(loc.name);
        if (normalized === locNorm) {
            matches.push(loc);
        } else if (locNorm.includes(normalized) || normalized.includes(locNorm)) {
            if (normalized.length >= 4) {
                matches.push(loc);
            }
        }
    }
    return matches;
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
const gameState = {
    mode: 'geoguesser',
    isPlaying: false,
    roundAnswered: false,
    ggMode: 'free',
    totalRounds: 10,
    currentRound: 0,
    currentLocation: null,
    currentGuess: null,
    totalScore: 0,
    roundScores: [],
    timeLeft: 300,
    timerInterval: null,
    foundLocations: [],
    availableLocations: []
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
        gameState.timeLeft = 300;
        startTimer();
    }

    updateGameUI();
    clearAllMarkers();
    bindMapClick();
    
    // Гарантируем, что границы на месте при старте
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
    
    const scorePercent = (score / 5000) * 100;
    document.getElementById('result-line').style.setProperty('--score-percent', scorePercent + '%');

    if (score >= 4000) {
        document.getElementById('result-title').textContent = '🎉 Отлично!';
    } else if (score >= 2000) {
        document.getElementById('result-title').textContent = '👍 Хорошо!';
    } else if (score >= 500) {
        document.getElementById('result-title').textContent = '😐 Можно лучше';
    } else {
        document.getElementById('result-title').textContent = '😅 В следующий раз!';
    }

    document.getElementById('guess-panel').style.display = 'none';
    document.getElementById('round-result').style.display = 'flex';

    updateGameUI();

    const bounds = L.latLngBounds(
        [Math.min(guess.lat, target.lat), Math.min(guess.lng, target.lng)],
        [Math.max(guess.lat, target.lat), Math.max(guess.lng, target.lng)]
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
}

function startTimer() {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    
    gameState.timerInterval = setInterval(() => {
        gameState.timeLeft--;
        updateTimerDisplay();
        
        if (gameState.timeLeft <= 0) {
            clearInterval(gameState.timerInterval);
            endGame();
        }
    }, 1000);
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
    gameState.availableLocations = [...window.LOCATIONS];
    gameState.totalScore = 0;

    clearAllMarkers();
    unbindMapClick();

    // 🔥 КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: принудительно перерисовываем границу и маску
    if (typeof ensureBoundaryLayers === 'function') ensureBoundaryLayers();

    // UI
    document.getElementById('side-panel').style.display = 'flex';
    document.getElementById('guess-panel').style.display = 'none';
    document.getElementById('round-result').style.display = 'none';
    document.getElementById('round-display').textContent = `Найдено: 0/${window.LOCATIONS.length}`;
    document.getElementById('found-count').textContent = '0';
    document.getElementById('found-places').innerHTML = '';
    document.getElementById('place-input').value = '';
    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';

    updateGameUI();
}

function submitPlaceName() {
    const input = document.getElementById('place-input');
    const feedback = document.getElementById('feedback');
    const value = input.value.trim();

    if (!value) return;

    const matches = checkPlaceName(value, gameState.availableLocations);
    
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

    newMatches.forEach(found => {
        gameState.foundLocations.push(found);
        gameState.totalScore += 500;
        addFoundMarker(found.lat, found.lng, found.name);
        
        const li = document.createElement('li');
        li.textContent = found.name;
        li.classList.add('fade-in');
        document.getElementById('found-places').appendChild(li);
    });

    document.getElementById('found-count').textContent = gameState.foundLocations.length;
    document.getElementById('round-display').textContent = `Найдено: ${gameState.foundLocations.length}/${window.LOCATIONS.length}`;

    if (newMatches.length === 1) {
        feedback.textContent = `✅ Верно! ${newMatches[0].name}`;
    } else {
        const names = newMatches.map(l => l.name).join(', ');
        feedback.textContent = `✅ Найдено ${newMatches.length} места: ${names}`;
    }
    feedback.className = 'feedback success';

    if (newMatches.length === 1) {
        map.setView([newMatches[0].lat, newMatches[0].lng], 12);
    } else {
        const bounds = L.latLngBounds(newMatches.map(l => [l.lat, l.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 11 });
    }

    if (gameState.foundLocations.length >= window.LOCATIONS.length) {
        setTimeout(() => endGame(), 1000);
    }

    input.value = '';
    input.focus();
    updateGameUI();
}

// === ОБЩАЯ ЛОГИКА ===
function updateGameUI() {
    document.getElementById('score-display').textContent = `Очки: ${gameState.totalScore}`;
    
    if (gameState.mode === 'geoguesser') {
        if (gameState.ggMode === 'time') {
            document.getElementById('timer-display').classList.remove('hidden');
        } else {
            document.getElementById('timer-display').classList.add('hidden');
        }
    } else {
        document.getElementById('timer-display').classList.add('hidden');
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

    document.getElementById('final-score').textContent = gameState.totalScore;
    
    if (gameState.mode === 'geoguesser') {
        const avgScore = gameState.roundScores.length > 0 
            ? gameState.roundScores.reduce((a, b) => a + b, 0) / gameState.roundScores.length 
            : 0;
        const accuracy = Math.round((avgScore / 5000) * 100);
        document.getElementById('final-accuracy').textContent = accuracy + '%';
        document.getElementById('final-rounds').textContent = gameState.roundScores.length;
    } else {
        const accuracy = Math.round((gameState.foundLocations.length / window.LOCATIONS.length) * 100);
        document.getElementById('final-accuracy').textContent = accuracy + '%';
        document.getElementById('final-rounds').textContent = gameState.foundLocations.length;
    }
}

function saveScore() {
    const name = document.getElementById('player-name').value.trim() || 'Аноним';
    
    let leaderboard = JSON.parse(localStorage.getItem('yaroslavia_leaderboard') || '[]');
    
    leaderboard.push({
        name: name,
        score: gameState.totalScore,
        mode: gameState.mode === 'geoguesser' ? 'ГеоКвест' : 'Знаток Ярославщины',
        date: new Date().toLocaleDateString('ru-RU'),
        rounds: gameState.mode === 'geoguesser' ? gameState.roundScores.length : gameState.foundLocations.length
    });

    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 50);
    
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