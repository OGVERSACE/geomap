// geocoder.js - ИСПРАВЛЕННАЯ ВЕРСИЯ (работает с CORS)

class DaDataGeocoder {
    constructor() {
        // Только API ключ, секретный ключ НЕ НУЖЕН для этого API
        this.apiKey = 'fa83cc37685150772e8f5aba9fffbab33a5e8ef4';  // ВСТАВЬТЕ ВАШ КЛЮЧ СЮДА
        // Используем API подсказок (поддерживает CORS)
        this.apiUrl = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';
    }
    
    async geocodeAddress(street, house, building, city = '') {
        // Формируем адрес для поиска
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
                    // ВАЖНО: НЕТ заголовка X-Secret!
                },
                body: JSON.stringify({
                    query: query,
                    count: 5  // Ищем до 5 вариантов
                })
            });
            
            if (!response.ok) {
                throw new Error(`Ошибка ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.suggestions && data.suggestions.length > 0) {
                // Берём первый найденный адрес
                const suggestion = data.suggestions[0];
                
                // Проверяем, есть ли координаты
                if (suggestion.data && suggestion.data.geo_lat && suggestion.data.geo_lon) {
                    return {
                        success: true,
                        lat: parseFloat(suggestion.data.geo_lat),
                        lon: parseFloat(suggestion.data.geo_lon),
                        address: suggestion.value,
                        confidence: suggestion.data.qc_geo || 0
                    };
                }
            }
            
            return {
                success: false,
                error: 'Адрес не найден или нет координат'
            };
            
        } catch (error) {
            console.error('Ошибка геокодирования:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Кэширование результатов
const geocodeCache = new Map();

async function geocodeAddressWithCache(street, house, building, city = '') {
    const cacheKey = `${city}|${street}|${house}|${building}`.toLowerCase().trim();
    
    if (geocodeCache.has(cacheKey)) {
        console.log('Из кэша:', cacheKey);
        return geocodeCache.get(cacheKey);
    }
    
    const geocoder = new DaDataGeocoder();
    const result = await geocoder.geocodeAddress(street, house, building, city);
    
    geocodeCache.set(cacheKey, result);
    return result;
}