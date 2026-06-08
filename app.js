// geocoder.js - улучшенная версия с приоритетом города

class DaDataGeocoder {
    constructor() {
        this.apiKey = 'fa83cc37685150772e8f5aba9fffbab33a5e8ef4';
        this.apiUrl = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
    }
    
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
    
    async geocodeAddress(street, house, building, city = '') {
        const expandedStreet = this.expandStreetName(street);
        
        let formattedHouse = house;
        let formattedBuilding = building;
        
        if (formattedBuilding && /^\d+\/\d+$/.test(formattedBuilding)) {
            formattedHouse = `${formattedHouse}/${formattedBuilding}`;
            formattedBuilding = '';
        }
        
        if (formattedBuilding && /[А-Яа-я]/.test(formattedBuilding) && !/[А-Яа-я]/.test(formattedHouse)) {
            const letter = formattedBuilding.match(/[А-Яа-я]+/);
            if (letter) {
                formattedHouse = formattedHouse + letter[0];
                formattedBuilding = formattedBuilding.replace(/[А-Яа-я]+/, '');
            }
        }
        
        const queries = [];
        
        if (city && city.trim() !== '') {
            queries.push({
                query: `${city} ${expandedStreet} ${formattedHouse}`,
                priority: 1
            });
            if (formattedBuilding) {
                queries.push({
                    query: `${city} ${expandedStreet} ${formattedHouse} корпус ${formattedBuilding}`,
                    priority: 1
                });
            }
        }
        
        queries.push({
            query: `${expandedStreet} ${formattedHouse}`,
            priority: 2
        });
        
        queries.push({
            query: `${street} ${house}`,
            priority: 3
        });
        
        queries.sort((a, b) => a.priority - b.priority);
        
        for (const q of queries) {
            console.log(`🔍 Поиск: ${q.query}`);
            const result = await this.makeRequest(q.query, city);
            if (result.success) {
                console.log(`   ✅ Найдено: ${result.address}`);
                return result;
            }
        }
        
        return { success: false, error: 'Адрес не найден' };
    }
    
    async makeRequest(query, cityFilter) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Token ${this.apiKey}`
                },
                body: JSON.stringify({ query: query, count: 10 })
            });
            
            if (!response.ok) throw new Error(`Ошибка ${response.status}`);
            
            const data = await response.json();
            
            if (data.suggestions && data.suggestions.length > 0) {
                let candidates = data.suggestions;
                
                if (cityFilter && cityFilter.trim() !== '') {
                    const cityLower = cityFilter.toLowerCase();
                    candidates = candidates.filter(s => {
                        const dataCity = (s.data.city || s.data.settlement || '').toLowerCase();
                        return dataCity.includes(cityLower);
                    });
                }
                
                if (candidates.length > 0) {
                    const best = candidates[0];
                    if (best.data && best.data.geo_lat && best.data.geo_lon) {
                        return {
                            success: true,
                            lat: parseFloat(best.data.geo_lat),
                            lon: parseFloat(best.data.geo_lon),
                            address: best.value,
                            city: best.data.city || best.data.settlement || cityFilter
                        };
                    }
                }
            }
            
            return { success: false, error: 'Адрес не найден' };
            
        } catch (error) {
            console.error('Ошибка:', error);
            return { success: false, error: error.message };
        }
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
