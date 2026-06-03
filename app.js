// app.js - с поддержкой количества квартир

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
            if (!isRestoringFromURL) saveStateToURL();
        });
        
        restoreStateFromURL();
        console.log('Карта готова');
    });
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
                id: data.id || i + 1,
                lat: data.lat,
                lon: data.lon,
                address: data.address,
                originalAddress: data.originalAddress,
                plot: data.plot || '',
                apartments: data.apartments || 0,
                street: addressData[i]?.street,
                house: addressData[i]?.house,
                building: addressData[i]?.building,
                city: addressData[i]?.city,
                isDuplicate: data.isDuplicate || false
            });
        }
    }
    
    const state = { center: [center[0], center[1]], zoom: zoom, points: pointsData };
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
                apartments: point.apartments || 0,
                geocodeSuccess: true,
                geocodeResult: { address: point.address, lat: point.lat, lon: point.lon }
            });
            markerData.push({
                id: point.id || i + 1,
                address: point.address,
                originalAddress: point.originalAddress,
                plot: point.plot || null,
                apartments: point.apartments || 0,
                lat: point.lat,
                lon: point.lon,
                isDuplicate: point.isDuplicate || false
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const markerGroup = addMarker(point.lat, point.lon, point.address, point.originalAddress, i, point.id || i + 1, point.isDuplicate || false);
            if (markerGroup) markers.push(markerGroup);
        }
        
        updateAddressList();
        updateStats();
        updateAptSum();
        
        if (state.center && state.zoom) map.setCenter(state.center, state.zoom);
        else if (markers.length > 0) {
            setTimeout(() => {
                const coords = markers.map(m => m.main.geometry.getCoordinates());
                if (coords.length === 1) map.setCenter(coords[0], 16);
                else if (coords.length > 1) {
                    const bounds = ymaps.geoQuery(coords).getBounds();
                    if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
                }
            }, 300);
        }
    } catch (error) {
        console.error('Ошибка восстановления:', error);
    } finally {
        isRestoringFromURL = false;
    }
}

// Получение ссылки
function getMapLink() {
    if (!mapReady || !map) { alert('Карта ещё не загружена'); return; }
    saveStateToURL();
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => alert('✅ Ссылка скопирована!')).catch(() => prompt('Скопируйте ссылку вручную:', url));
}

// Добавление маркера
function addMarker(lat, lon, address, originalAddress, index, number, isDuplicate = false) {
    if (!mapReady || !map) return null;
    
    const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
    const aptCount = markerData[index]?.apartments || 0;
    
    let markerColor;
    if (isDuplicate) markerColor = 'red';
    else if (hasPlot) markerColor = 'orange';
    else markerColor = 'green';
    
    const plotDisplay = markerData[index] && markerData[index].plot ? markerData[index].plot : '';
    const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ДУБЛИКАТ</span>' : '';
    
    const mainPlacemark = new ymaps.Placemark([lat, lon], {
        balloonContent: `<strong>📍 №${number}</strong><br><strong>${address}</strong><br>Исходный адрес: ${originalAddress}<br><strong>Участок: ${plotDisplay || 'не назначен'}</strong><br><strong>Квартир: ${aptCount}</strong>${duplicateWarning}`,
        hintContent: `№${number}: ${originalAddress}${hasPlot ? ' [уч.' + plotDisplay + ']' : ''} (кв:${aptCount})${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`
    }, {
        preset: `islands#${markerColor}Icon`,
        balloonMaxWidth: 350
    });
    
    map.geoObjects.add(mainPlacemark);
    
    const numberPlacemark = new ymaps.Placemark([lat, lon], { balloonContent: '' }, {
        iconLayout: 'default#imageWithContent',
        iconImageHref: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="24" height="24"%3E%3C/svg%3E',
        iconImageSize: [24, 24],
        iconImageOffset: [18, -28],
        iconContentLayout: ymaps.templateLayoutFactory.createClass(
            `<div style="background: #2196F3; color: white; font-weight: bold; font-size: 10px; font-family: Arial, sans-serif; text-align: center; line-height: 16px; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${number}</div>`
        )
    });
    
    map.geoObjects.add(numberPlacemark);
    
    const markerGroup = { main: mainPlacemark, number: numberPlacemark };
    mainPlacemark.events.add('click', () => toggleMarkerSelection(index));
    numberPlacemark.events.add('click', () => toggleMarkerSelection(index));
    
    if (!isRestoringFromURL) saveStateToURL();
    return markerGroup;
}

// Переключение выбора
function toggleMarkerSelection(index) {
    if (selectedMarkerIndexes.has(index)) {
        selectedMarkerIndexes.delete(index);
        updateMarkerColor(index);
    } else {
        selectedMarkerIndexes.add(index);
        if (markers[index] && markers[index].main) markers[index].main.options.set('preset', 'islands#blueIcon');
    }
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

// Обновление цвета маркера
function updateMarkerColor(index) {
    if (!markers[index] || !markers[index].main) return;
    const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
    const isDuplicate = markerData[index]?.isDuplicate || false;
    let markerColor = isDuplicate ? 'red' : (hasPlot ? 'orange' : 'green');
    markers[index].main.options.set('preset', `islands#${markerColor}Icon`);
}

// Обновление суммы квартир
function updateAptSum() {
    let sum = 0;
    for (let index of selectedMarkerIndexes) {
        if (markerData[index] && markerData[index].apartments) {
            sum += parseInt(markerData[index].apartments) || 0;
        }
    }
    document.getElementById('selectedAptSum').textContent = sum;
}

// Выделить всё
function selectAll() {
    for (let i = 0; i < addressData.length; i++) {
        if (addressData[i].geocodeSuccess && markers[i] && markers[i].main && !selectedMarkerIndexes.has(i)) {
            selectedMarkerIndexes.add(i);
            markers[i].main.options.set('preset', 'islands#blueIcon');
        }
    }
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

// Снять выделение
function deselectAll() {
    for (let index of selectedMarkerIndexes) {
        if (markers[index] && markers[index].main) updateMarkerColor(index);
    }
    selectedMarkerIndexes.clear();
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

// Назначить участок
function assignPlotToSelected() {
    if (selectedMarkerIndexes.size === 0) {
        alert('Сначала выберите адреса');
        return;
    }
    
    const plotInput = document.getElementById('plotInput');
    let selectedPlot = plotInput.value.trim();
    
    if (!selectedPlot) {
        alert('Введите номер участка');
        return;
    }
    
    let assignedCount = 0;
    
    for (let index of selectedMarkerIndexes) {
        if (markerData[index] && addressData[index].geocodeSuccess) {
            markerData[index].plot = selectedPlot;
            updateMarkerColor(index);
            
            const data = markerData[index];
            const aptCount = data.apartments || 0;
            const isDuplicate = data.isDuplicate || false;
            const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ДУБЛИКАТ</span>' : '';
            
            if (markers[index] && markers[index].main) {
                markers[index].main.properties.set({
                    balloonContent: `<strong>📍 №${data.id || index + 1}</strong><br><strong>${data.address}</strong><br>Исходный адрес: ${data.originalAddress}<br><strong>Участок: ${selectedPlot}</strong><br><strong>Квартир: ${aptCount}</strong>${duplicateWarning}`,
                    hintContent: `№${data.id || index + 1}: ${data.originalAddress} [уч.${selectedPlot}] (кв:${aptCount})${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`
                });
            }
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

// Обновление статистики
function updateSelectionStats() {
    document.getElementById('selectedCount').textContent = selectedMarkerIndexes.size;
}

function updateStats() {
    const total = addressData.length;
    const success = addressData.filter(a => a.geocodeSuccess).length;
    const assigned = markerData.filter(m => m && m.plot && m.plot !== '').length;
    const onMap = markers.length;
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('mapCount').textContent = onMap;
    document.getElementById('assignedCount').textContent = assigned;
}

// Обновление списка адресов
function updateAddressList() {
    const addressListDiv = document.getElementById('addressList');
    addressListDiv.innerHTML = '';
    
    addressData.forEach((item, index) => {
        if (!item.geocodeSuccess) {
            const div = document.createElement('div');
            div.className = 'address-item error';
            div.innerHTML = `<div style="display: flex; align-items: flex-start; gap: 8px;"><div style="width: 20px;"></div><div style="flex: 1;"><strong>❌ ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong><br><small>${item.error || 'Не найден'}</small></div></div>`;
            addressListDiv.appendChild(div);
            return;
        }
        
        const markerInfo = markerData[index];
        const isSelected = selectedMarkerIndexes.has(index);
        const isDuplicate = markerInfo?.isDuplicate || false;
        const plotText = markerInfo && markerInfo.plot ? ` → уч. ${markerInfo.plot}` : '';
        const duplicateText = isDuplicate ? ' ⚠️ ДУБЛИКАТ' : '';
        const itemNumber = markerInfo?.id || index + 1;
        const aptCount = markerInfo?.apartments || 0;
        
        const div = document.createElement('div');
        div.className = `address-item success ${isSelected ? 'selected' : ''}`;
        div.style.borderLeft = isDuplicate ? '3px solid #f44336' : '';
        div.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <input type="checkbox" class="address-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''} style="margin-top: 2px;">
                <div style="flex: 1; cursor: pointer;" class="address-content">
                    <strong><span style="background: #2196F3; color: white; padding: 0px 6px; border-radius: 12px; font-size: 11px; margin-right: 8px;">${itemNumber}</span> ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong>
                    <span style="color: #ff9800;">${plotText}</span>
                    <span style="color: #f44336; font-weight: bold;">${duplicateText}</span><br>
                    <small>${item.geocodeResult.address.substring(0, 50)}...</small>
                    <div class="address-plot">🏢 Квартир: ${aptCount} | 📌 Участок: ${markerInfo && markerInfo.plot ? markerInfo.plot : 'не назначен'}</div>
                </div>
            </div>
        `;
        
        const checkbox = div.querySelector('.address-checkbox');
        checkbox.onclick = (e) => { e.stopPropagation(); toggleMarkerSelection(index); };
        
        const contentDiv = div.querySelector('.address-content');
        contentDiv.onclick = () => {
            if (markers[index] && markers[index].main) {
                const coords = markers[index].main.geometry.getCoordinates();
                map.setCenter(coords, 16);
                markers[index].main.balloon.open();
            }
        };
        
        addressListDiv.appendChild(div);
    });
    updateSelectionStats();
}

// Очистка
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
    updateAptSum();
    if (!isRestoringFromURL) window.history.pushState({}, '', window.location.pathname);
}

// Экспорт в Excel
function exportToExcel() {
    const exportData = [['№', 'Статус', 'Город', 'Улица', 'Номер дома', 'Корпус', 'Найденный адрес', 'Широта', 'Долгота', 'Количество квартир', 'Назначенный участок', 'Дубликат']];
    
    addressData.forEach((item, index) => {
        const markerInfo = markerData[index];
        const number = markerInfo?.id || index + 1;
        if (item.geocodeSuccess) {
            exportData.push([
                number, 'Найден', item.city || '', item.street, item.house, item.building || '',
                item.geocodeResult.address, item.geocodeResult.lat, item.geocodeResult.lon,
                markerInfo?.apartments || 0, markerInfo?.plot || '', markerInfo?.isDuplicate ? 'Да' : ''
            ]);
        } else {
            exportData.push([number, 'Не найден', item.city || '', item.street, item.house, item.building || '', '', '', '', item.apartments || 0, '', '']);
        }
    });
    
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [{wch:5},{wch:10},{wch:15},{wch:25},{wch:12},{wch:10},{wch:50},{wch:15},{wch:15},{wch:12},{wch:20},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Адреса с участками');
    XLSX.writeFile(wb, `участки_квартиры_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`);
    alert(`Экспортировано ${exportData.length - 1} адресов`);
}

// Обработка Excel
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
        let cityCol = -1, streetCol = -1, houseCol = -1, buildingCol = -1, apartmentsCol = -1;
        headers.forEach((header, idx) => {
            const h = String(header).toLowerCase();
            if (h.includes('город') || h === 'city') cityCol = idx;
            if (h.includes('улиц') || h === 'street') streetCol = idx;
            if (h.includes('дом') || h === 'house') houseCol = idx;
            if (h.includes('корп') || h === 'building') buildingCol = idx;
            if (h.includes('квартир') || h === 'apartments' || h.includes('кв')) apartmentsCol = idx;
        });
        if (streetCol === -1 || houseCol === -1) throw new Error('Не найдены колонки "улица" и/или "дом"');
        
        const addresses = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length > 0 && row[streetCol]) {
                let apartments = 0;
                if (apartmentsCol !== -1 && row[apartmentsCol]) {
                    apartments = parseInt(String(row[apartmentsCol]).replace(/[^\d]/g, '')) || 0;
                }
                addresses.push({
                    id: i,
                    city: cityCol !== -1 && row[cityCol] ? String(row[cityCol]).trim() : '',
                    street: String(row[streetCol] || '').trim(),
                    house: String(row[houseCol] || '').trim(),
                    building: buildingCol !== -1 && row[buildingCol] ? String(row[buildingCol]).trim() : '',
                    apartments: apartments
                });
            }
        }
        
        progressText.textContent = `0/${addresses.length}`;
        progressFill.style.width = '0%';
        
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
                        apartments: addr.apartments,
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
        
        // Находим дубликаты
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
        
        // Создаём маркеры
        for (let i = 0; i < addressData.length; i++) {
            if (addressData[i].geocodeSuccess && markerData[i]) {
                await new Promise(resolve => setTimeout(resolve, 50));
                const isDup = markerData[i].isDuplicate || false;
                const markerGroup = addMarker(markerData[i].lat, markerData[i].lon, markerData[i].address, markerData[i].originalAddress, i, markerData[i].id, isDup);
                if (markerGroup) markers.push(markerGroup);
            }
        }
        
        updateAddressList();
        updateStats();
        updateAptSum();
        
        if (markers.length > 0) {
            setTimeout(() => {
                const coords = markers.map(m => m.main.geometry.getCoordinates());
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

// Инициализация
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
    uploadArea.ondragover = (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); };
    uploadArea.ondragleave = () => { uploadArea.classList.remove('dragover'); };
    uploadArea.ondrop = (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) processExcelFile(file);
        else alert('Загрузите файл Excel (.xlsx или .xls)');
    };
    fileInput.onchange = (e) => { if (e.target.files[0]) processExcelFile(e.target.files[0]); };
});
