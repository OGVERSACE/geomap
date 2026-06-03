// geocoder.js - работа с DaData API

class DaDataGeocoder {
    constructor() {
        // ВСТАВЬТЕ ВАШ КЛЮЧ DADATA СЮДА
        this.apiKey = 'fa83cc37685150772e8f5aba9fffbab33a5e8ef4';
        this.apiUrl = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
    }
    
    async geocodeAddress(street, house, building, city = '') {
        let query = '';
        if (city && city.trim() !== '') {
            query += city + ' ';
        }
        query += `${street} ${house}`;
        if (building && building.trim() !== '') {
            query += ` корпус ${building}`;
        }
        
        console.log('Ищем:', query);
        
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
            
            if (!response.ok) {
                throw new Error(`Ошибка ${response.status}`);
            }
            
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
        return geocodeCache.get(cacheKey);
    }
    const geocoder = new DaDataGeocoder();
    const result = await geocoder.geocodeAddress(street, house, building, city);
    geocodeCache.set(cacheKey, result);
    return result;
}
