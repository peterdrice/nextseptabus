// Global variables
let currentRoute = null;
let currentDirection = null;
let currentStop = null;
let stopsData = [];
let busData = null;
let detoursData = null;
let routeBusData = null; // Store route bus data for direction filtering
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

// Setup modal functions
function showSetup() {
    const modal = document.getElementById('setupModal');
    modal.style.display = 'block';
    
    // Initialize modal with current values if they exist
    const routeInput = document.getElementById('routeInput');
    const directionSelect = document.getElementById('directionSelect');
    const stopSelect = document.getElementById('stopSelect');
    
    // Set current values or clear
    routeInput.value = currentRoute || '';
    directionSelect.innerHTML = '<option value="">Select Direction</option>';
    stopSelect.innerHTML = '<option value="">First select a route and direction</option>';
    
    // If there's a current route, load its data for the modal
    if (currentRoute) {
        loadRouteDataForModal(currentRoute);
    }
    
    routeInput.focus();
}

function hideSetup() {
    document.getElementById('setupModal').style.display = 'none';
}

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
    
    // Remove duplicate if it exists
    history = history.filter(h => 
        !(h.route === route.route && h.direction === route.direction && h.stop === route.stop)
    );
    
    // Add to beginning
    history.unshift(route);
    
    // Keep only last 10
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
        
        // Set current values
        currentRoute = route.route;
        currentDirection = route.direction;
        currentStop = route.stop;
        
        // Update timestamp for this route to move it to top
        updateRouteTimestamp(route.route, route.direction, route.stop);
        
        // Update URL
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
    
    // Find and update the timestamp for this specific route
    const routeIndex = history.findIndex(h => 
        h.route === route && h.direction === direction && h.stop === stop
    );
    
    if (routeIndex !== -1) {
        // Update timestamp and move to front
        history[routeIndex].timestamp = Date.now();
        const updatedRoute = history.splice(routeIndex, 1)[0];
        history.unshift(updatedRoute);
        
        localStorage.setItem('septaBusHistory', JSON.stringify(history));
    }
}

function deleteHistoryRoute(index, event) {
    event.stopPropagation(); // Prevent route selection
    
    let history = getRouteHistory();
    history.splice(index, 1);
    localStorage.setItem('septaBusHistory', JSON.stringify(history));
    
    displayRouteHistory(); // Refresh the display
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

// Fetch detours data
async function fetchDetoursData(route) {
    try {
        const septaDetoursUrl = `https://www3.septa.org/api/BusDetours/index.php?route=${route}`;
        const proxyUrl = `/.netlify/functions/septa-proxy?url=${encodeURIComponent(septaDetoursUrl)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Proxy request failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Detours data:', data);
        return data;
    } catch (error) {
        console.error('Failed to fetch detours:', error);
        return null;
    }
}

// Helper function to convert full direction names to detour abbreviations
function getDetourDirectionCode(fullDirection) {
    switch(fullDirection) {
        case 'Northbound': return 'NB';
        case 'Southbound': return 'SB';
        case 'Eastbound': return 'EB';
        case 'Westbound': return 'WB';
        default: return null;
    }
}

// Display detours in modal
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
            // Filter detours for current direction only
            const relevantDetours = routeDetour.route_info.filter(detour => 
                detour.route_direction === currentDirectionCode
            );
            
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

    if (!hasRelevantDetours) {
        detoursContent.innerHTML = '<div class="loading">No detours found for your direction of travel</div>';
    } else {
        detoursContent.innerHTML = html;
    }
}

// Update detours warning display
function updateDetoursWarning() {
    const detoursWarning = document.getElementById('detoursWarning');
    
    if (detoursData && detoursData.length > 0) {
        // Check if there are any detours for the current direction
        const currentDirectionCode = getDetourDirectionCode(currentDirection);
        const hasRelevantDetours = detoursData.some(routeDetour => 
            routeDetour.route_info && routeDetour.route_info.some(detour =>
                detour.route_direction === currentDirectionCode
            )
        );
        
        if (hasRelevantDetours) {
            detoursWarning.style.display = 'flex';
        } else {
            detoursWarning.style.display = 'none';
        }
    } else {
        detoursWarning.style.display = 'none';
    }
}

// Load route data for modal (directions and stops) - only called when modal is opened
async function loadRouteDataForModal(route) {
    if (!route || route.trim() === '') {
        resetModalSelects();
        return;
    }
    
    try {
        // Show loading state
        const directionSelect = document.getElementById('directionSelect');
        const stopSelect = document.getElementById('stopSelect');
        directionSelect.innerHTML = '<option value="">Loading directions...</option>';
        stopSelect.innerHTML = '<option value="">Loading stops...</option>';
        
        // Fetch both stops and bus data specifically for modal
        const [stops, buses] = await Promise.all([
            fetchStopsData(route),
            fetchRouteBusData(route)
        ]);
        
        // Store data for modal use only
        const modalStopsData = stops;
        const modalRouteBusData = buses;
        
        // Populate directions
        populateDirectionSelect(buses);
        
        // If we have a current direction, set it and load stops
        if (currentDirection) {
            const directionSelect = document.getElementById('directionSelect');
            if ([...directionSelect.options].some(option => option.value === currentDirection)) {
                directionSelect.value = currentDirection;
                populateStopSelect(modalStopsData);
                
                // If we have a current stop, set it
                if (currentStop) {
                    const stopSelect = document.getElementById('stopSelect');
                    if ([...stopSelect.options].some(option => option.value === currentStop)) {
                        stopSelect.value = currentStop;
                    }
                }
            }
        } else {
            // Reset stops since no direction is selected
            stopSelect.innerHTML = '<option value="">Select a direction first</option>';
        }
        
    } catch (error) {
        console.error('Failed to load route data for modal:', error);
        const directionSelect = document.getElementById('directionSelect');
        const stopSelect = document.getElementById('stopSelect');
        directionSelect.innerHTML = '<option value="">Error loading directions</option>';
        stopSelect.innerHTML = '<option value="">Error loading stops</option>';
    }
}

// Reset modal select elements to initial state
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
        
        if (!response.ok) {
            throw new Error(`Proxy request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.bus || !Array.isArray(data.bus)) {
            return [];
        }
        
        return data.bus.filter(bus => 
            bus.route_id === route &&
            bus.VehicleID !== 'None' && 
            bus.VehicleID !== '0' &&
            bus.late !== 999 &&
            bus.late !== 998
        );
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
        
        if (!stopsResponse.ok) {
            throw new Error(`Proxy request failed: ${stopsResponse.status}`);
        }
        
        const septaData = await stopsResponse.json();
        
        if (!Array.isArray(septaData) || septaData.length === 0) {
            throw new Error('No stops data available from SEPTA API');
        }
        
        console.log('Loaded stops from live SEPTA API');
        return septaData;
    } catch(error) {
        console.error('Failed to fetch stops data:', error);
        throw error;
    }
}

// New function to start bus tracking directly from URL parameters
async function startBusTracking() {
    try {
        showLoading('Loading bus data...');
        
        // Remove no-route class
        document.getElementById('mainContent').classList.remove('no-route');
        
        // Update timestamp when route is loaded (if it exists in history)
        if (currentRoute && currentDirection && currentStop) {
            updateRouteTimestamp(currentRoute, currentDirection, currentStop);
        }
        
        // Load basic route info for display (we only need stop name)
        // We'll load just enough data to show the route info, not full modal data
        await loadBasicRouteInfo();
        
        // Load detours data
        detoursData = await fetchDetoursData(currentRoute);
        
        updateRouteInfo();
        updateDetoursWarning();
        startTracking();
    } catch (error) {
        showError('Failed to load bus data: ' + error.message);
    }
}

// Load minimal route info needed for display (just stop name)
async function loadBasicRouteInfo() {
    try {
        stopsData = await fetchStopsData(currentRoute);
    } catch (error) {
        console.error('Failed to load basic route info:', error);
        // Continue anyway - we can still track buses without stop names
        stopsData = [];
    }
}

// Apply settings from modal
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

    // Save to history
    saveRouteToHistory();

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('route', route);
    url.searchParams.set('direction', direction);
    url.searchParams.set('stop', stop);
    window.history.pushState({}, '', url);

    hideSetup();
    startBusTracking();
}

// Load stops for route selection - on blur
document.getElementById('routeInput').addEventListener('blur', async function() {
    const route = this.value.trim();
    await loadRouteDataForModal(route);
});

// Load stops for route selection - on 'enter'
document.getElementById('routeInput').addEventListener('keydown', async function(event) {
    if (event.key === 'Enter') {
        const route = this.value.trim();
        await loadRouteDataForModal(route);
    }
});

// Populate direction selection based on actual bus data
function populateDirectionSelect(buses) {
    const directionSelect = document.getElementById('directionSelect');
    const directions = new Set();
    
    // Extract unique directions from bus data
    buses.forEach(bus => {
        if (bus.Direction) {
            directions.add(bus.Direction);
        }
    });
    
    // Clear and populate direction select
    directionSelect.innerHTML = '<option value="">Select Direction</option>';
    
    Array.from(directions).sort().forEach(direction => {
        const option = document.createElement('option');
        option.value = direction;
        option.textContent = direction;
        directionSelect.appendChild(option);
    });
    
    // If only one direction available, auto-select it
    if (directions.size === 1) {
        directionSelect.value = Array.from(directions)[0];
        directionSelect.dispatchEvent(new Event('change'));
    }
}

// Populate stop selection dropdown using modal-specific data
function populateStopSelect(modalStopsData) {
    const stopSelect = document.getElementById('stopSelect');
    const direction = document.getElementById('directionSelect').value;
    
    stopSelect.innerHTML = '<option value="">Select your stop</option>';
    
    if (direction && modalStopsData && modalStopsData.length > 0) {
        modalStopsData.forEach(stop => {
            const option = document.createElement('option');
            option.value = stop.stopid;
            option.textContent = stop.stopname;
            stopSelect.appendChild(option);
        });
    }
}

// Direction change handler
document.getElementById('directionSelect').addEventListener('change', function() {
    const direction = this.value;
    if (direction && stopsData && stopsData.length > 0) {
        populateStopSelect(stopsData);
    } else {
        // Clear stops if no direction selected
        const stopSelect = document.getElementById('stopSelect');
        stopSelect.innerHTML = '<option value="">Select a direction first</option>';
    }
});

// Update route information display
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

// Start tracking buses
function startTracking() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    fetchBusData();
    refreshInterval = setInterval(fetchBusData, 30000);
    
    // Start refresh countdown
    startRefreshCountdown();
    
    // Show refresh info
    document.getElementById('refreshInfo').style.display = 'block';
}

// Manual refresh function
function manualRefresh() {
    const refreshButton = document.getElementById('refreshButton');
    refreshButton.disabled = true;
    
    // Clear existing intervals to prevent conflicts
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    // Call fetchBusData with a flag to indicate this is a manual refresh
    fetchBusData(true).then(() => {
        // Restart both the data fetching interval and countdown
        refreshInterval = setInterval(fetchBusData, 30000);
        startRefreshCountdown();
        refreshButton.disabled = false;
    }).catch(() => {
        // Even on error, restart the intervals
        refreshInterval = setInterval(fetchBusData, 30000);
        startRefreshCountdown();
        refreshButton.disabled = false;
    });
}

// Start/restart the refresh countdown
function startRefreshCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
    
    nextRefreshTime = Date.now() + 30000; // 30 seconds from now
    updateRefreshButton();
    
    countdownInterval = setInterval(updateRefreshButton, 1000);
}

// Update refresh button with countdown
function updateRefreshButton() {
    const refreshButton = document.getElementById('refreshButton');
    const refreshCountdown = document.getElementById('refreshCountdown');
    const timeLeft = Math.max(0, Math.ceil((nextRefreshTime - Date.now()) / 1000));
    
    if (timeLeft > 0) {
        refreshCountdown.textContent = `${timeLeft}s`;
        refreshCountdown.style.display = 'block';
    } else {
        refreshCountdown.textContent = '';
        refreshCountdown.style.display = 'none';
    }
}

// Utility function to set refresh button error state
function setRefreshButtonError(isError) {
    const refreshButton = document.getElementById('refreshButton');
    if (isError) {
        refreshButton.classList.add('error');
    } else {
        refreshButton.classList.remove('error');
    }
}

// Fetch bus data from SEPTA API
async function fetchBusData() {
    try {
        // Only show loading if we don't have existing data
        if (!busData || busData.length === 0) {
            showLoading('Getting bus times...');
        }
        
        const septaBusUrl = `https://www3.septa.org/api/TransitView/index.php?route=${currentRoute}`;
        const proxyUrl = `/.netlify/functions/septa-proxy?url=${encodeURIComponent(septaBusUrl)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Proxy request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.bus || !Array.isArray(data.bus)) {
            throw new Error('No bus data available from SEPTA API');
        }
        
        // Filter the bus data
        const filteredBuses = data.bus.filter(bus => 
            bus.route_id === currentRoute &&
            bus.Direction === currentDirection && 
            bus.VehicleID !== 'None' && 
            bus.VehicleID !== '0' &&
            bus.late !== 999 &&
            bus.late !== 998
        );
        
        // Only update if we got data successfully
        busData = filteredBuses;
        lastUpdateTime = Date.now();
        
        displayBuses(filteredBuses);
        updateLastUpdateTime();
        
        // Clear error state since update was successful
        setRefreshButtonError(false);
        
        console.log('Successfully updated bus data from live SEPTA API');
        
        // Only reset countdown if this wasn't called from manualRefresh
        // (manualRefresh handles its own countdown restart)
        if (!arguments[0]) {
            startRefreshCountdown();
        }
        
    } catch (error) {
        console.error('Failed to fetch bus data:', error.message);
        
        // Set refresh button to error state
        setRefreshButtonError(true);
        
        // If we have existing data, keep showing it but indicate there was an error
        if (busData && busData.length > 0) {
            console.log('Keeping existing bus data due to API error');
            // Optionally show a subtle error indicator without disrupting the display
            updateLastUpdateTime('Error updating');
        } else {
            // Only show error message if we have no data at all
            showError('Unable to load bus data. Please check your connection and try again.');
        }
        
        // Only reset countdown if this wasn't called from manualRefresh
        if (!arguments[0]) {
            startRefreshCountdown();
        }
    }
}

// Display buses in the list
function displayBuses(buses) {
    const busContent = document.getElementById('busContent');
    
    if (buses.length === 0) {
        busContent.innerHTML = '<div class="loading"><p>No buses currently running</p></div>';
        return;
    }

    // Get the selected stop's coordinates
    const selectedStop = stopsData.find(stop => stop.stopid === currentStop);
    if (!selectedStop) {
        busContent.innerHTML = '<div class="error">Selected stop not found</div>';
        return;
    }

    const stopLat = parseFloat(selectedStop.lat);
    const stopLng = parseFloat(selectedStop.lng);

    // Filter and process buses
    const approachingBuses = buses.filter(bus => {
        const busLat = parseFloat(bus.lat);
        const busLng = parseFloat(bus.lng);
        return isBusApproachingStop(busLat, busLng, stopLat, stopLng, currentDirection);
    }).map(bus => {
        const distance = calculateDistance(parseFloat(bus.lat), parseFloat(bus.lng), stopLat, stopLng);
        const arrivalTime = estimateArrivalTime(bus, distance);
        const arrivalMinutes = parseArrivalTimeToMinutes(arrivalTime);
        
        return {
            ...bus,
            calculatedDistance: distance,
            calculatedArrivalTime: arrivalTime,
            calculatedArrivalMinutes: arrivalMinutes
        };
    });

    if (approachingBuses.length === 0) {
        busContent.innerHTML = '<div class="loading"><p>No buses approaching your stop right now</p></div>';
        return;
    }

    // Sort by arrival time
    approachingBuses.sort((a, b) => a.calculatedArrivalMinutes - b.calculatedArrivalMinutes);

    let html = '';
    approachingBuses.forEach((bus, index) => {
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

// Update arrival times in real-time
function updateArrivalTimes() {
    if (!busData || busData.length === 0) return;
    
    const selectedStop = stopsData.find(stop => stop.stopid === currentStop);
    if (!selectedStop) return;
    
    const stopLat = parseFloat(selectedStop.lat);
    const stopLng = parseFloat(selectedStop.lng);
    
    const busItems = document.querySelectorAll('.bus-item');
    const currentBuses = Array.from(busItems).map(item => {
        const busNumber = item.querySelector('.bus-number').textContent.replace('Bus #', '');
        return busData.find(bus => bus.VehicleID === busNumber);
    }).filter(bus => bus);
    
    // Update each bus's arrival time
    currentBuses.forEach((bus, index) => {
        if (busItems[index]) {
            const distance = calculateDistance(parseFloat(bus.lat), parseFloat(bus.lng), stopLat, stopLng);
            const newArrivalTime = estimateArrivalTime(bus, distance);
            const arrivalElement = busItems[index].querySelector('.arrival-time');
            
            if (arrivalElement.textContent !== newArrivalTime) {
                arrivalElement.textContent = newArrivalTime;
                
                // Update styling based on new time
                const minutes = parseArrivalTimeToMinutes(newArrivalTime);
                arrivalElement.className = 'arrival-time';
                if (bus.late > 3) {
                    arrivalElement.classList.add('late');
                }
            }
        }
    });
}

// Update last update time display
function updateLastUpdateTime(errorMessage = null) {
    const lastUpdateElement = document.getElementById('lastUpdate');
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    if (errorMessage) {
        lastUpdateElement.textContent = `${timeString} (${errorMessage})`;
        lastUpdateElement.style.color = '#dc3545';
    } else {
        lastUpdateElement.textContent = timeString;
        lastUpdateElement.style.color = '#999';
    }
}

// Utility functions
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
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
    // Use consistent speed for all buses
    const avgSpeed = 10; // mph - reasonable city bus speed
    
    // Base travel time
    let travelTimeMinutes = (distanceMiles / avgSpeed) * 60;
    
    // Add minimal time for stops
    const estimatedStops = Math.floor(distanceMiles / 0.25); // One stop every quarter mile
    const stopTimeMinutes = estimatedStops * 0.25; // 15 seconds per stop
    travelTimeMinutes += stopTimeMinutes;
    
    // Factor in schedule status
    const scheduleAdjustment = parseInt(bus.late) || 0;
    
    // Factor in time since last update (buses are moving)
    const timeSinceUpdate = (Date.now() - lastUpdateTime) / (1000 * 60);
    travelTimeMinutes = Math.max(0, travelTimeMinutes - timeSinceUpdate);
    
    // // Apply schedule adjustment
    // travelTimeMinutes += scheduleAdjustment;
    
    // Apply distance-based scale factors to encourage urgency for closer buses
    let scaleFactor;
    if (distanceMiles <= 0.5) {
        scaleFactor = 0.75; // Very close - 25% less time shown
    } else if (distanceMiles <= 1.0) {
        scaleFactor = 0.825; // Close - 17.5% less time shown
    } else if (distanceMiles <= 1.5) {
        scaleFactor = 0.95; // Medium - 5% less time shown
    } else {
        scaleFactor = 1.0; // Far - actual time
    }
    
    // Apply scale factor
    travelTimeMinutes *= scaleFactor;
    
    // Ensure reasonable bounds: 1-45 minutes
    const totalMinutes = Math.max(1, Math.min(45, Math.round(travelTimeMinutes)));
    
    return `${totalMinutes} min`;
}

function parseArrivalTimeToMinutes(arrivalTimeString) {
    const match = arrivalTimeString.match(/(\d+) min/);
    return match ? parseInt(match[1]) : 999;
}

function getOccupancyClass(occupancy) {
    switch(occupancy) {
        case 'EMPTY': return 'empty';
        case 'FEW_SEATS_AVAILABLE': return 'few';
        case 'MANY_SEATS_AVAILABLE': return 'many';  
        case 'FULL': return 'full';
        case 'STANDING_ROOM_ONLY': return 'standing';
        case 'CRUSHED_STANDING_ROOM_ONLY': return 'crushed';
        default: return 'few';
    }
}

function getOccupancyText(occupancy) {
    switch(occupancy) {
        case 'EMPTY': return 'Plenty of seats';
        case 'FEW_SEATS_AVAILABLE': return 'Few seats left';
        case 'MANY_SEATS_AVAILABLE': return 'Seats available';
        case 'FULL': return 'Standing room';
        case 'STANDING_ROOM_ONLY': return 'Standing only';
        case 'CRUSHED_STANDING_ROOM_ONLY': return 'Very crowded';
        case 'NOT_AVAILABLE': return 'Unknown';
        case 'TBD': return 'Unknown';
        default: 'Unknown';
    }
}

function showLoading(message) {
    document.getElementById('busContent').innerHTML = `<div class="loading"><p>${message}</p></div>`;
}

function showError(message) {
    document.getElementById('busContent').innerHTML = `<div class="error">${message}</div>`;
}

// Close modal when clicking outside
window.onclick = function(event) {
    const setupModal = document.getElementById('setupModal');
    const detoursModal = document.getElementById('detoursModal');
    const infoModal = document.getElementById('infoModal');
    const historyModal = document.getElementById('historyModal');
    
    if (event.target === setupModal) {
        hideSetup();
    }
    if (event.target === detoursModal) {
        hideDetours();
    }
    if (event.target === infoModal) {
        hideInfo();
    }
    if (event.target === historyModal) {
        hideHistory();
    }
}

// Initialize app when page loads
window.addEventListener('load', init);