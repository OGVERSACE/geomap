// geocoder.js - простая надёжная версия

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
        
        let fullHouse = house;
        if (building && building.trim() !== '') {
            fullHouse = `${house}/${building}`;
        }
        
        let query = '';
        if (city && city.trim() !== '') {
            query = `${city}, ${expandedStreet} ${fullHouse}`;
        } else {
            query = `${expandedStreet} ${fullHouse}`;
        }
        
        console.log(`🔍 Поиск: ${query}`);
        
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Token ${this.apiKey}`
                },
                body: JSON.stringify({ query: query, count: 5 })
            });
            
            if (!response.ok) throw new Error(`Ошибка ${response.status}`);
            
            const data = await response.json();
            
            if (data.suggestions && data.suggestions.length > 0) {
                const suggestion = data.suggestions[0];
                if (suggestion.data && suggestion.data.geo_lat && suggestion.data.geo_lon) {
                    return {
                        success: true,
                        lat: parseFloat(suggestion.data.geo_lat),
                        lon: parseFloat(suggestion.data.geo_lon),
                        address: suggestion.value
                    };
                }
            }
            
            // Если не нашли с расшифрованной улицей, пробуем с исходной
            if (expandedStreet !== street) {
                let fallbackQuery = '';
                if (city && city.trim() !== '') {
                    fallbackQuery = `${city}, ${street} ${fullHouse}`;
                } else {
                    fallbackQuery = `${street} ${fullHouse}`;
                }
                console.log(`🔍 Повторный поиск: ${fallbackQuery}`);
                
                const fallbackResponse = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': `Token ${this.apiKey}`
                    },
                    body: JSON.stringify({ query: fallbackQuery, count: 5 })
                });
                
                const fallbackData = await fallbackResponse.json();
                if (fallbackData.suggestions && fallbackData.suggestions.length > 0) {
                    const suggestion = fallbackData.suggestions[0];
                    if (suggestion.data && suggestion.data.geo_lat && suggestion.data.geo_lon) {
                        return {
                            success: true,
                            lat: parseFloat(suggestion.data.geo_lat),
                            lon: parseFloat(suggestion.data.geo_lon),
                            address: suggestion.value
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
