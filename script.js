// Global variables
let currentRoute = null;
let currentDirection = null;
let currentStop = null;
let stopsData = []; // This is the global variable we need to update
let busData = null;
let detoursData = null;
let routeBusData = null;
let refreshInterval = null;
let countdownInterval = null;
let lastUpdateTime = 0;
let nextRefreshTime = 0;

// Initialize app
function init() {
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const route = urlParams.get('route');
    const direction = urlParams.get('direction');
    const stop = urlParams.get('stop');

    if (route && direction && stop) {
        currentRoute = route;
        currentDirection = direction;
        currentStop = stop;
        startBusTracking();
    } else {
        // Show initial state
        document.getElementById('mainContent').classList.add('no-route');
    }
}

// --- MODAL AND DATA FETCHING LOGIC (WITH FIXES) ---

// Setup modal functions
function showSetup() {
    const modal = document.getElementById('setupModal');
    modal.style.display = 'block';

    // Initialize modal with current values if they exist
    const routeInput = document.getElementById('routeInput');
    const directionSelect = document.getElementById('directionSelect');
    const stopSelect = document.getElementById('stopSelect');

    routeInput.value = currentRoute || '';

    // Reset and disable dropdowns initially
    directionSelect.innerHTML = '<option value="">Select Direction</option>';
    stopSelect.innerHTML = '<option value="">First select a route</option>';
    directionSelect.disabled = true;
    stopSelect.disabled = true;

    // If there's a current route, load its data for the modal
    if (currentRoute) {
        loadRouteDataForModal(currentRoute);
    }

    routeInput.focus();
}

function hideSetup() {
    document.getElementById('setupModal').style.display = 'none';
}

// Load route data for modal (directions and stops)
async function loadRouteDataForModal(route) {
    if (!route || route.trim() === '') {
        resetModalSelects();
        return;
    }

    const directionSelect = document.getElementById('directionSelect');
    const stopSelect = document.getElementById('stopSelect');

    try {
        // Disable dropdowns and show loading state
        directionSelect.innerHTML = '<option value="">Loading directions...</option>';
        stopSelect.innerHTML = '<option value="">Loading stops...</option>';
        directionSelect.disabled = true;
        stopSelect.disabled = true;

        // Fetch both stops and bus data
        const [stops, buses] = await Promise.all([
            fetchStopsData(route),
            fetchRouteBusData(route)
        ]);

        // **THE FIX:** Assign fetched data to the GLOBAL variables
        stopsData = stops;
        routeBusData = buses;

        // Populate directions and enable the select
        populateDirectionSelect(buses);
        directionSelect.disabled = false;
        
        // Reset stop select until a direction is chosen
        stopSelect.innerHTML = '<option value="">Select a direction</option>';

    } catch (error) {
        console.error('Failed to load route data for modal:', error);
        directionSelect.innerHTML = '<option value="">Error loading</option>';
        stopSelect.innerHTML = '<option value="">Error loading</option>';
    }
}

// Direction change handler - This now works correctly
document.getElementById('directionSelect').addEventListener('change', function() {
    const direction = this.value;
    const stopSelect = document.getElementById('stopSelect');

    if (direction && stopsData && stopsData.length > 0) {
        populateStopSelect(); // Call the function to fill the stops
        stopSelect.disabled = false; // Enable the stop dropdown
    } else {
        // Clear stops if no direction selected
        stopSelect.innerHTML = '<option value="">Select a direction first</option>';
        stopSelect.disabled = true;
    }
});


// Populate direction selection based on actual bus data
function populateDirectionSelect(buses) {
    const directionSelect = document.getElementById('directionSelect');
    const directions = new Set(buses.map(bus => bus.Direction).filter(Boolean));

    directionSelect.innerHTML = '<option value="">Select Direction</option>';
    
    Array.from(directions).sort().forEach(direction => {
        const option = document.createElement('option');
        option.value = direction;
        option.textContent = direction;
        directionSelect.appendChild(option);
    });

    if (directions.size === 1) {
        directionSelect.value = Array.from(directions)[0];
        directionSelect.dispatchEvent(new Event('change'));
    }
}

// Populate stop selection dropdown using the GLOBAL stopsData
function populateStopSelect() {
    const stopSelect = document.getElementById('stopSelect');
    stopSelect.innerHTML = '<option value="">Select your stop</option>';
    
    // It reads from the global stopsData which is now correctly populated
    if (stopsData && stopsData.length > 0) {
        stopsData.forEach(stop => {
            const option = document.createElement('option');
            option.value = stop.stopid;
            option.textContent = stop.stopname;
            stopSelect.appendChild(option);
        });
    }
}


// --- REST OF THE SCRIPT (UNCHANGED) ---

// Route history functions
function showHistory() {
    document.getElementById('historyModal').style.display = 'block';
    displayRouteHistory();
}

function hideHistory() {
    document.getElementById('historyModal').style.display = 'none';
}

function saveRouteToHistory() {
    if (!currentRoute || !currentDirection || !currentStop) return;
    
    const route = {
        route: currentRoute,
        direction: currentDirection,
        stop: currentStop,
        stopName: getStopName(currentStop),
        timestamp: Date.now()
    };
    
    let history = getRouteHistory();
    history = history.filter(h => 
        !(h.route === route.route && h.direction === route.direction && h.stop === route.stop)
    );
    history.unshift(route);
    history = history.slice(0, 10);
    localStorage.setItem('septaBusHistory', JSON.stringify(history));
}

function getRouteHistory() {
    try {
        const history = localStorage.getItem('septaBusHistory');
        return history ? JSON.parse(history) : [];
    } catch (error) {
        console.error('Error reading route history:', error);
        return [];
    }
}

function getStopName(stopId) {
    if (stopsData && stopsData.length > 0) {
        const stop = stopsData.find(s => s.stopid === stopId);
        return stop ? stop.stopname : stopId;
    }
    return stopId;
}

function displayRouteHistory() {
    const historyContent = document.getElementById('historyContent');
    const history = getRouteHistory();
    
    if (history.length === 0) {
        historyContent.innerHTML = '<div class="no-history">No recent routes found.<br>Track a route to build your history!</div>';
        return;
    }
    
    let html = '';
    history.forEach((route, index) => {
        html += `
            <div class="history-item" onclick="selectHistoryRoute(${index})">
                <div class="history-details">
                    <div class="history-route">Route ${route.route} ${route.direction}</div>
                    <div class="history-stop">${route.stopName}</div>
                </div>
                <div class="history-delete" onclick="deleteHistoryRoute(${index}, event)" title="Delete">
                    🗑️
                </div>
            </div>
        `;
    });
    
    historyContent.innerHTML = html;
}

function selectHistoryRoute(index) {
    const history = getRouteHistory();
    if (index >= 0 && index < history.length) {
        const route = history[index];
        currentRoute = route.route;
        currentDirection = route.direction;
        currentStop = route.stop;
        updateRouteTimestamp(route.route, route.direction, route.stop);
        const url = new URL(window.location);
        url.searchParams.set('route', route.route);
        url.searchParams.set('direction', route.direction);
        url.searchParams.set('stop', route.stop);
        window.history.pushState({}, '', url);
        hideHistory();
        startBusTracking();
    }
}

function updateRouteTimestamp(route, direction, stop) {
    let history = getRouteHistory();
    const routeIndex = history.findIndex(h => h.route === route && h.direction === direction && h.stop === stop);
    if (routeIndex !== -1) {
        history[routeIndex].timestamp = Date.now();
        const updatedRoute = history.splice(routeIndex, 1)[0];
        history.unshift(updatedRoute);
        localStorage.setItem('septaBusHistory', JSON.stringify(history));
    }
}

function deleteHistoryRoute(index, event) {
    event.stopPropagation();
    let history = getRouteHistory();
    history.splice(index, 1);
    localStorage.setItem('septaBusHistory', JSON.stringify(history));
    displayRouteHistory();
}

function showInfo() {
    document.getElementById('infoModal').style.display = 'block';
}

function hideInfo() {
    document.getElementById('infoModal').style.display = 'none';
}

function showDetours() {
    document.getElementById('detoursModal').style.display = 'block';
    displayDetours();
}

function hideDetours() {
    document.getElementById('detoursModal').style.display = 'none';
}

async function fetchDetoursData(route) {
    try {
        const septaDetoursUrl = `https://www3.septa.org/api/BusDetours/index.php?route=${route}`;
        const proxyUrl = `/.netlify/functions/septa-proxy?url=${encodeURIComponent(septaDetoursUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy request failed: ${response.status}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Failed to fetch detours:', error);
        return null;
    }
}

function getDetourDirectionCode(fullDirection) {
    const map = { Northbound: 'NB', Southbound: 'SB', Eastbound: 'EB', Westbound: 'WB' };
    return map[fullDirection] || null;
}

function displayDetours() {
    const detoursContent = document.getElementById('detoursContent');
    if (!detoursData || detoursData.length === 0) {
        detoursContent.innerHTML = '<div class="loading">No detour information available</div>';
        return;
    }
    const currentDirectionCode = getDetourDirectionCode(currentDirection);
    let html = '';
    let hasRelevantDetours = false;
    detoursData.forEach(routeDetour => {
        if (routeDetour.route_info && routeDetour.route_info.length > 0) {
            const relevantDetours = routeDetour.route_info.filter(detour => detour.route_direction === currentDirectionCode);
            relevantDetours.forEach(detour => {
                hasRelevantDetours = true;
                html += `
                    <div class="detour-item">
                        <div class="detour-header">
                            <span class="detour-direction">${detour.route_direction}</span>
                            <span class="detour-reason">${detour.reason}</span>
                        </div>
                        ${detour.start_location ? `<div class="detour-location"><strong>From:</strong> ${detour.start_location}</div>` : ''}
                        ${detour.end_location ? `<div class="detour-location"><strong>To:</strong> ${detour.end_location}</div>` : ''}
                        <div class="detour-dates">
                            <strong>Duration:</strong> ${detour.start_date_time} - ${detour.end_date_time}
                        </div>
                        ${detour.current_message ? `<div class="detour-message">${detour.current_message}</div>` : ''}
                    </div>
                `;
            });
        }
    });
    detoursContent.innerHTML = hasRelevantDetours ? html : '<div class="loading">No detours found for your direction of travel</div>';
}

function updateDetoursWarning() {
    const detoursWarning = document.getElementById('detoursWarning');
    const currentDirectionCode = getDetourDirectionCode(currentDirection);
    const hasRelevantDetours = detoursData && detoursData.some(rd =>
        rd.route_info && rd.route_info.some(d => d.route_direction === currentDirectionCode)
    );
    detoursWarning.style.display = hasRelevantDetours ? 'flex' : 'none';
}

function resetModalSelects() {
    const directionSelect = document.getElementById('directionSelect');
    const stopSelect = document.getElementById('stopSelect');
    directionSelect.innerHTML = '<option value="">Select Direction</option>';
    stopSelect.innerHTML = '<option value="">First select a route and direction</option>';
    stopsData = [];
    routeBusData = null;
}

async function fetchRouteBusData(route) {
    try {
        const septaBusUrl = `https://www3.septa.org/api/TransitView/index.php?route=${route}`;
        const proxyUrl = `/.netlify/functions/septa-proxy?url=${encodeURIComponent(septaBusUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy request failed: ${response.status}`);
        const data = await response.json();
        if (!data.bus || !Array.isArray(data.bus)) return [];
        return data.bus.filter(bus => bus.route_id === route && bus.VehicleID !== 'None' && bus.VehicleID !== '0' && bus.late !== 999 && bus.late !== 998);
    } catch (error) {
        console.error('Failed to fetch route bus data:', error);
        return [];
    }
}

async function fetchStopsData(route) {
    try {
        const septaStopsUrl = `https://www3.septa.org/api/Stops/index.php?req1=${route}`;
        const proxyUrl = `/.netlify/functions/septa-proxy?url=${encodeURIComponent(septaStopsUrl)}`;
        const stopsResponse = await fetch(proxyUrl);
        if (!stopsResponse.ok) throw new Error(`Proxy request failed: ${stopsResponse.status}`);
        const septaData = await stopsResponse.json();
        if (!Array.isArray(septaData) || septaData.length === 0) throw new Error('No stops data available from SEPTA API');
        return septaData;
    } catch(error) {
        console.error('Failed to fetch stops data:', error);
        throw error;
    }
}

async function startBusTracking() {
    try {
        showLoading('Loading bus data...');
        document.getElementById('mainContent').classList.remove('no-route');
        if (currentRoute && currentDirection && currentStop) {
            updateRouteTimestamp(currentRoute, currentDirection, currentStop);
        }
        await loadBasicRouteInfo();
        detoursData = await fetchDetoursData(currentRoute);
        updateRouteInfo();
        updateDetoursWarning();
        startTracking();
    } catch (error) {
        showError('Failed to load bus data: ' + error.message);
    }
}

async function loadBasicRouteInfo() {
    try {
        stopsData = await fetchStopsData(currentRoute);
    } catch (error) {
        console.error('Failed to load basic route info:', error);
        stopsData = [];
    }
}

async function applySettings() {
    const route = document.getElementById('routeInput').value.trim();
    const direction = document.getElementById('directionSelect').value;
    const stop = document.getElementById('stopSelect').value;

    if (!route || !direction || !stop) {
        alert('Please fill in all fields');
        return;
    }
    currentRoute = route;
    currentDirection = direction;
    currentStop = stop;
    saveRouteToHistory();
    const url = new URL(window.location);
    url.searchParams.set('route', route);
    url.searchParams.set('direction', direction);
    url.searchParams.set('stop', stop);
    window.history.pushState({}, '', url);
    hideSetup();
    startBusTracking();
}

document.getElementById('routeInput').addEventListener('blur', async function() {
    await loadRouteDataForModal(this.value.trim());
});

document.getElementById('routeInput').addEventListener('keydown', async function(event) {
    if (event.key === 'Enter') {
        await loadRouteDataForModal(this.value.trim());
    }
});

function updateRouteInfo() {
    const routeInfo = document.getElementById('routeInfo');
    const routeTitle = document.getElementById('routeTitle');
    const routeDetails = document.getElementById('routeDetails');
    const stopInfo = stopsData.find(stop => stop.stopid === currentStop);
    const stopName = stopInfo ? stopInfo.stopname : currentStop;
    routeTitle.textContent = `Route ${currentRoute} ${currentDirection}`;
    routeDetails.textContent = `${stopName}`;
    routeInfo.style.display = 'block';
}

function startTracking() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (countdownInterval) clearInterval(countdownInterval);
    fetchBusData();
    refreshInterval = setInterval(fetchBusData, 30000);
    startRefreshCountdown();
    document.getElementById('refreshInfo').style.display = 'block';
}

function manualRefresh() {
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.disabled = true;
    if (refreshInterval) clearInterval(refreshInterval);
    if (countdownInterval) clearInterval(countdownInterval);
    fetchBusData(true).finally(() => {
        refreshInterval = setInterval(fetchBusData, 30000);
        startRefreshCountdown();
        refreshButton.disabled = false;
    });
}

function startRefreshCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    nextRefreshTime = Date.now() + 30000;
    updateRefreshButton();
    countdownInterval = setInterval(updateRefreshButton, 1000);
}

function updateRefreshButton() {
    const refreshCountdown = document.getElementById('refreshCountdown');
    const timeLeft = Math.max(0, Math.ceil((nextRefreshTime - Date.now()) / 1000));
    refreshCountdown.textContent = timeLeft > 0 ? `${timeLeft}s` : '';
    refreshCountdown.style.display = timeLeft > 0 ? 'block' : 'none';
}

function setRefreshButtonError(isError) {
    document.getElementById('refreshButton').classList.toggle('error', isError);
}

async function fetchBusData(isManual = false) {
    try {
        if (!busData || busData.length === 0) showLoading('Getting bus times...');
        const septaBusUrl = `https://www3.septa.org/api/TransitView/index.php?route=${currentRoute}`;
        const proxyUrl = `/.netlify/functions/septa-proxy?url=${encodeURIComponent(septaBusUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy request failed: ${response.status}`);
        const data = await response.json();
        if (!data.bus || !Array.isArray(data.bus)) throw new Error('No bus data available');
        const filteredBuses = data.bus.filter(bus => bus.route_id === currentRoute && bus.Direction === currentDirection && bus.VehicleID !== 'None' && bus.VehicleID !== '0' && bus.late !== 999 && bus.late !== 998);
        busData = filteredBuses;
        lastUpdateTime = Date.now();
        displayBuses(filteredBuses);
        updateLastUpdateTime();
        setRefreshButtonError(false);
        if (!isManual) startRefreshCountdown();
    } catch (error) {
        console.error('Failed to fetch bus data:', error.message);
        setRefreshButtonError(true);
        if (busData && busData.length > 0) {
            updateLastUpdateTime('Error updating');
        } else {
            showError('Unable to load bus data. Please check your connection and try again.');
        }
        if (!isManual) startRefreshCountdown();
    }
}

function displayBuses(buses) {
    const busContent = document.getElementById('busContent');
    const selectedStop = stopsData.find(stop => stop.stopid === currentStop);
    if (!selectedStop) {
        busContent.innerHTML = '<div class="error">Selected stop not found</div>';
        return;
    }
    const stopLat = parseFloat(selectedStop.lat);
    const stopLng = parseFloat(selectedStop.lng);
    const approachingBuses = buses.filter(bus => {
        return isBusApproachingStop(parseFloat(bus.lat), parseFloat(bus.lng), stopLat, stopLng, currentDirection);
    }).map(bus => {
        const distance = calculateDistance(parseFloat(bus.lat), parseFloat(bus.lng), stopLat, stopLng);
        return { ...bus, calculatedDistance: distance, calculatedArrivalTime: estimateArrivalTime(bus, distance), calculatedArrivalMinutes: parseArrivalTimeToMinutes(estimateArrivalTime(bus, distance)) };
    }).sort((a, b) => a.calculatedArrivalMinutes - b.calculatedArrivalMinutes);

    if (approachingBuses.length === 0) {
        busContent.innerHTML = '<div class="loading"><p>No buses approaching your stop right now</p></div>';
        return;
    }

    let html = '';
    approachingBuses.forEach(bus => {
        const occupancyClass = getOccupancyClass(bus.estimated_seat_availability);
        const occupancyText = getOccupancyText(bus.estimated_seat_availability);
        const arrivalClass = bus.late > 3 ? 'late' : '';
        html += `
            <div class="bus-item">
                <div class="bus-info">
                    <div class="bus-number">Bus #${bus.VehicleID}</div>
                    <div class="bus-details">
                        <div class="destination-line">${bus.destination}</div>
                        <div class="next-stop-line">Next: ${bus.next_stop_name || 'Unknown'}</div>
                        <div class="occupancy ${occupancyClass}">${occupancyText}</div>
                    </div>
                </div>
                <div class="arrival-container">
                    <div class="arrival-time ${arrivalClass}">${bus.calculatedArrivalTime}</div>
                    <div class="distance">${bus.calculatedDistance.toFixed(1)} mi</div>
                </div>
            </div>
        `;
    });
    busContent.innerHTML = html;
}

function updateLastUpdateTime(errorMessage = null) {
    const lastUpdateElement = document.getElementById('lastUpdate');
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' });
    if (errorMessage) {
        lastUpdateElement.textContent = `${timeString} (${errorMessage})`;
        lastUpdateElement.style.color = '#dc3545';
    } else {
        lastUpdateElement.textContent = timeString;
        lastUpdateElement.style.color = '#999';
    }
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

function isBusApproachingStop(busLat, busLng, stopLat, stopLng, direction) {
    switch(direction) {
        case 'Northbound': return busLat < stopLat;
        case 'Southbound': return busLat > stopLat;
        case 'Eastbound': return busLng < stopLng;
        case 'Westbound': return busLng > stopLng;
        default: return true;
    }
}

function estimateArrivalTime(bus, distanceMiles) {
    const avgSpeed = 10;
    let travelTimeMinutes = (distanceMiles / avgSpeed) * 60;
    const estimatedStops = Math.floor(distanceMiles / 0.25);
    travelTimeMinutes += estimatedStops * 0.25;
    const timeSinceUpdate = (Date.now() - lastUpdateTime) / (1000 * 60);
    travelTimeMinutes = Math.max(0, travelTimeMinutes - timeSinceUpdate);
    let scaleFactor = 1.0;
    if (distanceMiles <= 0.5) scaleFactor = 0.75;
    else if (distanceMiles <= 1.0) scaleFactor = 0.825;
    else if (distanceMiles <= 1.5) scaleFactor = 0.95;
    travelTimeMinutes *= scaleFactor;
    const totalMinutes = Math.max(1, Math.min(45, Math.round(travelTimeMinutes)));
    return `${totalMinutes} min`;
}

function parseArrivalTimeToMinutes(arrivalTimeString) {
    const match = arrivalTimeString.match(/(\d+) min/);
    return match ? parseInt(match[1]) : 999;
}

function getOccupancyClass(occupancy) {
    const classes = { 'EMPTY': 'empty', 'FEW_SEATS_AVAILABLE': 'few', 'MANY_SEATS_AVAILABLE': 'many', 'FULL': 'full', 'STANDING_ROOM_ONLY': 'standing', 'CRUSHED_STANDING_ROOM_ONLY': 'crushed' };
    return classes[occupancy] || 'few';
}

function getOccupancyText(occupancy) {
    const texts = { 'EMPTY': 'Plenty of seats', 'FEW_SEATS_AVAILABLE': 'Few seats left', 'MANY_SEATS_AVAILABLE': 'Seats available', 'FULL': 'Standing room', 'STANDING_ROOM_ONLY': 'Standing only', 'CRUSHED_STANDING_ROOM_ONLY': 'Very crowded', 'NOT_AVAILABLE': 'Unknown', 'TBD': 'Unknown' };
    return texts[occupancy] || 'Unknown';
}

function showLoading(message) {
    document.getElementById('busContent').innerHTML = `<div class="loading"><p>${message}</p></div>`;
}

function showError(message) {
    document.getElementById('busContent').innerHTML = `<div class="error">${message}</div>`;
}

window.onclick = function(event) {
    const modals = ['setupModal', 'detoursModal', 'infoModal', 'historyModal'];
    const hideFunctions = [hideSetup, hideDetours, hideInfo, hideHistory];
    modals.forEach((id, index) => {
        if (event.target === document.getElementById(id)) {
            hideFunctions[index]();
        }
    });
}

window.addEventListener('load', init);