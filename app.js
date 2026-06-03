// app.js - основная логика с назначением участков

let map;
let markers = [];
let markerData = [];
let addressData = [];
let mapReady = false;
let selectedMarkerIndex = null;

function initMap() {
    ymaps.ready(function() {
        map = new ymaps.Map('map', {
            center: [55.751244, 37.618423],
            zoom: 10,
            controls: ['zoomControl', 'fullscreenControl']
        });
        mapReady = true;
        console.log('Карта готова');
    });
}

function addMarker(lat, lon, address, originalAddress, index) {
    if (!mapReady || !map) return null;
    
    const hasPlot = markerData[index] && markerData[index].plot;
    const markerColor = hasPlot ? 'orange' : 'green';
    
    const placemark = new ymaps.Placemark([lat, lon], {
        balloonContent: `<strong>${address}</strong><br>Исходный адрес: ${originalAddress}<br><strong>Участок: ${hasPlot ? markerData[index].plot : 'не назначен'}</strong>`,
        hintContent: `${originalAddress}${hasPlot ? ' [' + markerData[index].plot + ']' : ''}`
    }, {
        preset: `islands#${markerColor}Icon`,
        balloonMaxWidth: 350
    });
    
    placemark.events.add('click', () => {
        selectMarker(index);
    });
    
    map.geoObjects.add(placemark);
    return placemark;
}

function selectMarker(index) {
    if (selectedMarkerIndex !== null && markers[selectedMarkerIndex]) {
        const oldColor = markerData[selectedMarkerIndex].plot ? 'orange' : 'green';
        markers[selectedMarkerIndex].options.set('preset', `islands#${oldColor}Icon`);
    }
    
    selectedMarkerIndex = index;
    
    if (markers[index]) {
        markers[index].options.set('preset', 'islands#blueIcon');
        markers[index].balloon.open();
        
        document.querySelectorAll('.address-item').forEach((item, i) => {
            if (i === index) item.classList.add('selected');
            else item.classList.remove('selected');
        });
        
        const data = markerData[index];
        const plotText = data.plot ? data.plot : 'не назначен';
        document.getElementById('currentSelection').innerHTML = `✅ Выбран: ${data.originalAddress}<br>📌 Участок: ${plotText}`;
        
        const plotSelect = document.getElementById('plotSelect');
        if (data.plot) plotSelect.value = data.plot;
        else plotSelect.value = '';
    }
}

function assignPlotToSelected() {
    if (selectedMarkerIndex === null) {
        alert('Сначала выберите точку на карте или в списке адресов');
        return;
    }
    
    const plotSelect = document.getElementById('plotSelect');
    const selectedPlot = plotSelect.value;
    
    if (!selectedPlot) {
        alert('Выберите участок из списка');
        return;
    }
    
    markerData[selectedMarkerIndex].plot = selectedPlot;
    markers[selectedMarkerIndex].options.set('preset', 'islands#orangeIcon');
    
    const data = markerData[selectedMarkerIndex];
    markers[selectedMarkerIndex].properties.set({
        balloonContent: `<strong>${data.address}</strong><br>Исходный адрес: ${data.originalAddress}<br><strong>Участок: ${selectedPlot}</strong>`,
        hintContent: `${data.originalAddress} [${selectedPlot}]`
    });
    
    updateAddressList();
    updateStats();
    document.getElementById('currentSelection').innerHTML = `✅ Выбран: ${data.originalAddress}<br>📌 Участок: ${selectedPlot}`;
}

function updateStats() {
    const total = addressData.filter(a => a.geocodeSuccess).length;
    const assigned = markerData.filter(m => m && m.plot).length;
    const errors = addressData.filter(a => !a.geocodeSuccess).length;
    const onMap = markers.length;
    
    document.getElementById('totalCount').textContent = addressData.length;
    document.getElementById('mapCount').textContent = onMap;
    document.getElementById('assignedCount').textContent = assigned;
    document.getElementById('errorCount').textContent = errors;
}

function updateAddressList() {
    const addressListDiv = document.getElementById('addressList');
    addressListDiv.innerHTML = '';
    
    addressData.forEach((item, index) => {
        if (!item.geocodeSuccess) {
            const div = document.createElement('div');
            div.className = 'address-item error';
            div.innerHTML = `<strong>❌ ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong><br><small>${item.error || 'Не найден'}</small>`;
            addressListDiv.appendChild(div);
            return;
        }
        
        const markerInfo = markerData[index];
        const plotText = markerInfo && markerInfo.plot ? ` → ${markerInfo.plot}` : '';
        
        const div = document.createElement('div');
        div.className = `address-item success ${selectedMarkerIndex === index ? 'selected' : ''}`;
        div.innerHTML = `<strong>📍 ${item.street}, ${item.house}${item.building ? ` к.${item.building}` : ''}</strong><span style="color: #ff9800;">${plotText}</span><br><small>${item.geocodeResult.address.substring(0, 60)}...</small><div class="address-plot">📌 Участок: ${markerInfo && markerInfo.plot ? markerInfo.plot : 'не назначен'}</div>`;
        
        div.onclick = () => {
            selectMarker(index);
            if (markers[index]) {
                const coords = markers[index].geometry.getCoordinates();
                map.setCenter(coords, 16);
            }
        };
        
        addressListDiv.appendChild(div);
    });
}

function clearAll() {
    if (mapReady && map && map.geoObjects) map.geoObjects.removeAll();
    markers = [];
    markerData = [];
    addressData = [];
    selectedMarkerIndex = null;
    document.getElementById('currentSelection').innerHTML = 'Ничего не выбрано';
    document.getElementById('plotSelect').value = '';
    updateAddressList();
    updateStats();
}

function exportToExcel() {
    const exportData = [];
    exportData.push(['Статус', 'Город', 'Улица', 'Номер дома', 'Корпус', 'Найденный адрес', 'Широта', 'Долгота', 'Назначенный участок']);
    
    addressData.forEach((item, index) => {
        if (item.geocodeSuccess) {
            const markerInfo = markerData[index];
            exportData.push(['Найден', item.city || '', item.street, item.house, item.building || '', item.geocodeResult.address, item.geocodeResult.lat, item.geocodeResult.lon, markerInfo && markerInfo.plot ? markerInfo.plot : '']);
        } else {
            exportData.push(['Не найден', item.city || '', item.street, item.house, item.building || '', '', '', '', '']);
        }
    });
    
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Адреса с участками');
    XLSX.writeFile(wb, `участки_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`);
    alert(`Экспортировано ${exportData.length - 1} адресов`);
}

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
                    city: cityCol !== -1 && row[cityCol] ? String(row[cityCol]).trim() : '',
                    street: String(row[streetCol] || '').trim(),
                    house: String(row[houseCol] || '').trim(),
                    building: buildingCol !== -1 && row[buildingCol] ? String(row[buildingCol]).trim() : ''
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
                    const addressIndex = addressData.length;
                    
                    addressData.push({ ...addr, geocodeSuccess: true, geocodeResult: result });
                    markerData.push({ address: result.address, originalAddress: originalAddress, plot: null, lat: result.lat, lon: result.lon });
                    
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const marker = addMarker(result.lat, result.lon, result.address, originalAddress, addressData.length - 1);
                    if (marker) markers.push(marker);
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
            }, 200);
        }
        
        const successCount = addressData.filter(a => a.geocodeSuccess).length;
        alert(`Готово! Найдено ${successCount} из ${addresses.length} адресов. Теперь можно назначать участки.`);
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка: ' + error.message);
    } finally {
        loadingDiv.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    document.getElementById('assignPlotBtn').onclick = assignPlotToSelected;
    document.getElementById('exportExcelBtn').onclick = exportToExcel;
    document.getElementById('clearMarkersBtn').onclick = clearAll;
    
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
