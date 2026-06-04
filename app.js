// app.js - стабильная рабочая версия

let map;
let markers = [];
let markerData = [];
let addressData = [];
let mapReady = false;
let selectedMarkerIndexes = new Set();
let isRestoringFromURL = false;
let currentFilterPlot = null;

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

// Простое копирование ссылки (без сокращения)
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

// Остальные функции (addMarker, toggleMarkerSelection, updateMarkerColor, 
// updateAptSum, selectAll, deselectAll, assignPlotToSelected, 
// updateSelectionStats, updateStats, updateAddressList, clearAll, 
// exportToExcel, processExcelFile, highlightByPlot, clearHighlight, 
// getPinSvg) остаются без изменений из предыдущей версии

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
        if (plotNumber) highlightByPlot(plotNumber);
        else alert('Введите номер участка');
    };
    document.getElementById('clearFilterBtn').onclick = clearHighlight;
    
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
        else alert('Загрузите файл Excel');
    };
    fileInput.onchange = (e) => { if (e.target.files[0]) processExcelFile(e.target.files[0]); };
});
