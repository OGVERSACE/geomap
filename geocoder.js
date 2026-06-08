// geocoder.js - улучшенная версия с приоритетом города и региона

class DaDataGeocoder {
    constructor() {
        // ВСТАВЬТЕ ВАШ API КЛЮЧ ОТ DADATA
        this.apiKey = 'fa83cc37685150772e8f5aba9fffbab33a5e8ef4';
        this.apiUrl = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
    }
    
    // Расшифровка сокращений
    expandStreetName(street) {
        const abbreviations = {
            'ул': 'улица', 'ул.': 'улица',
            'пр-кт': 'проспект', 'пр-т': 'проспект', 'пр': 'проспект', 'пр.': 'проспект',
            'пер': 'переулок', 'пер.': 'переулок',
            'б-р': 'бульвар', 'бул': 'бульвар', 'бул.': 'бульвар',
            'наб': 'набережная', 'наб.': 'набережная',
            'пл': 'площадь', 'пл.': 'площадь',
            'ш': 'шоссе', 'ш.': 'шоссе',
            'ал': 'аллея', 'ал.': 'аллея',
            'туп': 'тупик', 'туп.': 'тупик',
            'б': 'большая', 'б.': 'большая',
            'м': 'малая', 'м.': 'малая',
            'в': 'верхняя', 'в.': 'верхняя',
            'н': 'нижняя', 'н.': 'нижняя',
            'нов': 'новая', 'нов.': 'новая',
            'ст': 'старая', 'ст.': 'старая'
        };
        
        const words = street.split(' ');
        for (let i = 0; i < words.length; i++) {
            const lowerWord = words[i].toLowerCase();
            if (abbreviations[lowerWord]) {
                words[i] = abbreviations[lowerWord];
            }
        }
        return words.join(' ');
    }
    
    // Нормализация номера дома (дроби, буквы)
    normalizeHouseNumber(house, building) {
        let normalizedHouse = house;
        let normalizedBuilding = building;
        
        // Если в корпусе есть дробь вида "11/118"
        if (normalizedBuilding && /^\d+\/\d+$/.test(normalizedBuilding)) {
            normalizedHouse = `${normalizedHouse}/${normalizedBuilding}`;
            normalizedBuilding = '';
        }
        // Если в корпусе есть буква, а в доме нет
        else if (normalizedBuilding && /[А-Яа-я]/.test(normalizedBuilding) && !/[А-Яа-я]/.test(normalizedHouse)) {
            const letter = normalizedBuilding.match(/[А-Яа-я]+/);
            if (letter) {
                normalizedHouse = normalizedHouse + letter[0];
                normalizedBuilding = normalizedBuilding.replace(/[А-Яа-я]+/, '');
            }
        }
        // Если в доме уже есть буква, оставляем как есть
        
        return { house: normalizedHouse, building: normalizedBuilding };
    }
    
    async geocodeAddress(street, house, building, city = '') {
        const expandedStreet = this.expandStreetName(street);
        const normalized = this.normalizeHouseNumber(house, building);
        
        // Строим варианты адресов для поиска (от самого точного к менее точному)
        const queries = [];
        
        // Вариант 1: Город + полный адрес
        if (city && city.trim() !== '') {
            queries.push({
                query: `${city} ${expandedStreet} ${normalized.house}`,
                priority: 1,
                useCityFilter: true
            });
            
            // С корпусом
            if (normalized.building) {
                queries.push({
                    query: `${city} ${expandedStreet} ${normalized.house} корпус ${normalized.building}`,
                    priority: 1,
                    useCityFilter: true
                });
            }
        }
        
        // Вариант 2: Только улица + дом (без города)
        queries.push({
            query: `${expandedStreet} ${normalized.house}`,
            priority: 2,
            useCityFilter: false
        });
        
        // Вариант 3: Исходный адрес (без расшифровки)
        queries.push({
            query: `${street} ${house}`,
            priority: 3,
            useCityFilter: false
        });
        
        // Сортируем по приоритету
        queries.sort((a, b) => a.priority - b.priority);
        
        let bestResult = null;
        let bestScore = -1;
        
        for (const q of queries) {
            console.log(`🔍 Попытка ${q.priority}: ${q.query}`);
            
            const result = await this.makeRequest(q.query, q.useCityFilter ? city : '');
            
            if (result.success && result.score > bestScore) {
                bestScore = result.score;
                bestResult = result;
                console.log(`   ✅ Найдено (оценка: ${result.score}): ${result.address}`);
                
                // Если оценка максимальная, прерываем поиск
                if (result.score >= 0.9) break;
            }
        }
        
        if (bestResult) {
            return bestResult;
        }
        
        return { success: false, error: 'Адрес не найден' };
    }
    
    async makeRequest(query, cityFilter) {
        try {
            const requestBody = { query: query, count: 10 };
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Token ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) throw new Error(`Ошибка ${response.status}`);
            
            const data = await response.json();
            
            if (data.suggestions && data.suggestions.length > 0) {
                let candidates = data.suggestions;
                
                // Фильтрация по городу (если указан)
                if (cityFilter && cityFilter.trim() !== '') {
                    const cityLower = cityFilter.toLowerCase();
                    candidates = candidates.filter(s => {
                        const dataCity = (s.data.city || s.data.settlement || s.data.region || '').toLowerCase();
                        return dataCity.includes(cityLower);
                    });
                }
                
                if (candidates.length > 0) {
                    // Выбираем лучший результат по оценке
                    let best = candidates[0];
                    let bestScore = this.calculateScore(best, query, cityFilter);
                    
                    for (let i = 1; i < candidates.length; i++) {
                        const score = this.calculateScore(candidates[i], query, cityFilter);
                        if (score > bestScore) {
                            bestScore = score;
                            best = candidates[i];
                        }
                    }
                    
                    if (best.data && best.data.geo_lat && best.data.geo_lon) {
                        return {
                            success: true,
                            lat: parseFloat(best.data.geo_lat),
                            lon: parseFloat(best.data.geo_lon),
                            address: best.value,
                            city: best.data.city || best.data.settlement || cityFilter,
                            score: bestScore
                        };
                    }
                }
            }
            
            return { success: false, error: 'Адрес не найден', score: 0 };
            
        } catch (error) {
            console.error('Ошибка запроса:', error);
            return { success: false, error: error.message, score: 0 };
        }
    }
    
    // Оценка качества результата (0-1)
    calculateScore(suggestion, query, cityFilter) {
        let score = 0.5;
        
        // Проверяем точность координат
        if (suggestion.data.geo_lat && suggestion.data.geo_lon) {
            score += 0.2;
        }
        
        // Проверяем город
        if (cityFilter) {
            const dataCity = (suggestion.data.city || suggestion.data.settlement || '').toLowerCase();
            if (dataCity === cityFilter.toLowerCase()) {
                score += 0.3;
            } else if (dataCity.includes(cityFilter.toLowerCase())) {
                score += 0.15;
            }
        }
        
        // Проверяем улицу (примерное совпадение)
        const streetMatch = suggestion.data.street_type_name && suggestion.data.street_name;
        if (streetMatch) {
            score += 0.1;
        }
        
        return Math.min(score, 1.0);
    }
}

const geocodeCache = new Map();

async function geocodeAddressWithCache(street, house, building, city = '') {
    const cacheKey = `${city}|${street}|${house}|${building}`.toLowerCase().trim();
    if (geocodeCache.has(cacheKey)) {
        console.log(`📦 Кэш: ${cacheKey}`);
        return geocodeCache.get(cacheKey);
    }
    const geocoder = new DaDataGeocoder();
    const result = await geocoder.geocodeAddress(street, house, building, city);
    geocodeCache.set(cacheKey, result);
    return result;
}
