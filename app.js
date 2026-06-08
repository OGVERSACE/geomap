// app.js - полная версия с фильтром "Только с указанными этажами"

let map;
let markers = [];
let markerData = [];
let addressData = [];
let mapReady = false;
let selectedMarkerIndexes = new Set();
let isRestoringFromURL = false;
let currentFilterPlot = null;
let clusterer = null;

let rulerActive = false;
let rulerLine = null;
let rulerPoints = [];
let rulerPlacemarks = [];

let currentFloorsFilter = 0;

const plotColors = new Map();

function getColorForPlot(plotName) {
    if (!plotName || plotName === '') return null;
    
    const predefinedColors = {
        '1': '#FF9800', '2': '#9C27B0', '3': '#00BCD4', '4': '#E91E63', '5': '#8BC34A',
        '6': '#FF5722', '7': '#673AB7', '8': '#009688', '9': '#FFC107', '10': '#795548',
        '11': '#607D8B', '12': '#3F51B5', '13': '#CDDC39', '14': '#FF4081', '15': '#7C4DFF',
        '16': '#64FFDA', '17': '#FF6E40', '18': '#B2FF59', '19': '#E040FB', '20': '#FFD54F',
        '21': '#CE93D8', '22': '#80CBC4', '23': '#FFAB91', '24': '#BCAAA4', '25': '#90CAF9',
        '26': '#A5D6A7', '27': '#F48FB1', '28': '#FFF59D', '29': '#B39DDB', '30': '#F44336',
        '31': '#FF7043', '32': '#FFB74D', '33': '#FFF176', '34': '#AED581', '35': '#4DB6AC',
        '36': '#4FC3F7', '37': '#7986CB', '38': '#BA68C8', '39': '#F06292', '40': '#A1887F',
        '41': '#E0E0E0', '42': '#BDBDBD', '43': '#9E9E9E', '44': '#757575', '45': '#616161',
        '46': '#FBC02D', '47': '#F57C00', '48': '#E65100', '49': '#827717', '50': '#33691E',
        '51': '#004D40', '52': '#006064', '53': '#0D47A1', '54': '#1A237E', '55': '#311B92',
        '56': '#4A148C', '57': '#880E4F', '58': '#B71C1C', '59': '#BF360C', '60': '#3E2723',
        '61': '#D81B60', '62': '#F06292', '63': '#BA68C8', '64': '#9575CD', '65': '#7986CB',
        '66': '#64B5F6', '67': '#4FC3F7', '68': '#4DD0E1', '69': '#4DB6AC', '70': '#81C784'
    };
    
    if (predefinedColors[plotName]) return predefinedColors[plotName];
    
    let hash = 0;
    for (let i = 0; i < plotName.length; i++) {
        hash = ((hash << 5) - hash) + plotName.charCodeAt(i);
        hash = hash & hash;
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 55%)`;
}

function updatePlotLists() {
    const plots = new Set();
    for (const data of markerData) {
        if (data && data.plot && data.plot !== '') plots.add(data.plot);
    }
    
    const sortedPlots = Array.from(plots).sort((a, b) => {
        const aNum = parseInt(a);
        const bNum = parseInt(b);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        if (!isNaN(aNum)) return -1;
        if (!isNaN(bNum)) return 1;
        return String(a).localeCompare(String(b));
    });
    
    const plotList = document.getElementById('plotList');
    const plotListAssign = document.getElementById('plotListAssign');
    
    if (plotList) {
        plotList.innerHTML = '';
        for (const plot of sortedPlots) {
            const option = document.createElement('option');
            option.value = plot;
            plotList.appendChild(option);
        }
    }
    
    if (plotListAssign) {
        plotListAssign.innerHTML = '';
        for (const plot of sortedPlots) {
            const option = document.createElement('option');
            option.value = plot;
            plotListAssign.appendChild(option);
        }
    }
}

function getMarkerColor(index) {
    const data = markerData[index];
    if (!data) return '#4CAF50';
    if (data.isDuplicate) return '#F44336';
    const plotName = data.plot;
    if (plotName && plotName !== '') {
        if (!plotColors.has(plotName)) plotColors.set(plotName, getColorForPlot(plotName));
        return plotColors.get(plotName);
    }
    return '#4CAF50';
}

// Проверка, нужно ли показывать маркер (по фильтру этажей)
function shouldShowMarker(index) {
    const floors = markerData[index]?.floors || 0;
    const onlyWithFloors = document.getElementById('onlyWithFloorsCheckbox')?.checked || false;
    
    // Если включен режим "только с указанными этажами" и этажи не указаны (0) - скрываем
    if (onlyWithFloors && floors === 0) {
        return false;
    }
    
    // Если фильтр по этажам не активен (0) - показываем все
    if (currentFloorsFilter === 0) {
        return true;
    }
    
    // Показываем только если этажи >= фильтра
    return floors >= currentFloorsFilter;
}

function applyFloorsFilter() {
    const filterInput = document.getElementById('floorsFilter');
    currentFloorsFilter = parseInt(filterInput.value) || 0;
    
    for (let i = 0; i < markers.length; i++) {
        if (markers[i]) {
            markers[i].options.set('visible', shouldShowMarker(i));
        }
    }
    if (clusterer) clusterer.reload();
    updateAddressList();
}

function resetFloorsFilter() {
    document.getElementById('floorsFilter').value = 0;
    currentFloorsFilter = 0;
    for (let i = 0; i < markers.length; i++) {
        if (markers[i]) {
            markers[i].options.set('visible', shouldShowMarker(i));
        }
    }
    if (clusterer) clusterer.reload();
    updateAddressList();
}

function clearRuler() {
    if (rulerLine) { map.geoObjects.remove(rulerLine); rulerLine = null; }
    for (let pm of rulerPlacemarks) { map.geoObjects.remove(pm); }
    rulerPlacemarks = [];
    rulerPoints = [];
    document.getElementById('distanceInfo').style.display = 'none';
    document.getElementById('distanceControls').style.display = 'none';
}

function updateRuler() {
    if (rulerPoints.length < 2) return;
    if (rulerLine) map.geoObjects.remove(rulerLine);
    
    rulerLine = new ymaps.Polyline(rulerPoints, {}, {
        strokeColor: '#2196F3', strokeWidth: 4, strokeOpacity: 0.8
    });
    map.geoObjects.add(rulerLine);
    
    let totalDistance = 0;
    for (let i = 1; i < rulerPoints.length; i++) {
        totalDistance += ymaps.coordSystem.geo.getDistance(rulerPoints[i-1], rulerPoints[i]);
    }
    
    const infoDiv = document.getElementById('distanceInfo');
    if (totalDistance < 1000) {
        infoDiv.innerHTML = `📏 Расстояние: ${Math.round(totalDistance)} м`;
    } else {
        infoDiv.innerHTML = `📏 Расстояние: ${(totalDistance / 1000).toFixed(2)} км`;
    }
    infoDiv.style.display = 'block';
    document.getElementById('distanceControls').style.display = 'flex';
}

function addRulerPoint(coords) {
    rulerPoints.push(coords);
    const placemark = new ymaps.Placemark(coords, { balloonContent: `Точка ${rulerPoints.length}` }, {
        preset: 'islands#blueIcon', draggable: true
    });
    
    placemark.events.add('dragend', function() {
        const idx = rulerPlacemarks.indexOf(placemark);
        if (idx !== -1) { rulerPoints[idx] = placemark.geometry.getCoordinates(); updateRuler(); }
    });
    placemark.events.add('contextmenu', function(e) {
        e.preventDefault();
        const idx = rulerPlacemarks.indexOf(placemark);
        if (idx !== -1) {
            map.geoObjects.remove(placemark);
            rulerPlacemarks.splice(idx, 1);
            rulerPoints.splice(idx, 1);
            updateRuler();
            if (rulerPoints.length === 0) clearRuler();
        }
    });
    
    map.geoObjects.add(placemark);
    rulerPlacemarks.push(placemark);
    if (rulerPoints.length >= 2) updateRuler();
}

function toggleRuler() {
    rulerActive = !rulerActive;
    const rulerBtn = document.getElementById('rulerBtn');
    if (rulerActive) {
        rulerBtn.classList.add('active');
        rulerBtn.style.background = '#2196F3';
        rulerBtn.style.color = 'white';
    } else {
        rulerBtn.classList.remove('active');
        rulerBtn.style.background = 'white';
        rulerBtn.style.color = 'black';
        clearRuler();
    }
}

function initMap() {
    ymaps.ready(function() {
        map = new ymaps.Map('map', { center: [55.751244, 37.618423], zoom: 10, controls: ['zoomControl', 'fullscreenControl'] });
        mapReady = true;
        
        clusterer = new ymaps.Clusterer({
            preset: 'islands#invertedVioletClusterIcons',
            groupByCoordinates: false,
            clusterDisableClickZoom: true,
            clusterOpenBalloonOnClick: false
        });
        
        clusterer.events.add('click', function(e) {
            const cluster = e.get('target');
            const geoObjects = cluster.properties.get('geoObjects');
            if (!geoObjects || geoObjects.length === 0) return;
            
            const indexesToSelect = [];
            for (let i = 0; i < geoObjects.length; i++) {
                const markerIndex = geoObjects[i].properties.get('markerIndex');
                if (markerIndex !== undefined && addressData[markerIndex] && addressData[markerIndex].geocodeSuccess) {
                    indexesToSelect.push(markerIndex);
                }
            }
            if (indexesToSelect.length === 0) return;
            
            for (let idx of indexesToSelect) {
                if (!selectedMarkerIndexes.has(idx)) {
                    selectedMarkerIndexes.add(idx);
                    const number = markerData[idx]?.id || idx + 1;
                    const pinSvg = getPinSvg(number, '#2196F3', true);
                    const pinUrl = 'data:image/svg+xml,' + encodeURIComponent(pinSvg);
                    if (markers[idx]) markers[idx].options.set('iconImageHref', pinUrl);
                }
            }
            updateAddressList();
            updateSelectionStats();
            updateAptSum();
            
            const msg = document.createElement('div');
            msg.textContent = `✅ Выбрано ${indexesToSelect.length} адресов из кластера`;
            msg.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:#4CAF50; color:white; padding:8px 16px; border-radius:8px; z-index:10000; font-size:14px;';
            document.body.appendChild(msg);
            setTimeout(() => msg.remove(), 2000);
            e.stopPropagation();
        });
        
        map.geoObjects.add(clusterer);
        
        map.events.add('click', function(e) { if (rulerActive) addRulerPoint(e.get('coords')); });
        map.events.add(['boundschange', 'actionend'], function() { if (!isRestoringFromURL) saveStateToURL(); });
        
        restoreStateFromURL();
        console.log('Карта готова');
    });
}

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
                a: Math.round(data.lat * 1000000) / 1000000,
                o: Math.round(data.lon * 1000000) / 1000000,
                d: data.address?.substring(0, 100) || '',
                oA: data.originalAddress?.substring(0, 100) || '',
                pl: data.plot || '',
                ap: data.apartments || 0,
                f: data.floors || 0,
                e: data.entrances || 0,
                s: addressData[i]?.street?.substring(0, 50) || '',
                h: addressData[i]?.house || '',
                b: addressData[i]?.building || '',
                ci: addressData[i]?.city || '',
                dU: data.isDuplicate || false
            });
        }
    }
    
    const state = { c: [center[0], center[1]], z: zoom, p: pointsData };
    const stateStr = JSON.stringify(state);
    const encodedState = btoa(encodeURIComponent(stateStr));
    const testUrl = `${window.location.origin}${window.location.pathname}?state=${encodedState}`;
    
    if (testUrl.length > 2000) {
        console.warn('⚠️ URL слишком длинный, сохраняем в localStorage');
        localStorage.setItem('geomap_state', encodedState);
        window.history.pushState({}, '', `${window.location.origin}${window.location.pathname}?local=1`);
    } else {
        window.history.pushState({}, '', testUrl);
    }
}

async function restoreStateFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    let encodedState = urlParams.get('state');
    const isLocal = urlParams.get('local') === '1';
    
    if (isLocal && !encodedState) {
        encodedState = localStorage.getItem('geomap_state');
        if (encodedState) {
            console.log('📦 Загружаем состояние из localStorage');
            localStorage.removeItem('geomap_state');
        }
    }
    
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
            const isDup = markerData[i]?.isDuplicate || false;
            addMarker(points[i].a, points[i].o, points[i].d, points[i].oA, i, points[i].i || i + 1, isDup);
        }
        
        updateAddressList();
        updateStats();
        updateAptSum();
        updatePlotLists();
        
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
        prompt('Скопируйте ссылку вручную:', window.location.href);
    }
}

function getPinSvg(number, markerColor, isSelected = false) {
    let fillColor = isSelected ? '#2196F3' : (markerColor || '#4CAF50');
    const shadowFilter = isSelected ? 
        '<filter id="shadow"><feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#2196F3" flood-opacity="0.8"/></filter>' : 
        '<filter id="shadow"><feDropShadow dx="1" dy="2" stdDeviation="3" flood-opacity="0.4"/></filter>';
    return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="55" height="55">
    <defs>${shadowFilter}</defs>
    <g filter="url(#shadow)">
        <path fill="${fillColor}" d="M269.061,484.131c-3.185,8.461-11.255,14.049-20.273,14.089
            c-9.028,0.029-17.147-5.501-20.39-13.913c-44.034-114.321-132.63-261.205-132.63-330.964C95.767,68.801,164.539,0,249.12,0
            c84.541,0,153.333,68.801,153.333,153.343C402.462,223.307,312.557,368.579,269.061,484.131z M249.12,29.164
            c-66.32,0-120.261,53.941-120.261,120.232c0,66.33,53.941,120.3,120.261,120.3c66.3,0,120.241-53.951,120.241-120.3
            C369.351,83.105,315.42,29.164,249.12,29.164z"/>
        <circle cx="249" cy="150" r="130" fill="white" stroke="rgba(0,0,0,0.15)" stroke-width="2"/>
        <circle cx="249" cy="150" r="130" fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="4"/>
        <text x="249" y="205" font-size="160" font-weight="bold" fill="#222222" text-anchor="middle" font-family="Arial, sans-serif">${number}</text>
    </g>
</svg>`;
}

function highlightByPlot(plotNumber) {
    currentFilterPlot = plotNumber;
    for (let idx of selectedMarkerIndexes) {
        if (markers[idx]) {
            const color = getMarkerColor(idx);
            const pinSvg = getPinSvg(markerData[idx]?.id || idx + 1, color, false);
            markers[idx].options.set('iconImageHref', 'data:image/svg+xml,' + encodeURIComponent(pinSvg));
        }
    }
    selectedMarkerIndexes.clear();
    let foundCount = 0;
    for (let i = 0; i < markerData.length; i++) {
        if (!markers[i]) continue;
        const hasPlot = markerData[i] && markerData[i].plot;
        const number = markerData[i]?.id || i + 1;
        if (plotNumber && hasPlot && markerData[i].plot === plotNumber) {
            const pinSvg = getPinSvg(number, '#2196F3', true);
            markers[i].options.set('iconImageHref', 'data:image/svg+xml,' + encodeURIComponent(pinSvg));
            selectedMarkerIndexes.add(i);
            foundCount++;
        } else {
            const color = getMarkerColor(i);
            const pinSvg = getPinSvg(number, color, false);
            markers[i].options.set('iconImageHref', 'data:image/svg+xml,' + encodeURIComponent(pinSvg));
        }
    }
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
    document.getElementById('clearFilterBtn').style.display = plotNumber ? 'inline-block' : 'none';
    if (foundCount > 0) {
        for (let i = 0; i < markers.length; i++) {
            if (selectedMarkerIndexes.has(i)) {
                map.setCenter(markers[i].geometry.getCoordinates(), 14);
                break;
            }
        }
    }
    if (plotNumber) alert(`🔍 Найдено ${foundCount} адресов на участке "${plotNumber}"`);
}

function clearHighlight() {
    currentFilterPlot = null;
    for (let idx of selectedMarkerIndexes) {
        if (markers[idx]) {
            const color = getMarkerColor(idx);
            const pinSvg = getPinSvg(markerData[idx]?.id || idx + 1, color, false);
            markers[idx].options.set('iconImageHref', 'data:image/svg+xml,' + encodeURIComponent(pinSvg));
        }
    }
    selectedMarkerIndexes.clear();
    document.getElementById('plotFilterInput').value = '';
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
    document.getElementById('clearFilterBtn').style.display = 'none';
}

function addMarker(lat, lon, address, originalAddress, index, number, isDuplicate = false) {
    if (!mapReady || !map) return null;
    const hasPlot = markerData[index] && markerData[index].plot && markerData[index].plot !== '';
    const aptCount = markerData[index]?.apartments || 0;
    const floorsCount = markerData[index]?.floors || 0;
    const entrancesCount = markerData[index]?.entrances || 0;
    const markerColor = getMarkerColor(index);
    const plotDisplay = markerData[index]?.plot || '';
    const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ДУБЛИКАТ</span>' : '';
    
    let balloonHtml = `<strong>📍 №${number}</strong><br><strong>${address}</strong><br>Исходный адрес: ${originalAddress}<br><strong>Участок: ${plotDisplay || 'не назначен'}</strong><br><strong>Квартир: ${aptCount}</strong>`;
    if (floorsCount > 0) balloonHtml += `<br><strong>Этажей: ${floorsCount}</strong>`;
    if (entrancesCount > 0) balloonHtml += `<br><strong>Подъездов: ${entrancesCount}</strong>`;
    balloonHtml += duplicateWarning;
    
    let hintText = `№${number}: ${originalAddress}${hasPlot ? ` [уч.${plotDisplay}]` : ''} (кв:${aptCount}`;
    if (floorsCount > 0) hintText += `, эт:${floorsCount}`;
    if (entrancesCount > 0) hintText += `, п:${entrancesCount}`;
    hintText += `)${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`;
    
    const pinSvg = getPinSvg(number, markerColor, false);
    const placemark = new ymaps.Placemark([lat, lon], { balloonContent: balloonHtml, hintContent: hintText }, {
        iconLayout: 'default#image', iconImageHref: 'data:image/svg+xml,' + encodeURIComponent(pinSvg),
        iconImageSize: [55, 55], iconImageOffset: [-27, -55], balloonMaxWidth: 350
    });
    placemark.properties.set('markerIndex', index);
    placemark.events.add('click', () => toggleMarkerSelection(index));
    clusterer.add(placemark);
    markers.push(placemark);
    if (!isRestoringFromURL) saveStateToURL();
    return placemark;
}

function toggleMarkerSelection(index) {
    if (selectedMarkerIndexes.has(index)) {
        selectedMarkerIndexes.delete(index);
        updateMarkerColor(index);
    } else {
        selectedMarkerIndexes.add(index);
        if (markers[index]) {
            const pinSvg = getPinSvg(markerData[index]?.id || index + 1, '#2196F3', true);
            markers[index].options.set('iconImageHref', 'data:image/svg+xml,' + encodeURIComponent(pinSvg));
        }
    }
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

function updateMarkerColor(index) {
    if (!markers[index]) return;
    const color = getMarkerColor(index);
    const pinSvg = getPinSvg(markerData[index]?.id || index + 1, color, false);
    markers[index].options.set('iconImageHref', 'data:image/svg+xml,' + encodeURIComponent(pinSvg));
}

function updateAptSum() {
    let sum = 0;
    for (let idx of selectedMarkerIndexes) {
        sum += parseInt(markerData[idx]?.apartments) || 0;
    }
    document.getElementById('selectedAptSum').textContent = sum;
}

function selectAll() {
    for (let i = 0; i < addressData.length; i++) {
        if (addressData[i].geocodeSuccess && !selectedMarkerIndexes.has(i)) {
            selectedMarkerIndexes.add(i);
            const pinSvg = getPinSvg(markerData[i]?.id || i + 1, '#2196F3', true);
            if (markers[i]) markers[i].options.set('iconImageHref', 'data:image/svg+xml,' + encodeURIComponent(pinSvg));
        }
    }
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

function deselectAll() {
    for (let idx of selectedMarkerIndexes) updateMarkerColor(idx);
    selectedMarkerIndexes.clear();
    updateAddressList();
    updateSelectionStats();
    updateAptSum();
}

function assignPlotToSelected() {
    if (selectedMarkerIndexes.size === 0) { alert('Сначала выберите адреса'); return; }
    const plotInput = document.getElementById('plotInput');
    const selectedPlot = plotInput.value.trim();
    if (!selectedPlot) { alert('Введите номер участка'); return; }
    
    let assignedCount = 0;
    for (let idx of selectedMarkerIndexes) {
        if (markerData[idx] && addressData[idx].geocodeSuccess) {
            markerData[idx].plot = selectedPlot;
            updateMarkerColor(idx);
            const data = markerData[idx];
            const aptCount = data.apartments || 0;
            const floorsCount = data.floors || 0;
            const entrancesCount = data.entrances || 0;
            const isDuplicate = data.isDuplicate || false;
            const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ДУБЛИКАТ</span>' : '';
            
            let balloonHtml = `<strong>📍 №${data.id || idx + 1}</strong><br><strong>${data.address}</strong><br>Исходный адрес: ${data.originalAddress}<br><strong>Участок: ${selectedPlot}</strong><br><strong>Квартир: ${aptCount}</strong>`;
            if (floorsCount > 0) balloonHtml += `<br><strong>Этажей: ${floorsCount}</strong>`;
            if (entrancesCount > 0) balloonHtml += `<br><strong>Подъездов: ${entrancesCount}</strong>`;
            balloonHtml += duplicateWarning;
            
            let hintText = `№${data.id || idx + 1}: ${data.originalAddress} [уч.${selectedPlot}] (кв:${aptCount}`;
            if (floorsCount > 0) hintText += `, эт:${floorsCount}`;
            if (entrancesCount > 0) hintText += `, п:${entrancesCount}`;
            hintText += `)${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`;
            
            if (markers[idx]) {
                markers[idx].properties.set({ balloonContent: balloonHtml, hintContent: hintText });
            }
            assignedCount++;
        }
    }
    deselectAll();
    plotInput.value = '';
    updateAddressList();
    updateStats();
    updatePlotLists();
    saveStateToURL();
    alert(`Назначен участок "${selectedPlot}" для ${assignedCount} адресов`);
}

function removePlotFromSelected() {
    if (selectedMarkerIndexes.size === 0) { alert('Сначала выберите адреса'); return; }
    let removedCount = 0;
    for (let idx of selectedMarkerIndexes) {
        if (markerData[idx] && addressData[idx].geocodeSuccess) {
            markerData[idx].plot = null;
            updateMarkerColor(idx);
            const data = markerData[idx];
            const aptCount = data.apartments || 0;
            const floorsCount = data.floors || 0;
            const entrancesCount = data.entrances || 0;
            const isDuplicate = data.isDuplicate || false;
            const duplicateWarning = isDuplicate ? '<br><span style="color: red;">⚠️ ДУБЛИКАТ</span>' : '';
            
            let balloonHtml = `<strong>📍 №${data.id || idx + 1}</strong><br><strong>${data.address}</strong><br>Исходный адрес: ${data.originalAddress}<br><strong>Участок: не назначен</strong><br><strong>Квартир: ${aptCount}</strong>`;
            if (floorsCount > 0) balloonHtml += `<br><strong>Этажей: ${floorsCount}</strong>`;
            if (entrancesCount > 0) balloonHtml += `<br><strong>Подъездов: ${entrancesCount}</strong>`;
            balloonHtml += duplicateWarning;
            
            let hintText = `№${data.id || idx + 1}: ${data.originalAddress} (кв:${aptCount}`;
            if (floorsCount > 0) hintText += `, эт:${floorsCount}`;
            if (entrancesCount > 0) hintText += `, п:${entrancesCount}`;
            hintText += `)${isDuplicate ? ' [ДУБЛИКАТ]' : ''}`;
            
            if (markers[idx]) {
                markers[idx].properties.set({ balloonContent: balloonHtml, hintContent: hintText });
            }
            removedCount++;
        }
    }
    updateAddressList();
    updateStats();
    updatePlotLists();
    saveStateToURL();
    alert(`✅ Участок снят с ${removedCount} адресов`);
}

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
        const plotText = markerInfo?.plot ? ` → уч. ${markerInfo.plot}` : '';
        const duplicateText = isDuplicate ? ' ⚠️ ДУБЛИКАТ' : '';
        const itemNumber = markerInfo?.id || index + 1;
        const aptCount = markerInfo?.apartments || 0;
        const floorsCount = markerInfo?.floors || 0;
        const entrancesCount = markerInfo?.entrances || 0;
        const isHighlighted = currentFilterPlot && markerInfo?.plot === currentFilterPlot;
        
        let paramsText = `🏢 Квартир: ${aptCount}`;
        if (floorsCount > 0) paramsText += ` | 🏗️ Этажей: ${floorsCount}`;
        if (entrancesCount > 0) paramsText += ` | 🚪 Подъездов: ${entrancesCount}`;
        paramsText += ` | 📌 Участок: ${markerInfo?.plot || 'не назначен'}`;
        
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
        div.querySelector('.address-content').onclick = () => {
            if (markers[index]) {
                map.setCenter(markers[index].geometry.getCoordinates(), 16);
                markers[index].balloon.open();
            }
        };
        addressListDiv.appendChild(div);
    });
    updateSelectionStats();
}

function clearAll() {
    if (clusterer) clusterer.removeAll();
    markers = [];
    markerData = [];
    addressData = [];
    selectedMarkerIndexes.clear();
    document.getElementById('plotInput').value = '';
    document.getElementById('plotFilterInput').value = '';
    currentFilterPlot = null;
    plotColors.clear();
    updateAddressList();
    updateStats();
    updateSelectionStats();
    updateAptSum();
    updatePlotLists();
    if (!isRestoringFromURL) window.history.pushState({}, '', window.location.pathname);
}

function exportToExcel() {
    const exportData = [['№', 'Статус', 'Город', 'Улица', 'Номер дома', 'Корпус', 'Найденный адрес', 'Количество квартир', 'Количество этажей', 'Количество подъездов', 'Назначенный участок', 'Дубликат']];
    addressData.forEach((item, index) => {
        const markerInfo = markerData[index];
        const number = markerInfo?.id || index + 1;
        if (item.geocodeSuccess) {
            exportData.push([number, 'Найден', item.city || '', item.street, item.house, item.building || '', item.geocodeResult.address, markerInfo?.apartments || 0, markerInfo?.floors || 0, markerInfo?.entrances || 0, markerInfo?.plot || '', markerInfo?.isDuplicate ? 'Да' : '']);
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
        let cityCol = -1, streetCol = -1, houseCol = -1, buildingCol = -1, apartmentsCol = -1, floorsCol = -1, entrancesCol = -1, plotCol = -1;
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
                let apartments = 0, floors = 0, entrances = 0, plot = '';
                let building = buildingCol !== -1 && row[buildingCol] ? String(row[buildingCol]).trim() : '';
                let house = String(row[houseCol] || '').trim();
                
                if (building && /^\d+\/\d+$/.test(building)) {
                    house = `${house}/${building}`;
                    building = '';
                }
                if (building && /[А-Яа-я]/.test(building) && !/[А-Яа-я]/.test(house)) {
                    const letter = building.match(/[А-Яа-я]+/);
                    if (letter) {
                        house = house + letter[0];
                        building = building.replace(/[А-Яа-я]+/, '');
                    }
                }
                
                if (apartmentsCol !== -1 && row[apartmentsCol]) apartments = parseInt(String(row[apartmentsCol]).replace(/[^\d]/g, '')) || 0;
                if (floorsCol !== -1 && row[floorsCol]) floors = parseInt(String(row[floorsCol]).replace(/[^\d]/g, '')) || 0;
                if (entrancesCol !== -1 && row[entrancesCol]) entrances = parseInt(String(row[entrancesCol]).replace(/[^\d]/g, '')) || 0;
                if (plotCol !== -1 && row[plotCol]) plot = String(row[plotCol]).trim();
                
                const city = cityCol !== -1 && row[cityCol] ? String(row[cityCol]).trim() : '';
                
                addresses.push({ 
                    id: i, 
                    city: city,
                    street: String(row[streetCol] || '').trim(),
                    house: house,
                    building: building,
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
                    markerData.push({ id: addr.id, address: result.address, originalAddress: originalAddress, plot: addr.plot || null, apartments: addr.apartments, floors: addr.floors, entrances: addr.entrances, lat: result.lat, lon: result.lon, isDuplicate: false });
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
                addMarker(markerData[i].lat, markerData[i].lon, markerData[i].address, markerData[i].originalAddress, i, markerData[i].id, markerData[i].isDuplicate);
            }
        }
        
        updateAddressList();
        updateStats();
        updateAptSum();
        updatePlotLists();
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

// Обработчик изменения чекбокса
const onlyWithFloorsCheckbox = document.getElementById('onlyWithFloorsCheckbox');
if (onlyWithFloorsCheckbox) {
    onlyWithFloorsCheckbox.onchange = function() {
        applyFloorsFilter();
    };
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    document.getElementById('assignPlotBtn').onclick = assignPlotToSelected;
    document.getElementById('removePlotBtn').onclick = removePlotFromSelected;
    document.getElementById('exportExcelBtn').onclick = exportToExcel;
    document.getElementById('selectAllBtn').onclick = selectAll;
    document.getElementById('deselectAllBtn').onclick = deselectAll;
    document.getElementById('getLinkBtn').onclick = getMapLink;
    document.getElementById('rulerBtn').onclick = toggleRuler;
    document.getElementById('clearRulerBtn').onclick = clearRuler;
    document.getElementById('filterPlotBtn').onclick = () => {
        const plotNumber = document.getElementById('plotFilterInput').value.trim();
        if (plotNumber) highlightByPlot(plotNumber);
        else alert('Введите номер участка для поиска');
    };
    document.getElementById('clearFilterBtn').onclick = clearHighlight;
    document.getElementById('applyFilterBtn').onclick = applyFloorsFilter;
    document.getElementById('resetFilterBtn').onclick = resetFloorsFilter;
    
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
