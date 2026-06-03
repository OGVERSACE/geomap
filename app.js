// app.js - с нумерацией точек и подсветкой дубликатов

let map;
let markers = [];
let markerData = [];
let addressData = [];
let mapReady = false;
let selectedMarkerIndexes = new Set();
let isRestoringFromURL = false;

// Инициализация карты
function initMap() {
    ymaps.ready(function() {
        map = new ymaps.Map('map', {
            center: [55.751244, 37.618423],
            zoom: 10,
            controls: ['zoomControl', 'fullscreenControl']
        });
        mapReady = true;
        
        map.events.add(['boundschange', 'actionend'], function() {
            if (!isRestoringFromURL) {
                saveStateToURL();
            }
        });
        
        restoreStateFromURL();
        console.log('Карта готова');
    });
}

// Функция для поиска дубликатов адресов
function findDuplicateAddresses() {
    const addressMap = new Map();
    const duplicates = new Set();
    
    // Сначала собираем все адреса
    for (let i = 0; i < addressData.length; i++) {
        const item = addressData[i];
        if (item.geocodeSuccess) {
            // Ключ для сравнения: улица + дом + корпус (без учёта регистра)
            const key = `${item.street.toLowerCase()}|${item.house}|${item.building || ''}`;
            if (addressMap.has(key)) {
                duplicates.add(i);
                duplicates.add(addressMap.get(key));
            } else {
                addressMap.set(key, i);
            }
        }
    }
    
    return duplicates;
}

// Сохранение состояния в URL
function saveStateToURL() {
    if (!mapReady || !map) return;
    
    const center = map.getCenter();
    const zoom = map.getZoom();
    
    const pointsData = [];
    for (let i = 0; i < markerData.length; i++) {
        const data = markerData[i];
        if (data && data.lat && data.lon) {
            pointsData.push({
                id: i + 1, // Номер точки (1-based)
                lat: data.lat,
                lon: data.lon,
                address: data.address,
                originalAddress: data.originalAddress,
                plot: data.plot || '',
                street: addressData[i]?.street,
                house: addressData[i]?.house,
                building: addressData[i]?.building,
                city: addressData[i]?.city,
                isDuplicate: data.isDuplicate || false
            });
        }
    }
    
    const state = {
        center: [center[0], center[1]],
        zoom: zoom,
        points: pointsData
    };
    
    const stateStr = JSON.stringify(state);
    const encodedState = btoa(encodeURIComponent(stateStr));
    
    const newUrl = `${window.location.origin}${window.location.pathname}?state=${encodedState}`;
    window.history.pushState({}, '', newUrl);
}

// Восстановление состояния из URL
async function restoreStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const encodedState = urlParams.get('state');
    
    if (!encodedState) return;
    
    isRestoringFromURL = true;
    
    try {
        const stateStr = decodeURIComponent(atob(encodedState));
        const state = JSON.parse(stateStr);
        
        if (!state.points || state.points.length === 0) return;
        
        const points = state.points;
        
        clearAll();
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            
            addressData.push({
                city: point.city || '',
                street: point.street || '',
                house: point.house || '',
                building: point.building || '',
                geocodeSuccess: true,
                geocodeResult: {
                    address: point.address,
                    lat: point.lat,
                    lon: point.lon
                }
            });
            
            markerData.push({
                id: point.id || i + 1,
                address: point.address,
                originalAddress: point.originalAddress,
                plot: point.plot || null,
                lat: point.lat,
                lon: point.lon,
                isDuplicate: point.isDuplicate || false
            });
        }
        
        // Находим дубликаты после восстановления
        const duplicates = findDuplicateAddresses();
        for (let i = 0; i < markerData.length; i++) {
            if (markerData[i]) {
                markerData[i].isDuplicate = duplicates.has(i);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const isDup = markerData[i]?.isDuplicate || false;
            const marker = addMarker(point.lat, point.lon, point.address, point.originalAddress, i, i + 1, isDup);
            if (marker) markers.push(marker);
        }
        
        updateAddressList();
        updateStats();
        
        if (state.center && state.zoom) {
            map.setCenter(state.center, state.zoom);
        } else if (markers.length > 0) {
            setTimeout(() => {
                const coords = markers.map(m => m.geometry.getCoordinates());
                if (coords.length === 1) map.setCenter(coords[0], 16);
                else if (coords.length > 1) {
                    const bounds = ymaps.geoQuery(coords).getBounds();
                    if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
                }
            }, 300);
        }
        
        console.log(`Восстановлено ${points.length} точек из ссылки`);
        
    } catch (error) {
        console.error('Ошибка восстановления состояния:', error);
    } finally {
        isRestoringFromURL = false;
    }
}

// Получение ссылки на текущее состояние
function getMapLink() {
    if (!mapReady || !map) {
        alert('Карта ещё не загружена');
        return;
    }
    
    saveStateToURL();
    const url = window.location.href;
    
    navigator.clipboard.writeText(url).then(() => {
        alert('✅ Ссылка скопирована!\n\n' + url + '\n\nПри открытии ссылки карта восстановится с точками и участками.');
    }).catch(() => {
        prompt('Скопируйте ссылку вручную:', url);
    });
}

// Добавление маркера с номером на самом маркере
function addMarker(lat, lon, address, originalAddress, index, number, isDuplicate = false) {
    if (!mapReady || !map) return null;
    
    const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
    const markerColor = isDuplicate ? 'red' : (hasPlot ? 'orange' : 'green');
    
    const plotDisplay = markerData[index] && markerData[index].plot ? markerData[index].plot : 'не назначен';
    const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ВНИМАНИЕ: Дубликат адреса!</span>' : '';
    
    // Создаём кастомный макет маркера с номером
    const markerLayout = ymaps.templateLayoutFactory.createClass(
        `<div class="custom-marker" style="
            position: relative;
            cursor: pointer;
        ">
            <div style="
                background: ${isDuplicate ? '#f44336' : (hasPlot ? '#ff9800' : '#4CAF50')};
                color: white;
                font-weight: bold;
                font-size: 14px;
                font-family: Arial, sans-serif;
                text-align: center;
                line-height: 28px;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                transition: transform 0.1s;
            ">
                ${number}
            </div>
            <div style="
                position: absolute;
                bottom: -18px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0,0,0,0.6);
                color: white;
                font-size: 10px;
                padding: 2px 4px;
                border-radius: 4px;
                white-space: nowrap;
                font-family: Arial, sans-serif;
                display: ${hasPlot ? 'block' : 'none'};
            ">
                ${hasPlot ? markerData[index].plot : ''}
            </div>
        </div>`,
        {
            build: function() {
                ymaps.templateLayoutFactory.prototype.build.call(this);
                // Добавляем обработчик события для открытия балуна
                this.getParentElement().getElementsByClassName('custom-marker')[0].onclick = (e) => {
                    e.stopPropagation();
                    const coords = this.getData().geometry.getCoordinates();
                    // Открываем балун
                    this.getData().properties.balloon.open();
                };
            }
        }
    );
    
    const placemark = new ymaps.Placemark([lat, lon], {
        balloonContent: `<strong>📍 №${number}</strong><br><strong>${address}</strong><br>Исходный адрес: ${originalAddress}<br><strong>Участок: ${plotDisplay}</strong>${duplicateWarning}`,
        hintContent: `№${number}: ${originalAddress}${hasPlot ? ' [Участок ' + markerData[index].plot + ']' : ''}${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`
    }, {
        iconLayout: markerLayout,
        iconShape: { type: 'Circle', coordinates: [14, 14], radius: 14 },
        balloonMaxWidth: 350
    });
    
    placemark.events.add('click', () => {
        toggleMarkerSelection(index);
    });
    
    map.geoObjects.add(placemark);
    
    if (!isRestoringFromURL) {
        saveStateToURL();
    }
    
    return placemark;
}

// Переключение выбора маркера
function toggleMarkerSelection(index) {
    if (selectedMarkerIndexes.has(index)) {
        selectedMarkerIndexes.delete(index);
        const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
        const isDuplicate = markerData[index]?.isDuplicate || false;
        const markerColor = isDuplicate ? 'red' : (hasPlot ? 'orange' : 'green');
        markers[index].options.set('preset', `islands#${markerColor}Icon`);
    } else {
        selectedMarkerIndexes.add(index);
        markers[index].options.set('preset', 'islands#blueIcon');
    }
    updateAddressList();
    updateSelectionStats();
}

// Выделить все найденные адреса
function selectAll() {
    for (let i = 0; i < addressData.length; i++) {
        if (addressData[i].geocodeSuccess && markers[i]) {
            if (!selectedMarkerIndexes.has(i)) {
                selectedMarkerIndexes.add(i);
                markers[i].options.set('preset', 'islands#blueIcon');
            }
        }
    }
    updateAddressList();
    updateSelectionStats();
}

// Снять все выделения
function deselectAll() {
    for (let index of selectedMarkerIndexes) {
        if (markers[index]) {
            const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
            const isDuplicate = markerData[index]?.isDuplicate || false;
            const markerColor = isDuplicate ? 'red' : (hasPlot ? 'orange' : 'green');
            markers[index].options.set('preset', `islands#${markerColor}Icon`);
        }
    }
    selectedMarkerIndexes.clear();
    updateAddressList();
    updateSelectionStats();
}

// Массовое назначение участка всем выбранным
function assignPlotToSelected() {
    if (selectedMarkerIndexes.size === 0) {
        alert('Сначала выберите адреса (через чекбоксы в списке или кликом по маркерам)');
        return;
    }
    
    const plotInput = document.getElementById('plotInput');
    let selectedPlot = plotInput.value.trim();
    
    if (!selectedPlot) {
        alert('Введите номер участка (например: 1, 15, Участок А, Сектор 3)');
        return;
    }
    
    let assignedCount = 0;
    
    for (let index of selectedMarkerIndexes) {
        if (markerData[index] && addressData[index].geocodeSuccess) {
            markerData[index].plot = selectedPlot;
            const isDuplicate = markerData[index]?.isDuplicate || false;
            const markerColor = isDuplicate ? 'red' : 'orange';
            markers[index].options.set('preset', `islands#${markerColor}Icon`);
            
            const data = markerData[index];
            const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ВНИМАНИЕ: Дубликат адреса!</span>' : '';
            markers[index].properties.set({
                balloonContent: `<strong>📍 №${data.id || index + 1}</strong><br><strong>${data.address}</strong><br>Исходный адрес: ${data.originalAddress}<br><strong>Участок: ${selectedPlot}</strong>${duplicateWarning}`,
                hintContent: `№${data.id || index + 1}: ${data.originalAddress} [Участок ${selectedPlot}]${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`
            });
            
            assignedCount++;
        }
    }
    
    deselectAll();
    plotInput.value = '';
    updateAddressList();
    updateStats();
    saveStateToURL();
    
    alert(`Назначен участок "${selectedPlot}" для ${assignedCount} адресов`);
}

// Обновление статистики выбранных
function updateSelectionStats() {
    const selectedCount = selectedMarkerIndexes.size;
    const selectedSpan = document.getElementById('selectedCount');
    if (selectedSpan) {
        selectedSpan.textContent = selectedCount;
    }
}

// Обновление общей статистики
function updateStats() {
    const total = addressData.length;
    const success = addressData.filter(a => a.geocodeSuccess).length;
    const assigned = markerData.filter(m => m && m.plot && m.plot !== '').length;
    const errors = addressData.filter(a => !a.geocodeSuccess).length;
    const onMap = markers.length;
    const duplicates = markerData.filter(m => m && m.isDuplicate).length;
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('mapCount').textContent = onMap;
    document.getElementById('assignedCount').textContent = assigned;
    document.getElementById('errorCount').textContent = errors;
    
    // Добавляем отображение дубликатов, если есть
    const dupElement = document.getElementById('duplicateCount');
    if (dupElement) {
        dupElement.textContent = duplicates;
    }
}

// Обновление списка адресов с чекбоксами и нумерацией
function updateAddressList() {
    const addressListDiv = document.getElementById('addressList');
    addressListDiv.innerHTML = '';
    
    addressData.forEach((item, index) => {
        if (!item.geocodeSuccess) {
            const div = document.createElement('div');
            div.className = 'address-item error';
            div.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <div style="width: 20px;"></div>
                    <div style="flex: 1;">
                        <strong>❌ ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong><br>
                        <small>${item.error || 'Не найден'}</small>
                    </div>
                </div>
            `;
            addressListDiv.appendChild(div);
            return;
        }
        
        const markerInfo = markerData[index];
        const isSelected = selectedMarkerIndexes.has(index);
        const isDuplicate = markerInfo?.isDuplicate || false;
        const plotText = markerInfo && markerInfo.plot ? ` → уч. ${markerInfo.plot}` : '';
        const duplicateText = isDuplicate ? ' ⚠️ ДУБЛИКАТ' : '';
        const itemNumber = markerInfo?.id || index + 1;
        
        const div = document.createElement('div');
        div.className = `address-item success ${isSelected ? 'selected' : ''} ${isDuplicate ? 'duplicate' : ''}`;
        div.style.borderLeft = isDuplicate ? '3px solid #f44336' : '';
        div.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <input type="checkbox" class="address-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''} style="margin-top: 2px;">
                <div style="flex: 1; cursor: pointer;" class="address-content">
                    <strong><span style="background: #2196F3; color: white; padding: 0px 6px; border-radius: 12px; font-size: 11px; margin-right: 8px;">${itemNumber}</span> ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong>
                    <span style="color: #ff9800;">${plotText}</span>
                    <span style="color: #f44336; font-weight: bold;">${duplicateText}</span><br>
                    <small>${item.geocodeResult.address.substring(0, 60)}...</small>
                    <div class="address-plot">📌 Участок: ${markerInfo && markerInfo.plot ? markerInfo.plot : 'не назначен'}</div>
                </div>
            </div>
        `;
        
        const checkbox = div.querySelector('.address-checkbox');
        checkbox.onclick = (e) => {
            e.stopPropagation();
            toggleMarkerSelection(index);
        };
        
        const contentDiv = div.querySelector('.address-content');
        contentDiv.onclick = (e) => {
            if (markers[index]) {
                const coords = markers[index].geometry.getCoordinates();
                map.setCenter(coords, 16);
                markers[index].balloon.open();
            }
        };
        
        addressListDiv.appendChild(div);
    });
    
    updateSelectionStats();
}

// Очистка всех данных
function clearAll() {
    if (mapReady && map && map.geoObjects) map.geoObjects.removeAll();
    markers = [];
    markerData = [];
    addressData = [];
    selectedMarkerIndexes.clear();
    document.getElementById('plotInput').value = '';
    updateAddressList();
    updateStats();
    updateSelectionStats();
    
    if (!isRestoringFromURL) {
        const newUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.pushState({}, '', newUrl);
    }
}

// Экспорт в Excel
function exportToExcel() {
    const exportData = [];
    exportData.push(['№', 'Статус', 'Город', 'Улица', 'Номер дома', 'Корпус', 'Найденный адрес', 'Широта', 'Долгота', 'Назначенный участок', 'Дубликат']);
    
    addressData.forEach((item, index) => {
        const markerInfo = markerData[index];
        const number = markerInfo?.id || index + 1;
        
        if (item.geocodeSuccess) {
            exportData.push([
                number,
                'Найден',
                item.city || '',
                item.street,
                item.house,
                item.building || '',
                item.geocodeResult.address,
                item.geocodeResult.lat,
                item.geocodeResult.lon,
                markerInfo && markerInfo.plot ? markerInfo.plot : '',
                markerInfo?.isDuplicate ? 'Да' : ''
            ]);
        } else {
            exportData.push([
                number,
                'Не найден',
                item.city || '',
                item.street,
                item.house,
                item.building || '',
                '',
                '',
                '',
                '',
                ''
            ]);
        }
    });
    
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [{wch:5},{wch:10},{wch:15},{wch:25},{wch:12},{wch:10},{wch:50},{wch:15},{wch:15},{wch:20},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Адреса с участками');
    XLSX.writeFile(wb, `участки_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`);
    alert(`Экспортировано ${exportData.length - 1} адресов`);
}

// Обработка Excel файла
async function processExcelFile(file) {
    const loadingDiv = document.getElementById('loading');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    loadingDiv.style.display = 'block';
    clearAll();
    
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        if (rows.length < 2) throw new Error('Файл должен содержать заголовки и данные');
        
        const headers = rows[0];
        let cityCol = -1, streetCol = -1, houseCol = -1, buildingCol = -1;
        
        headers.forEach((header, index) => {
            const headerLower = String(header).toLowerCase();
            if (headerLower.includes('город') || headerLower === 'city') cityCol = index;
            if (headerLower.includes('улиц') || headerLower === 'street') streetCol = index;
            if (headerLower.includes('дом') || headerLower === 'house') houseCol = index;
            if (headerLower.includes('корп') || headerLower === 'building') buildingCol = index;
        });
        
        if (streetCol === -1 || houseCol === -1) throw new Error('Не найдены колонки "улица" и/или "дом"');
        
        const addresses = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length > 0 && row[streetCol]) {
                addresses.push({
                    id: i,
                    city: cityCol !== -1 && row[cityCol] ? String(row[cityCol]).trim() : '',
                    street: String(row[streetCol] || '').trim(),
                    house: String(row[houseCol] || '').trim(),
                    building: buildingCol !== -1 && row[buildingCol] ? String(row[buildingCol]).trim() : ''
                });
            }
        }
        
        progressText.textContent = `0/${addresses.length}`;
        progressFill.style.width = '0%';
        
        // Сначала геокодируем все адреса
        for (let i = 0; i < addresses.length; i++) {
            const addr = addresses[i];
            
            if (!addr.street || !addr.house) {
                addressData.push({ ...addr, geocodeSuccess: false, error: 'Не указана улица или дом' });
                markerData.push(null);
            } else {
                const result = await geocodeAddressWithCache(addr.street, addr.house, addr.building, addr.city);
                
                if (result.success) {
                    const originalAddress = `${addr.street}, ${addr.house}${addr.building ? ` корп.${addr.building}` : ''}`;
                    
                    addressData.push({ ...addr, geocodeSuccess: true, geocodeResult: result });
                    markerData.push({
                        id: addr.id,
                        address: result.address,
                        originalAddress: originalAddress,
                        plot: null,
                        lat: result.lat,
                        lon: result.lon,
                        isDuplicate: false
                    });
                } else {
                    addressData.push({ ...addr, geocodeSuccess: false, error: result.error || 'Не найден' });
                    markerData.push(null);
                }
            }
            
            const progress = ((i + 1) / addresses.length) * 100;
            progressFill.style.width = `${progress}%`;
            progressText.textContent = `${i + 1}/${addresses.length}`;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Находим дубликаты адресов
        const addressKeyMap = new Map();
        for (let i = 0; i < addressData.length; i++) {
            const item = addressData[i];
            if (item.geocodeSuccess) {
                const key = `${item.street.toLowerCase()}|${item.house}|${item.building || ''}`;
                if (addressKeyMap.has(key)) {
                    const firstIndex = addressKeyMap.get(key);
                    markerData[firstIndex].isDuplicate = true;
                    markerData[i].isDuplicate = true;
                } else {
                    addressKeyMap.set(key, i);
                }
            }
        }
        
        // Создаём маркеры на карте
        for (let i = 0; i < addressData.length; i++) {
            if (addressData[i].geocodeSuccess && markerData[i]) {
                await new Promise(resolve => setTimeout(resolve, 50));
                const isDup = markerData[i].isDuplicate || false;
                const marker = addMarker(
                    markerData[i].lat, 
                    markerData[i].lon, 
                    markerData[i].address, 
                    markerData[i].originalAddress, 
                    i, 
                    markerData[i].id, 
                    isDup
                );
                if (marker) markers.push(marker);
            }
        }
        
        updateAddressList();
        updateStats();
        
        if (markers.length > 0) {
            setTimeout(() => {
                const coords = markers.map(m => m.geometry.getCoordinates());
                if (coords.length === 1) map.setCenter(coords[0], 16);
                else if (coords.length > 1) {
                    const bounds = ymaps.geoQuery(coords).getBounds();
                    if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
                }
                saveStateToURL();
            }, 200);
        }
        
        const successCount = addressData.filter(a => a.geocodeSuccess).length;
        const duplicateCount = markerData.filter(m => m && m.isDuplicate).length;
        alert(`Готово! Найдено ${successCount} из ${addresses.length} адресов. Дубликатов: ${duplicateCount}`);
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка: ' + error.message);
    } finally {
        loadingDiv.style.display = 'none';
    }
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    document.getElementById('assignPlotBtn').onclick = assignPlotToSelected;
    document.getElementById('exportExcelBtn').onclick = exportToExcel;
    document.getElementById('clearMarkersBtn').onclick = clearAll;
    document.getElementById('selectAllBtn').onclick = selectAll;
    document.getElementById('deselectAllBtn').onclick = deselectAll;
    document.getElementById('getLinkBtn').onclick = getMapLink;
    
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    uploadArea.onclick = () => fileInput.click();
    
    uploadArea.ondragover = (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    };
    
    uploadArea.ondragleave = () => {
        uploadArea.classList.remove('dragover');
    };
    
    uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            processExcelFile(file);
        } else {
            alert('Загрузите файл Excel (.xlsx или .xls)');
        }
    };
    
    fileInput.onchange = (e) => {
        if (e.target.files[0]) processExcelFile(e.target.files[0]);
    };
});
