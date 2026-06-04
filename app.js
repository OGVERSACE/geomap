// app.js - полная стабильная версия

let map;
let markers = [];
let markerData = [];
let addressData = [];
let mapReady = false;
let selectedMarkerIndexes = new Set();
let isRestoringFromURL = false;
let currentFilterPlot = null;

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
                i: data.id || i + 1,
                a: data.lat,
                o: data.lon,
                d: data.address,
                oA: data.originalAddress,
                pl: data.plot || '',
                ap: data.apartments || 0,
                f: data.floors || 0,
                e: data.entrances || 0,
                s: addressData[i]?.street,
                h: addressData[i]?.house,
                b: addressData[i]?.building,
                ci: addressData[i]?.city,
                dU: data.isDuplicate || false
            });
        }
    }
    
    const state = { c: [center[0], center[1]], z: zoom, p: pointsData };
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
        if (!state.p || state.p.length === 0) return;
        
        const points = state.p;
        clearAll();
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            addressData.push({
                city: point.ci || '',
                street: point.s || '',
                house: point.h || '',
                building: point.b || '',
                apartments: point.ap || 0,
                floors: point.f || 0,
                entrances: point.e || 0,
                geocodeSuccess: true,
                geocodeResult: { address: point.d, lat: point.a, lon: point.o }
            });
            markerData.push({
                id: point.i || i + 1,
                address: point.d,
                originalAddress: point.oA,
                plot: point.pl || null,
                apartments: point.ap || 0,
                floors: point.f || 0,
                entrances: point.e || 0,
                lat: point.a,
                lon: point.o,
                isDuplicate: point.dU || false
            });
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const isDup = markerData[i]?.isDuplicate || false;
            addMarker(point.a, point.o, point.d, point.oA, i, point.i || i + 1, isDup);
        }
        
        updateAddressList();
        updateStats();
        updateAptSum();
        
        if (state.c && state.z) map.setCenter(state.c, state.z);
        else if (markers.length > 0) {
            setTimeout(() => {
                const coords = markers.map(m => m.geometry.getCoordinates());
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

// Получение ссылки (простое копирование)
async function getMapLink() {
    if (!mapReady || !map) {
        alert('Карта ещё не загружена');
        return;
    }
    try {
        saveStateToURL();
        const longUrl = window.location.href;
        await navigator.clipboard.writeText(longUrl);
        alert(`✅ Ссылка скопирована!\n\nДлина: ${longUrl.length} символов`);
    } catch (error) {
        const longUrl = window.location.href;
        prompt('Скопируйте ссылку вручную:', longUrl);
    }
}

// Функция для генерации SVG-маркера
function getPinSvg(number, markerColor, isSelected = false) {
    let fillColor;
    switch(markerColor) {
        case 'green': fillColor = '#4CAF50'; break;
        case 'orange': fillColor = '#FF9800'; break;
        case 'red': fillColor = '#F44336'; break;
        case 'blue': fillColor = '#2196F3'; break;
        default: fillColor = '#4CAF50';
    }
    
    const shadowFilter = isSelected ? 
        '<filter id="shadow"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#2196F3" flood-opacity="0.8"/></filter>' : 
        '<filter id="shadow"><feDropShadow dx="1" dy="2" stdDeviation="3" flood-opacity="0.4"/></filter>';
    
    return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="55" height="55">
    <defs>
        ${shadowFilter}
    </defs>
    <g filter="url(#shadow)">
        <path fill="${fillColor}" d="M269.061,484.131c-3.185,8.461-11.255,14.049-20.273,14.089
            c-9.028,0.029-17.147-5.501-20.39-13.913c-44.034-114.321-132.63-261.205-132.63-330.964C95.767,68.801,164.539,0,249.12,0
            c84.541,0,153.333,68.801,153.333,153.343C402.462,223.307,312.557,368.579,269.061,484.131z M249.12,29.164
            c-66.32,0-120.261,53.941-120.261,120.232c0,66.33,53.941,120.3,120.261,120.3c66.3,0,120.241-53.951,120.241-120.3
            C369.351,83.105,315.42,29.164,249.12,29.164z"/>
        <circle cx="249" cy="150" r="130" fill="white" stroke="rgba(0,0,0,0.15)" stroke-width="2"/>
        <circle cx="249" cy="150" r="130" fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="4"/>
        <text x="249" y="205" font-size="160" font-weight="bold" 
              fill="#222222" text-anchor="middle" font-family="Arial, sans-serif">${number}</text>
    </g>
</svg>`;
}

// Подсветка по номеру участка
function highlightByPlot(plotNumber) {
    currentFilterPlot = plotNumber;
    
    for (let index of selectedMarkerIndexes) {
        const marker = markers[index];
        if (marker) {
            const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
            const isDuplicate = markerData[index]?.isDuplicate || false;
            let markerColor;
            if (isDuplicate) {
                markerColor = 'red';
            } else if (hasPlot) {
                markerColor = 'orange';
            } else {
                markerColor = 'green';
            }
            const number = markerData[index]?.id || index + 1;
            const pinSvg = getPinSvg(number, markerColor, false);
            const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
            marker.options.set('iconImageHref', pinUrl);
        }
    }
    selectedMarkerIndexes.clear();
    
    let foundCount = 0;
    for (let i = 0; i < markerData.length; i++) {
        const marker = markers[i];
        if (!marker) continue;
        
        const hasPlot = markerData[i] && markerData[i].plot;
        const isDuplicate = markerData[i]?.isDuplicate || false;
        const number = markerData[i]?.id || i + 1;
        
        if (plotNumber && hasPlot && markerData[i].plot === plotNumber) {
            const pinSvg = getPinSvg(number, 'blue', true);
            const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
            marker.options.set('iconImageHref', pinUrl);
            selectedMarkerIndexes.add(i);
            foundCount++;
        } else {
            let markerColor;
            if (isDuplicate) {
                markerColor = 'red';
            } else if (hasPlot) {
                markerColor = 'orange';
            } else {
                markerColor = 'green';
            }
            const pinSvg = getPinSvg(number, markerColor, false);
            const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
            marker.options.set('iconImageHref', pinUrl);
        }
    }
    
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
    
    const clearBtn = document.getElementById('clearFilterBtn');
    if (clearBtn) {
        clearBtn.style.display = plotNumber ? 'inline-block' : 'none';
    }
    
    if (foundCount > 0) {
        for (let i = 0; i < markers.length; i++) {
            if (selectedMarkerIndexes.has(i)) {
                const coords = markers[i].geometry.getCoordinates();
                map.setCenter(coords, 14);
                break;
            }
        }
    }
    
    if (plotNumber) {
        alert(`🔍 Найдено ${foundCount} адресов на участке "${plotNumber}"`);
    }
}

// Сброс подсветки
function clearHighlight() {
    currentFilterPlot = null;
    
    for (let index of selectedMarkerIndexes) {
        const marker = markers[index];
        if (marker) {
            const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
            const isDuplicate = markerData[index]?.isDuplicate || false;
            let markerColor;
            if (isDuplicate) {
                markerColor = 'red';
            } else if (hasPlot) {
                markerColor = 'orange';
            } else {
                markerColor = 'green';
            }
            const number = markerData[index]?.id || index + 1;
            const pinSvg = getPinSvg(number, markerColor, false);
            const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
            marker.options.set('iconImageHref', pinUrl);
        }
    }
    selectedMarkerIndexes.clear();
    
    document.getElementById('plotFilterInput').value = '';
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
    
    const clearBtn = document.getElementById('clearFilterBtn');
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
}

// Добавление маркера
function addMarker(lat, lon, address, originalAddress, index, number, isDuplicate = false) {
    if (!mapReady || !map) return null;
    
    const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
    const aptCount = markerData[index]?.apartments || 0;
    const floorsCount = markerData[index]?.floors || 0;
    const entrancesCount = markerData[index]?.entrances || 0;
    
    let markerColor;
    if (isDuplicate) {
        markerColor = 'red';
    } else if (hasPlot) {
        markerColor = 'orange';
    } else {
        markerColor = 'green';
    }
    
    const plotDisplay = markerData[index] && markerData[index].plot ? markerData[index].plot : '';
    const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ДУБЛИКАТ</span>' : '';
    
    let balloonHtml = `<strong>📍 №${number}</strong><br><strong>${address}</strong><br>Исходный адрес: ${originalAddress}<br><strong>Участок: ${plotDisplay || 'не назначен'}</strong><br><strong>Квартир: ${aptCount}</strong>`;
    
    if (floorsCount > 0) {
        balloonHtml += `<br><strong>Этажей: ${floorsCount}</strong>`;
    }
    if (entrancesCount > 0) {
        balloonHtml += `<br><strong>Подъездов: ${entrancesCount}</strong>`;
    }
    balloonHtml += duplicateWarning;
    
    let hintText = `№${number}: ${originalAddress}${hasPlot ? ' [уч.' + plotDisplay + ']' : ''} (кв:${aptCount}`;
    if (floorsCount > 0) hintText += `, эт:${floorsCount}`;
    if (entrancesCount > 0) hintText += `, п:${entrancesCount}`;
    hintText += `)${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`;
    
    const pinSvg = getPinSvg(number, markerColor, false);
    const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
    
    const placemark = new ymaps.Placemark([lat, lon], {
        balloonContent: balloonHtml,
        hintContent: hintText
    }, {
        iconLayout: 'default#image',
        iconImageHref: pinUrl,
        iconImageSize: [55, 55],
        iconImageOffset: [-27, -55],
        balloonMaxWidth: 350
    });
    
    placemark.events.add('click', () => toggleMarkerSelection(index));
    
    map.geoObjects.add(placemark);
    markers.push(placemark);
    
    if (!isRestoringFromURL) saveStateToURL();
    return placemark;
}

// Переключение выбора
function toggleMarkerSelection(index) {
    if (selectedMarkerIndexes.has(index)) {
        selectedMarkerIndexes.delete(index);
        updateMarkerColor(index);
    } else {
        selectedMarkerIndexes.add(index);
        if (markers[index]) {
            const number = markerData[index]?.id || index + 1;
            const pinSvg = getPinSvg(number, 'blue', true);
            const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
            markers[index].options.set('iconImageHref', pinUrl);
        }
    }
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

// Обновление цвета маркера
function updateMarkerColor(index) {
    if (!markers[index]) return;
    
    const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
    const isDuplicate = markerData[index]?.isDuplicate || false;
    const number = markerData[index]?.id || index + 1;
    
    let markerColor;
    if (isDuplicate) {
        markerColor = 'red';
    } else if (hasPlot) {
        markerColor = 'orange';
    } else {
        markerColor = 'green';
    }
    
    const pinSvg = getPinSvg(number, markerColor, false);
    const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
    markers[index].options.set('iconImageHref', pinUrl);
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
        if (addressData[i].geocodeSuccess && !selectedMarkerIndexes.has(i)) {
            selectedMarkerIndexes.add(i);
            const number = markerData[i]?.id || i + 1;
            const pinSvg = getPinSvg(number, 'blue', true);
            const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
            if (markers[i]) markers[i].options.set('iconImageHref', pinUrl);
        }
    }
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

// Снять выделение
function deselectAll() {
    for (let index of selectedMarkerIndexes) {
        updateMarkerColor(index);
    }
    selectedMarkerIndexes.clear();
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

// Назначить участок выбранным
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
            const floorsCount = data.floors || 0;
            const entrancesCount = data.entrances || 0;
            const isDuplicate = data.isDuplicate || false;
            const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ДУБЛИКАТ</span>' : '';
            
            let balloonHtml = `<strong>📍 №${data.id || index + 1}</strong><br><strong>${data.address}</strong><br>Исходный адрес: ${data.originalAddress}<br><strong>Участок: ${selectedPlot}</strong><br><strong>Квартир: ${aptCount}</strong>`;
            
            if (floorsCount > 0) {
                balloonHtml += `<br><strong>Этажей: ${floorsCount}</strong>`;
            }
            if (entrancesCount > 0) {
                balloonHtml += `<br><strong>Подъездов: ${entrancesCount}</strong>`;
            }
            balloonHtml += duplicateWarning;
            
            let hintText = `№${data.id || index + 1}: ${data.originalAddress} [уч.${selectedPlot}] (кв:${aptCount}`;
            if (floorsCount > 0) hintText += `, эт:${floorsCount}`;
            if (entrancesCount > 0) hintText += `, п:${entrancesCount}`;
            hintText += `)${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`;
            
            if (markers[index]) {
                markers[index].properties.set({
                    balloonContent: balloonHtml,
                    hintContent: hintText
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
    const duplicates = markerData.filter(m => m && m.isDuplicate).length;
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('mapCount').textContent = onMap;
    document.getElementById('assignedCount').textContent = assigned;
    const dupElement = document.getElementById('duplicateCount');
    if (dupElement) dupElement.textContent = duplicates;
}

// Обновление списка адресов
function updateAddressList() {
    const addressListDiv = document.getElementById('addressList');
    addressListDiv.innerHTML = '';
    
    addressData.forEach((item, index) => {
        if (!item.geocodeSuccess) {
            const div = document.createElement('div');
            div.className = 'address-item error';
            div.innerHTML = `<div class="flex-row"><div style="width: 20px;"></div><div style="flex: 1;"><strong>❌ ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong><br><small>${item.error || 'Не найден'}</small></div></div>`;
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
        const floorsCount = markerInfo?.floors || 0;
        const entrancesCount = markerInfo?.entrances || 0;
        
        const isHighlighted = currentFilterPlot && markerInfo && markerInfo.plot === currentFilterPlot;
        
        let paramsText = `🏢 Квартир: ${aptCount}`;
        if (floorsCount > 0) paramsText += ` | 🏗️ Этажей: ${floorsCount}`;
        if (entrancesCount > 0) paramsText += ` | 🚪 Подъездов: ${entrancesCount}`;
        paramsText += ` | 📌 Участок: ${markerInfo && markerInfo.plot ? markerInfo.plot : 'не назначен'}`;
        
        const div = document.createElement('div');
        let className = `address-item success ${isSelected ? 'selected' : ''}`;
        if (isHighlighted) className += ' highlight';
        div.className = className;
        div.style.borderLeft = isDuplicate ? '3px solid #f44336' : '';
        div.innerHTML = `
            <div class="flex-row">
                <input type="checkbox" class="address-checkbox" data-index="${index}" ${isSelected ? 'checked' : ''}>
                <div class="address-content">
                    <strong><span style="background: #2196F3; color: white; padding: 0px 6px; border-radius: 12px; font-size: 11px; margin-right: 8px;">${itemNumber}</span> ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong>
                    <span style="color: #ff9800;">${plotText}</span>
                    <span style="color: #f44336; font-weight: bold;">${duplicateText}</span><br>
                    <small>${item.geocodeResult.address.substring(0, 50)}...</small>
                    <div class="address-plot">${paramsText}</div>
                </div>
            </div>
        `;
        
        const checkbox = div.querySelector('.address-checkbox');
        checkbox.onclick = (e) => { e.stopPropagation(); toggleMarkerSelection(index); };
        
        const contentDiv = div.querySelector('.address-content');
        contentDiv.onclick = () => {
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

// Очистка
function clearAll() {
    if (map && map.geoObjects) map.geoObjects.removeAll();
    markers = [];
    markerData = [];
    addressData = [];
    selectedMarkerIndexes.clear();
    document.getElementById('plotInput').value = '';
    document.getElementById('plotFilterInput').value = '';
    currentFilterPlot = null;
    updateAddressList();
    updateStats();
    updateSelectionStats();
    updateAptSum();
    if (!isRestoringFromURL) window.history.pushState({}, '', window.location.pathname);
}

// Экспорт в Excel
function exportToExcel() {
    const exportData = [['№', 'Статус', 'Город', 'Улица', 'Номер дома', 'Корпус', 'Найденный адрес', 'Количество квартир', 'Количество этажей', 'Количество подъездов', 'Назначенный участок', 'Дубликат']];
    
    addressData.forEach((item, index) => {
        const markerInfo = markerData[index];
        const number = markerInfo?.id || index + 1;
        if (item.geocodeSuccess) {
            exportData.push([
                number, 'Найден', item.city || '', item.street, item.house, item.building || '',
                item.geocodeResult.address,
                markerInfo?.apartments || 0,
                markerInfo?.floors || 0,
                markerInfo?.entrances || 0,
                markerInfo?.plot || '',
                markerInfo?.isDuplicate ? 'Да' : ''
            ]);
        } else {
            exportData.push([number, 'Не найден', item.city || '', item.street, item.house, item.building || '', '', item.apartments || 0, item.floors || 0, item.entrances || 0, '', '']);
        }
    });
    
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    ws['!cols'] = [{wch:5},{wch:10},{wch:15},{wch:25},{wch:12},{wch:10},{wch:50},{wch:12},{wch:15},{wch:15},{wch:20},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Адреса с участками');
    XLSX.writeFile(wb, `участки_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`);
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
        let cityCol = -1, streetCol = -1, houseCol = -1, buildingCol = -1;
        let apartmentsCol = -1, floorsCol = -1, entrancesCol = -1, plotCol = -1;
        
        headers.forEach((header, idx) => {
            const h = String(header).toLowerCase();
            if (h.includes('город') || h === 'city') cityCol = idx;
            if (h.includes('улиц') || h === 'street') streetCol = idx;
            if (h.includes('дом') || h === 'house') houseCol = idx;
            if (h.includes('корп') || h === 'building') buildingCol = idx;
            if (h.includes('квартир') || h === 'apartments' || h.includes('кв')) apartmentsCol = idx;
            if (h.includes('этаж') || h === 'floors') floorsCol = idx;
            if (h.includes('подъезд') || h === 'entrances') entrancesCol = idx;
            if (h.includes('участок') || h === 'plot') plotCol = idx;
        });
        if (streetCol === -1 || houseCol === -1) throw new Error('Не найдены колонки "улица" и/или "дом"');
        
        const addresses = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length > 0 && row[streetCol]) {
                let apartments = 0, floors = 0, entrances = 0;
                let plot = '';
                
                if (apartmentsCol !== -1 && row[apartmentsCol]) {
                    apartments = parseInt(String(row[apartmentsCol]).replace(/[^\d]/g, '')) || 0;
                }
                if (floorsCol !== -1 && row[floorsCol]) {
                    floors = parseInt(String(row[floorsCol]).replace(/[^\d]/g, '')) || 0;
                }
                if (entrancesCol !== -1 && row[entrancesCol]) {
                    entrances = parseInt(String(row[entrancesCol]).replace(/[^\d]/g, '')) || 0;
                }
                if (plotCol !== -1 && row[plotCol]) {
                    plot = String(row[plotCol]).trim();
                }
                
                addresses.push({
                    id: i,
                    city: cityCol !== -1 && row[cityCol] ? String(row[cityCol]).trim() : '',
                    street: String(row[streetCol] || '').trim(),
                    house: String(row[houseCol] || '').trim(),
                    building: buildingCol !== -1 && row[buildingCol] ? String(row[buildingCol]).trim() : '',
                    apartments: apartments,
                    floors: floors,
                    entrances: entrances,
                    plot: plot
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
                        plot: addr.plot || null,
                        apartments: addr.apartments,
                        floors: addr.floors,
                        entrances: addr.entrances,
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
        
        for (let i = 0; i < addressData.length; i++) {
            if (addressData[i].geocodeSuccess && markerData[i]) {
                await new Promise(resolve => setTimeout(resolve, 50));
                const isDup = markerData[i].isDuplicate || false;
                addMarker(
                    markerData[i].lat,
                    markerData[i].lon,
                    markerData[i].address,
                    markerData[i].originalAddress,
                    i,
                    markerData[i].id,
                    isDup
                );
            }
        }
        
        updateAddressList();
        updateStats();
        updateAptSum();
        
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    document.getElementById('assignPlotBtn').onclick = assignPlotToSelected;
    document.getElementById('exportExcelBtn').onclick = exportToExcel;
    document.getElementById('selectAllBtn').onclick = selectAll;
    document.getElementById('deselectAllBtn').onclick = deselectAll;
    document.getElementById('getLinkBtn').onclick = getMapLink;
    
    document.getElementById('filterPlotBtn').onclick = () => {
        const plotNumber = document.getElementById('plotFilterInput').value.trim();
        if (plotNumber) {
            highlightByPlot(plotNumber);
        } else {
            alert('Введите номер участка для поиска');
        }
    };
    document.getElementById('clearFilterBtn').onclick = () => {
        clearHighlight();
    };
    
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
