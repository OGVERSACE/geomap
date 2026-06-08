// geocoder.js - улучшенная версия с поддержкой города, сокращений и дробей

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
        
        let expanded = street;
        const words = street.split(' ');
        for (let i = 0; i < words.length; i++) {
            const lowerWord = words[i].toLowerCase();
            if (abbreviations[lowerWord]) {
                words[i] = abbreviations[lowerWord];
            }
        }
        expanded = words.join(' ');
        
        if (expanded !== street) {
            console.log(`📝 Расшифровка: "${street}" → "${expanded}"`);
        }
        return expanded;
    }
    
    async geocodeAddress(street, house, building, city = '') {
        const expandedStreet = this.expandStreetName(street);
        
        let formattedHouse = house;
        let formattedBuilding = building;
        
        // Обработка дроби в корпусе
        if (formattedBuilding && /^\d+\/\d+$/.test(formattedBuilding)) {
            formattedHouse = `${formattedHouse}/${formattedBuilding}`;
            formattedBuilding = '';
        }
        
        // Обработка буквы в корпусе
        if (formattedBuilding && /[А-Яа-я]/.test(formattedBuilding) && !/[А-Яа-я]/.test(formattedHouse)) {
            const letter = formattedBuilding.match(/[А-Яа-я]+/);
            if (letter) {
                formattedHouse = formattedHouse + letter[0];
                formattedBuilding = formattedBuilding.replace(/[А-Яа-я]+/, '');
            }
        }
        
        let query = '';
        if (city && city.trim() !== '') {
            query = `${city} `;
        }
        query += `${expandedStreet} ${formattedHouse}`;
        if (formattedBuilding && formattedBuilding.trim() !== '') {
            query += ` корпус ${formattedBuilding}`;
        }
        
        console.log(`🔍 Поиск: ${query} (город: ${city || 'не указан'})`);
        
        let result = await this.makeRequest(query, city);
        
        if (!result.success && city && city.trim() !== '') {
            console.log(`⚠️ Повторный поиск без города: ${expandedStreet} ${formattedHouse}`);
            result = await this.makeRequest(`${expandedStreet} ${formattedHouse}`, '');
        }
        
        if (!result.success) {
            console.log(`⚠️ Повторный поиск с исходным адресом: ${street} ${house}`);
            let fallbackQuery = '';
            if (city && city.trim() !== '') fallbackQuery = `${city} `;
            fallbackQuery += `${street} ${house}`;
            if (building && building.trim() !== '') fallbackQuery += ` корпус ${building}`;
            result = await this.makeRequest(fallbackQuery, city);
        }
        
        return result;
    }
    
    async makeRequest(query, city) {
        try {
            const requestBody = { query: query, count: 5 };
            if (city && city.trim() !== '') {
                requestBody.from_bound = { value: "city" };
                requestBody.to_bound = { value: "city" };
            }
            
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
                let filtered = data.suggestions;
                if (city && city.trim() !== '') {
                    const cityLower = city.toLowerCase();
                    filtered = data.suggestions.filter(s => {
                        const dataCity = (s.data.city || s.data.settlement || '').toLowerCase();
                        return dataCity.includes(cityLower) || cityLower.includes(dataCity);
                    });
                }
                
                if (filtered.length > 0) {
                    const suggestion = filtered[0];
                    if (suggestion.data && suggestion.data.geo_lat && suggestion.data.geo_lon) {
                        return {
                            success: true,
                            lat: parseFloat(suggestion.data.geo_lat),
                            lon: parseFloat(suggestion.data.geo_lon),
                            address: suggestion.value,
                            city: suggestion.data.city || suggestion.data.settlement || city
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
