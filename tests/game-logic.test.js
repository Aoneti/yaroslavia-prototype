const test = require('node:test');
const assert = require('node:assert/strict');
const {
  haversineDistance,
  calculateScore,
  normalizeString,
  checkPlaceName,
  shuffleArray,
  getDefaultHint,
} = require('../js/game-logic.js');

const SAMPLE_LOCATIONS = [
  { id: 1, name: 'Ярославль', lat: 57.6264, lng: 39.8934, type: 'city' },
  { id: 2, name: 'Ростов Великий', lat: 57.186, lng: 39.425, type: 'town' },
  { id: 3, name: 'Переславль-Залесский', lat: 56.7367, lng: 38.8463, type: 'town' },
  { id: 4, name: 'Зелёная Роща', lat: 57.5567, lng: 38.3361, type: 'village' },
  { id: 5, name: 'Захарово', lat: 57.7185, lng: 40.6693, type: 'hamlet' },
  { id: 6, name: 'Захарово', lat: 56.8699, lng: 38.3068, type: 'hamlet' },
  { id: 7, name: 'Углич', lat: 57.5268, lng: 38.3167, type: 'town' },
];

test('haversineDistance computes accurate distances in km', () => {
  assert.equal(haversineDistance(57.6264, 39.8934, 57.6264, 39.8934), 0);
  const yaroToRostov = haversineDistance(57.6264, 39.8934, 57.186, 39.425);
  assert.ok(yaroToRostov > 52 && yaroToRostov < 60, `Expected ~56km, got ${yaroToRostov}`);
});

test('calculateScore awards max inside perfect radius, zero beyond max, and decays smoothly', () => {
  assert.equal(calculateScore(0), 5000);
  assert.equal(calculateScore(0.5), 5000);
  assert.equal(calculateScore(200), 0);
  assert.equal(calculateScore(300), 0);
  const mid = calculateScore(50);
  assert.ok(mid > 1800 && mid < 1900, `Expected ~1839, got ${mid}`);
});

test('normalizeString handles case, ё/е, dashes, and punctuation', () => {
  assert.equal(normalizeString('  Зелёная   Роща! '), 'зеленая роща');
  assert.equal(normalizeString('Переславль-Залесский'), 'переславль залесский');
});

test('checkPlaceName matches exact names, homonyms, and unambiguous prefixes', () => {
  const exact = checkPlaceName('ярославль', SAMPLE_LOCATIONS);
  assert.equal(exact.length, 1);
  assert.equal(exact[0].id, 1);

  const yo = checkPlaceName('зеленая роща', SAMPLE_LOCATIONS);
  assert.equal(yo.length, 1);
  assert.equal(yo[0].id, 4);

  const homonyms = checkPlaceName('Захарово', SAMPLE_LOCATIONS);
  assert.equal(homonyms.length, 2);

  const uniquePrefix = checkPlaceName('Переслав', SAMPLE_LOCATIONS);
  assert.equal(uniquePrefix.length, 1);
  assert.equal(uniquePrefix[0].id, 3);

  const tooShort = checkPlaceName('Яр', SAMPLE_LOCATIONS);
  assert.equal(tooShort.length, 0);

  const missing = checkPlaceName('НесуществующийГород', SAMPLE_LOCATIONS);
  assert.equal(missing.length, 0);
});

test('shuffleArray preserves all items without mutating input', () => {
  const input = [1, 2, 3, 4, 5];
  const output = shuffleArray(input);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.deepEqual([...output].sort((a, b) => a - b), input);
});

test('getDefaultHint returns Russian labels for known and fallback types', () => {
  assert.equal(getDefaultHint('city'), 'Крупный город Ярославской области');
  assert.equal(getDefaultHint('unknown'), 'Населённый пункт Ярославской области');
});
