const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    parseOknCoordinates,
    parseOknTypologies,
    parseOknDocuments,
    extractOknMunicipality,
    classifyOknEra,
    normalizeOknRecord,
    filterOknRecords,
    sortOknRecords,
    computeOknDashboardStats
} = require('../js/okn-logic.js');

test('parseOknCoordinates: converts GeoJSON [lng, lat] point string to { lat, lng }', () => {
    const coords = parseOknCoordinates('{"coordinates":[39.896274580356355,57.62336270747278],"type":"Point"}');
    assert.ok(coords);
    assert.equal(coords.lat, 57.62336270747278);
    assert.equal(coords.lng, 39.896274580356355);

    assert.equal(parseOknCoordinates(''), null);
    assert.equal(parseOknCoordinates(null), null);
    assert.equal(parseOknCoordinates('invalid json'), null);
    assert.equal(parseOknCoordinates('{"coordinates":[200,95],"type":"Point"}'), null);
});

test('parseOknTypologies: parses JSON string array of typology objects', () => {
    const raw = '[{"id":1,"value":"Памятник археологии"},{"id":2,"value":"Памятник истории"}]';
    const result = parseOknTypologies(raw);
    assert.deepEqual(result, ['Памятник археологии', 'Памятник истории']);
    assert.deepEqual(parseOknTypologies(''), ['Не указана']);
    assert.deepEqual(parseOknTypologies(null), ['Не указана']);
});

test('extractOknMunicipality: identifies Yaroslavl Oblast cities and districts', () => {
    assert.equal(
        extractOknMunicipality('Ярославская область, г. Ярославль, ул. Советская, д. 14', 'Дом жилой'),
        'Ярославль'
    );
    assert.equal(
        extractOknMunicipality('Ярославская область, г. Рыбинск, ул. Крестовая, д. 25', 'Здание биржи'),
        'Рыбинск'
    );
    assert.equal(
        extractOknMunicipality('Ярославская область, Ростовский район, г. Ростов, Кремль', 'Успенский собор'),
        'Ростов Великий и район'
    );
    assert.equal(
        extractOknMunicipality('', 'Городище у села Борисоглебское'),
        'Адрес не указан (археология)'
    );
});

test('classifyOknEra: categorizes creation dates into historical eras', () => {
    assert.equal(classifyOknEra('IV - III тыс. до н. э.', ['Памятник археологии']), 'Древность и археология');
    assert.equal(classifyOknEra('XVI в.', ['Памятник градостроительства и архитектуры']), 'Древняя Русь (X–XVI вв.)');
    assert.equal(classifyOknEra('1684 г.', ['Памятник градостроительства и архитектуры']), 'XVII век');
    assert.equal(classifyOknEra('конец XVIII в.', ['Памятник градостроительства и архитектуры']), 'XVIII век');
    assert.equal(classifyOknEra('1856 г., вторая половина XIX в.', ['Памятник градостроительства и архитектуры']), 'XIX век');
    assert.equal(classifyOknEra('1912 г.', ['Памятник истории']), 'XX век');
});

test('normalizeOknRecord, filterOknRecords, and computeOknDashboardStats work on real okn_list.json records', () => {
    const dataPath = path.join(__dirname, '..', 'data', 'okn_list.json');
    const rawList = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    assert.equal(rawList.length, 2484);

    const records = rawList.map((raw, idx) => normalizeOknRecord(raw, idx));
    const stats = computeOknDashboardStats(records);

    assert.equal(stats.total, 2484);
    assert.equal(stats.withCoords, 1086);
    assert.equal(stats.withoutCoords, 2484 - 1086);
    assert.equal(stats.unesco, 27);
    assert.equal(stats.wwii, 52);
    assert.ok(Array.isArray(stats.byCategory));
    assert.ok(Array.isArray(stats.byMunicipality));

    // Filter only records with map coordinates
    const onlyOnMap = filterOknRecords(records, {
        onlyWithCoords: true
    });
    assert.equal(onlyOnMap.length, 1086);
    assert.ok(onlyOnMap.every((r) => r.hasCoords));

    // Filter UNESCO records
    const onlyUnesco = filterOknRecords(records, {
        onlyUnesco: true
    });
    assert.equal(onlyUnesco.length, 27);

    // Search filter
    const searchRostov = filterOknRecords(records, {
        search: 'Кремль'
    });
    assert.ok(searchRostov.length > 0);

    // Sort check
    const sortedAsc = sortOknRecords(onlyUnesco, 'name-asc');
    assert.ok(sortedAsc[0].name.localeCompare(sortedAsc[sortedAsc.length - 1].name, 'ru') <= 0);
});
