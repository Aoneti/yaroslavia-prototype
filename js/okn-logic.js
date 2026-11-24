// Чистая логика парсинга, нормализации, фильтрации и аналитики реестра ОКН (okn_list.json)
(function (global) {
    // Парсинг поля "На карте": '{"coordinates":[39.896274580356355,57.62336270747278],"type":"Point"}'
    function parseOknCoordinates(rawMapField) {
        if (!rawMapField || typeof rawMapField !== 'string') return null;
        const trimmed = rawMapField.trim();
        if (!trimmed) return null;
        try {
            const parsed = JSON.parse(trimmed);
            if (!parsed || !Array.isArray(parsed.coordinates) || parsed.coordinates.length < 2) {
                return null;
            }
            const lng = Number(parsed.coordinates[0]);
            const lat = Number(parsed.coordinates[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            // Координаты Ярославской области и сопредельных территорий
            if (lat < 55.0 || lat > 61.0 || lng < 35.0 || lng > 43.0) return null;
            return { lat, lng };
        } catch {
            return null;
        }
    }

    // Парсинг поля "Id-общая видовая принадлежность"
    function parseOknTypologies(rawField) {
        if (!rawField || typeof rawField !== 'string') return ['Не указана'];
        const trimmed = rawField.trim();
        if (!trimmed) return ['Не указана'];
        try {
            const arr = JSON.parse(trimmed);
            if (!Array.isArray(arr) || arr.length === 0) return ['Не указана'];
            const values = arr
                .map(item => (item && typeof item.value === 'string' ? item.value.trim() : ''))
                .filter(Boolean);
            return values.length > 0 ? Array.from(new Set(values)) : ['Не указана'];
        } catch {
            return ['Не указана'];
        }
    }

    // Парсинг документов
    function parseOknDocuments(rawField) {
        if (!rawField || typeof rawField !== 'string') return [];
        const trimmed = rawField.trim();
        if (!trimmed) return [];
        try {
            const arr = JSON.parse(trimmed);
            if (!Array.isArray(arr)) return [];
            return arr
                .filter(d => d && (d.name || d.number || d.date))
                .map(d => ({
                    name: d.name || 'Документ',
                    number: d.number || '',
                    date: d.date || '',
                    url: d.archive && d.archive.url ? d.archive.url : ''
                }));
        } catch {
            return [];
        }
    }

    // Определение города или района по адресу
    function extractOknMunicipality(address, objectName) {
        const addr = (address || '').trim();
        if (!addr) {
            return 'Адрес не указан (археология)';
        }
        const source = `${addr} ${objectName || ''}`;
        if (/ярославский\s+(р-н|район|муниципальный)/i.test(addr)) return 'Ярославский район';
        if (/рыбинский\s+(р-н|район|муниципальный)/i.test(addr)) return 'Рыбинский район';
        if (/(г\.\s*ярославль|город\s+ярославль|^ярославская\s+область,\s*г\.?\s*ярославль|ярославль\s*,)/i.test(addr)) return 'Ярославль';
        if (/(г\.\s*рыбинск|город\s+рыбинск|рыбинск\s*,)/i.test(addr)) return 'Рыбинск';
        if (/переслав/i.test(source)) return 'Переславль-Залесский';
        if (/ростов/i.test(source)) return 'Ростов Великий и район';
        if (/углич/i.test(source)) return 'Углич и район';
        if (/тутаев|романов-борисоглеб/i.test(source)) return 'Тутаев и район';
        if (/некрасовск/i.test(source)) return 'Некрасовский район';
        if (/данилов/i.test(source)) return 'Данилов и район';
        if (/гаврилов-ям|гаврилов\s+ям/i.test(source)) return 'Гаврилов-Ям и район';
        if (/любим/i.test(source)) return 'Любим и район';
        if (/борисоглеб/i.test(source)) return 'Борисоглебский район';
        if (/мышкин/i.test(source)) return 'Мышкин и район';
        if (/пошехон/i.test(source)) return 'Пошехонье и район';
        if (/большесельск/i.test(source)) return 'Большесельский район';
        if (/брейтов/i.test(source)) return 'Брейтовский район';
        if (/некоуз/i.test(source)) return 'Некоузский район';
        if (/первомайск/i.test(source)) return 'Первомайский район';
        if (/ярославл/i.test(addr)) return 'Ярославль';
        if (/рыбинск/i.test(addr)) return 'Рыбинск';
        return 'Прочие территории области';
    }

    // Классификация исторической эпохи по полю "дата создания"
    function classifyOknEra(dateStr, typologies) {
        const s = (dateStr || '').trim().toLowerCase();
        const isArch = Array.isArray(typologies) && typologies.some(t => /археолог/i.test(t));
        if (!s) {
            return isArch ? 'Древность и археология' : 'Не датировано';
        }
        if (/до\s*н\.?\s*э|тыс\.|мезолит|неолит|бронз|железн/i.test(s)) {
            return 'Древность и археология';
        }
        if (/\b(ix|x|xi|xii|xiii|xiv|xv|xvi)\b|\b(10|11|12|13|14|15|16)\s*в/i.test(s) && !/\b(xvii|xviii|xix|xx)\b/i.test(s)) {
            return 'Древняя Русь (X–XVI вв.)';
        }
        if (/\bxvii\b|\b17\s*в|16[0-9]{2}/i.test(s)) {
            return 'XVII век';
        }
        if (/\bxviii\b|\b18\s*в|17[0-9]{2}/i.test(s)) {
            return 'XVIII век';
        }
        if (/\bxix\b|\b19\s*в|18[0-9]{2}/i.test(s)) {
            return 'XIX век';
        }
        if (/\bxx\b|\b20\s*в|19[0-9]{2}|20[0-2][0-9]/i.test(s)) {
            return 'XX век';
        }
        if (isArch) {
            return 'Древность и археология';
        }
        return 'Не датировано';
    }

    function normalizeYesNo(val) {
        return typeof val === 'string' && val.trim().toLowerCase() === 'да';
    }

    // Нормализация одной записи из okn_list.json
    function normalizeOknRecord(raw, index) {
        const name = (raw['Объект'] || 'Объект без названия').trim();
        const regNumber = (raw['Номер в реестре'] || '').trim();
        const accountNumber = (raw['учетный номер'] || '').trim();
        const address = (raw['Полный адрес'] || '').trim();
        const category = (raw['Категория историко-культурного значения'] || 'Не указана').trim();
        const objectType = (raw['Вид объекта'] || 'Памятник').trim();
        const ensemble = (raw['Принадлежность к ансамблю'] || '').trim();
        const typologies = parseOknTypologies(raw['Id-общая видовая принадлежность']);
        const primaryTypology = typologies[0] || 'Не указана';
        const coords = parseOknCoordinates(raw['На карте']);
        const creationDate = (raw['дата создания'] || '').trim();
        const description = (raw['описание предмета охраны'] || '').trim();
        const municipality = extractOknMunicipality(address, name);
        const era = classifyOknEra(creationDate, typologies);
        const isUnesco = normalizeYesNo(raw['Принадлежность к Юнеско']);
        const isValuable = normalizeYesNo(raw['Особо ценный объект']);
        const isWwii = normalizeYesNo(raw['Принадлежность к ВОВ']);
        const documents = parseOknDocuments(raw['наименование документа']);

        const searchText = [
            name,
            address,
            regNumber,
            accountNumber,
            creationDate,
            municipality,
            category,
            objectType,
            ensemble,
            typologies.join(' ')
        ]
            .join(' ')
            .toLowerCase()
            .replace(/ё/g, 'е');

        return {
            id: index,
            uid: regNumber ? `${regNumber}-${index}` : `okn-${index}`,
            index,
            name,
            regNumber,
            accountNumber,
            address,
            municipality,
            category,
            objectType,
            ensemble,
            typologies,
            primaryTypology,
            era,
            date: creationDate,
            creationDate,
            protectionSubject: description,
            description,
            coords,
            hasCoords: coords !== null,
            isUnesco,
            isValuable,
            isWwii,
            documents,
            searchText
        };
    }

    // Фильтрация записей ОКН
    function filterOknRecords(records, filters = {}) {
        const query = (filters.search || '')
            .trim()
            .toLowerCase()
            .replace(/ё/g, 'е');
        const category = filters.category || 'all';
        const objectType = filters.objectType || 'all';
        const typology = filters.typology || 'all';
        const municipality = filters.municipality || 'all';
        const era = filters.era || 'all';
        const onlyWithCoords = Boolean(filters.onlyWithCoords);
        const onlyUnesco = Boolean(filters.onlyUnesco);
        const onlyWwii = Boolean(filters.onlyWwii);

        return records.filter(rec => {
            if (onlyWithCoords && !rec.hasCoords) return false;
            if (onlyUnesco && !rec.isUnesco) return false;
            if (onlyWwii && !rec.isWwii) return false;
            if (category !== 'all' && rec.category !== category) return false;
            if (objectType !== 'all' && rec.objectType !== objectType) return false;
            if (typology !== 'all' && !rec.typologies.includes(typology)) return false;
            if (municipality !== 'all' && rec.municipality !== municipality) return false;
            if (era !== 'all' && rec.era !== era) return false;
            if (query) {
                if (rec.searchText.includes(query)) return true;
                if (rec.description && rec.description.toLowerCase().replace(/ё/g, 'е').includes(query)) {
                    return true;
                }
                return false;
            }
            return true;
        });
    }

    // Сортировка записей ОКН
    function sortOknRecords(records, sortBy = 'default') {
        const copy = [...records];
        if (sortBy === 'name-asc' || sortBy === 'name_asc') {
            copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        } else if (sortBy === 'name-desc' || sortBy === 'name_desc') {
            copy.sort((a, b) => b.name.localeCompare(a.name, 'ru'));
        } else if (sortBy === 'category') {
            const rank = {
                'Федерального значения': 1,
                'Регионального значения': 2,
                'Местного (муниципального) значения': 3
            };
            copy.sort((a, b) => (rank[a.category] || 9) - (rank[b.category] || 9) || a.name.localeCompare(b.name, 'ru'));
        } else if (sortBy === 'municipality') {
            copy.sort((a, b) => a.municipality.localeCompare(b.municipality, 'ru') || a.name.localeCompare(b.name, 'ru'));
        } else if (sortBy === 'reg_number') {
            copy.sort((a, b) => (a.regNumber || 'Я').localeCompare(b.regNumber || 'Я', 'ru'));
        } else {
            // default: сначала на карте и особо ценные/ЮНЕСКО, затем по названию
            copy.sort((a, b) =>
                Number(b.hasCoords) - Number(a.hasCoords) ||
                Number(b.isUnesco) - Number(a.isUnesco) ||
                a.name.localeCompare(b.name, 'ru')
            );
        }
        return copy;
    }

    function toSortedArray(countsObj) {
        return Object.entries(countsObj)
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
    }

    // Расчёт статистики и распределений для дашборда
    function computeOknDashboardStats(records) {
        const byCategoryMap = {};
        const byTypeMap = {};
        const byTypologyMap = {};
        const byMunicipalityMap = {};
        const byEraMap = {};

        let withCoords = 0;
        let withoutCoords = 0;
        let federal = 0;
        let regional = 0;
        let local = 0;
        let unesco = 0;
        let wwii = 0;

        for (const r of records) {
            if (r.hasCoords) withCoords++;
            else withoutCoords++;

            if (r.category === 'Федерального значения') federal++;
            else if (r.category === 'Регионального значения') regional++;
            else if (r.category === 'Местного (муниципального) значения') local++;

            if (r.isUnesco) unesco++;
            if (r.isWwii) wwii++;

            byCategoryMap[r.category] = (byCategoryMap[r.category] || 0) + 1;
            byTypeMap[r.objectType] = (byTypeMap[r.objectType] || 0) + 1;
            byMunicipalityMap[r.municipality] = (byMunicipalityMap[r.municipality] || 0) + 1;
            byEraMap[r.era] = (byEraMap[r.era] || 0) + 1;

            for (const t of r.typologies) {
                byTypologyMap[t] = (byTypologyMap[t] || 0) + 1;
            }
        }

        const byCategory = toSortedArray(byCategoryMap);
        const byType = toSortedArray(byTypeMap);
        const byTypology = toSortedArray(byTypologyMap);
        const byMunicipality = toSortedArray(byMunicipalityMap);
        const byEra = toSortedArray(byEraMap);

        return {
            total: records.length,
            withCoords,
            withoutCoords,
            federal,
            regional,
            local,
            unesco,
            wwii,
            byCategory,
            byType,
            byObjectType: byType,
            byTypology,
            byMunicipality,
            byEra
        };
    }

    const api = {
        parseOknCoordinates,
        parseOknTypologies,
        parseOknDocuments,
        extractOknMunicipality,
        classifyOknEra,
        normalizeOknRecord,
        filterOknRecords,
        sortOknRecords,
        computeOknDashboardStats
    };

    global.OknLogic = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
