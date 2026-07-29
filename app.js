// API Configuration
const API_BASE_URL = 'https://bitmesspass-backend.onrender.com';
//const API_BASE_URL = 'http://localhost:3001';
// API Helper Functions
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const text = await response.text();
        const result = text ? JSON.parse(text) : null;

        if (!response.ok) {
            console.error('API Error: Non-OK response', {
                status: response.status,
                statusText: response.statusText,
                body: result || text,
                endpoint: `${API_BASE_URL}${endpoint}`
            });
            return {
                success: false,
                message: result?.message || `Connection failed: ${response.status} ${response.statusText}`
            };
        }

        return result;
    } catch (error) {
        console.error('API Error:', error, { endpoint: `${API_BASE_URL}${endpoint}`, options });
        return { success: false, message: 'Connection failed. Is the backend running at ' + API_BASE_URL + ' ?' };
    }
}

let qrExpiryTime = null;


// Application Data
const appData = {
    mealSlots: [
                {
            id: "breakfast",
            name: "Breakfast",
            startTime: "07:30",
            endTime: "09:00",
            displayTime: "7:30 AM - 9:00 AM"
        },
        {
            id: "lunch", 
            name: "Lunch",
            startTime: "12:30",
            endTime: "14:00", 
            displayTime: "12:30 PM - 2:00 PM"
        },
        {
            id: "snacks",
            name: "Snacks",
            startTime: "15:00",
            endTime: "18:30",
            displayTime: "5:00 PM - 6:30 PM"
        },
        {
            id: "dinner",
            name: "Dinner", 
            startTime: "18:40",
            endTime: "23:00",
            displayTime: "8:00 PM - 10:00 PM"
        }
    ],

    allowedLocation: {
        name: "Allowed Hostel Area"
    }
};

// Application State
let isBackendLocationValid = false;
let verifiedLocationName = null;
let currentUser = null;
let userLocation = null;
let qrTimer = null;
let qrStatusPoll = null;
let currentQRData = null;

// Screen Management
function showScreen(screenId) {
    console.log('Switching to screen:', screenId);
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        console.log('Screen switched successfully to:', screenId);
    } else {
        console.error('Screen not found:', screenId);
    }
}

// Student Authentication
let googleOAuthInitialized = false;

function initializeGoogleOAuthOnce() {
    if (googleOAuthInitialized) return true;

    if (typeof google === 'undefined') {
        console.error('Google OAuth SDK not loaded');
        alert('Google OAuth not available. Please refresh the page.');
        return false;
    }

    google.accounts.id.initialize({
        client_id: '439746768038-882bgdhrt4qmft3el25lqf5djs36bgtg.apps.googleusercontent.com',
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: false
    });

    googleOAuthInitialized = true;
    return true;
}

function handleStudentLogin() {
    console.log('Starting Google College Gmail login...');

    const ready = initializeGoogleOAuthOnce();
    if (!ready) return;

    google.accounts.id.prompt((notification) => {
        console.log('Google prompt notification:', notification);

        if (notification.isNotDisplayed()) {
            alert('Google sign-in could not be displayed. Please allow popups/cookies and try again.');
        }

        if (notification.isSkippedMoment()) {
            console.log('Google sign-in skipped or closed by user.');
        }
    });
}


// New function to handle Google OAuth response
async function handleGoogleResponse(response) {
    console.log('Google OAuth response received');
    
    try {
        // Send the Google JWT token to our backend
            let deviceId = localStorage.getItem('smartpass_device_id');

            if (!deviceId) {
                deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2);
                localStorage.setItem('smartpass_device_id', deviceId);
            }

            const result = await apiCall('/api/student/login', 'POST', {
                token: response.credential,
                deviceId: deviceId
            });
        
        if (result.success) {
            currentUser = result.user;

            localStorage.setItem('smartpass_token', result.token);
            localStorage.setItem('smartpass_user', JSON.stringify(result.user));

            console.log('User authenticated via Google OAuth:', currentUser.name);
            
            // Populate student data
            populateStudentData();
            
            // Switch to dashboard
            showScreen('student-dashboard');
            
            // Check location
            setTimeout(() => {
                checkLocation();
            }, 500);
            
        } else {
            alert('❌ Authentication failed: ' + result.message);
        }
        
    } catch (error) {
        console.error('Authentication error:', error);
        alert('❌ Authentication failed. Please try again.');
    }
}


function populateStudentData() {
    if (!currentUser) {
        console.error('No current user found');
        return;
    }
    
    console.log('Populating student data for:', currentUser.name);
    
    // Dashboard elements mapping
    const elements = [
        { id: 'student-photo', value: currentUser.photo, type: 'src' },
        { id: 'student-name', value: currentUser.name, type: 'text' },
        { id: 'student-roll', value: currentUser.id, type: 'text' },
        { id: 'student-branch', value: currentUser.branch, type: 'text' },
        { id: 'student-hostel-room', value: currentUser.hostelRoom || currentUser.hostel || '', type: 'text' },
        { id: 'profile-photo', value: currentUser.photo, type: 'src' },
        { id: 'profile-name', value: currentUser.name, type: 'text' },
        { id: 'profile-roll', value: currentUser.id, type: 'text' },
        { id: 'profile-branch', value: currentUser.branch, type: 'text' },
        { id: 'profile-year', value: currentUser.year, type: 'text' },
        { id: 'profile-hostel-room', value: currentUser.hostelRoom || currentUser.hostel || '', type: 'text' },
        { id: 'profile-hostel', value: currentUser.hostel, type: 'text' },
        { id: 'qr-student-photo', value: currentUser.photo, type: 'src' },
        { id: 'qr-student-name', value: currentUser.name, type: 'text' },
        { id: 'qr-student-roll', value: currentUser.id, type: 'text' },
        { id: 'qr-student-branch', value: currentUser.branch, type: 'text' },
        { id: 'qr-student-hostel-room', value: currentUser.hostelRoom || currentUser.hostel || '', type: 'text' }
    ];
    
    // Populate all elements
    elements.forEach(elem => {
        const element = document.getElementById(elem.id);
        if (element) {
            if (elem.type === 'src') {
                element.src = elem.value;
                element.alt = `${currentUser.name} photo`;
            } else {
                element.textContent = elem.value;
            }
        } else {
            console.warn('Element not found:', elem.id);
        }
    });
    
    // Render meal slots after data is populated
    renderMealSlots();
}

// Location Services
// Real Location Services
function checkGeolocation() {
    console.log('Initializing real geolocation services...');
    
    // Check if geolocation is supported
    if (!navigator.geolocation) {
        console.error('Geolocation not supported by this browser');
        showLocationError('Geolocation not supported by your device');
        return;
    }
    
    // Initially set location as unknown
    userLocation = null;
    updateLocationStatus('checking');
    
    console.log('Geolocation API available, ready for location checks');
}

async function requestLocationPermission() {

    isBackendLocationValid = false;
    verifiedLocationName = null;
    userLocation = null;

    updateLocationStatus('requesting');
    
    const options = {
        enableHighAccuracy: true,  // Use GPS if available
        timeout: 10000,           // 10 second timeout
        maximumAge: 10        
    };
    
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
        
        const currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
        };
        
        console.log('📍 Location obtained:', {
            lat: currentLocation.latitude.toFixed(6),
            lng: currentLocation.longitude.toFixed(6),
            accuracy: Math.round(currentLocation.accuracy)
        });
        
        // Verify location with backend
        const savedUser = JSON.parse(localStorage.getItem('smartpass_user') || 'null');
        const activeUser = currentUser || savedUser;

        console.log('LOCATION USER DEBUG:', activeUser);

        const result = await apiCall('/api/location/verify', 'POST', {
            ...currentLocation,
            email: activeUser?.email || null,
            rollNo: activeUser?.id || null,
            studentName: activeUser?.name || null
        });

        let locationName = result.locationName;


    // Check backend response
    console.log('- Backend result:', result);


    if (result.isValid) {
        userLocation = currentLocation;
        isBackendLocationValid = true;
        verifiedLocationName = locationName;

        updateLocationStatus('verified', null, locationName);
        console.log('✅ Location verified - At:', locationName);
    } else {
        userLocation = null;
        isBackendLocationValid = false;
        verifiedLocationName = null;

        updateLocationStatus('invalid', result.distance, result.message);
        console.log('❌ Location invalid - At:', locationName, 'Distance:', result.distance, 'meters');
    }


        
        // Re-render meal slots based on location
        renderMealSlots();
        
    } catch (error) {
        console.error('Location error:', error);
        userLocation = null;
        
        let errorMessage = 'Location access denied';
        if (error.code === 1) {
            errorMessage = 'Location access denied. Please enable location services.';
        } else if (error.code === 2) {
            errorMessage = 'Location unavailable. Please check your GPS.';
        } else if (error.code === 3) {
            errorMessage = 'Location request timed out. Please try again.';
        }
        
        updateLocationStatus('error', null, errorMessage);
        renderMealSlots();
    }
}

function updateLocationStatus(status, distance = null, errorMessage = null) {
    const locationText = document.getElementById('location-text');
    const locationButton = document.getElementById('location-check-btn');
    
    if (!locationText) {
        console.warn('Location text element not found');
        return;
    }
    
    // Create button if it doesn't exist
    if (!locationButton) {
        createLocationButton();
    }
    
    const button = document.getElementById('location-check-btn');
    
    switch (status) {
        case 'checking':
            locationText.textContent = "Location services ready";
            locationText.className = "location-subtitle";
            if (button) {
                button.textContent = "Check My Location";
                button.disabled = false;
                button.className = "btn btn--secondary location-check-btn";
            }
            break;
            
        case 'requesting':
            locationText.textContent = "🔍 Getting your location...";
            locationText.className = "location-subtitle";
            if (button) {
                button.textContent = "⏳ Checking...";
                button.disabled = true;
                button.className = "btn btn--secondary location-check-btn disabled";
            }
            break;
            
        case 'verified':
            const verifiedLocationName = errorMessage || 'Allowed Hostel Area';
            locationText.textContent = `✅ You are at ${verifiedLocationName} - Location Verified`;
            locationText.className = "location-subtitle location-verified";
            if (button) {
                button.textContent = "Check Location Again";
                button.disabled = false;
                button.className = "btn btn--success location-check-btn";
                button.onclick = requestLocationPermission;
            }
            break;

            
            case 'invalid':
                const distanceText = distance ? ` (${distance}m away)` : '';
                locationText.textContent = `❌ Not in allowed hostel/mess area${distanceText}`;
                locationText.className = "location-subtitle location-not-verified";
                if (button) {
                    button.textContent = "🔄 Check Location Again";
                    button.disabled = false;
                    button.className = "btn btn--primary location-check-btn";
                }
                break;

            
        case 'error':
            locationText.textContent = errorMessage || "❌ Location unavailable";
            locationText.className = "location-subtitle location-error";
            if (button) {
                button.textContent = "🔄 Try Again";
                button.disabled = false;
                button.className = "btn btn--primary location-check-btn";
            }
            break;
    }
}

function createLocationButton() {
    const locationText = document.getElementById('location-text');
    if (!locationText || !locationText.parentNode) return;

    const button = document.createElement('button');
    button.id = 'location-check-btn';
    button.className = 'btn btn--secondary location-check-btn';
    button.textContent = 'Check My Location';
    button.disabled = false;
    button.onclick = requestLocationPermission;

    locationText.parentNode.appendChild(button);
}


function checkLocation() {
    // This function now just triggers a re-render of meal slots
    // The actual location checking is handled by requestLocationPermission()
    renderMealSlots();
}


function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Meal Slot Management
// Meal Slot Management with Location Control
// Meal Slot Management with Location Control
function renderMealSlots() {

    
    const container = document.getElementById('meal-slots');
    if (!container) {
        console.warn('Meal slots container not found');
        return;
    }
    
    const isLocationValid = checkLocationValidity();
    
    console.log('Rendering meal slots - Location valid:', isLocationValid);
    container.innerHTML = '';
    
    if (!isLocationValid) {
        // Show location requirement message
        const locationWarning = document.createElement('div');
        locationWarning.className = 'location-warning';
        locationWarning.innerHTML = `
            <div class="warning-card">
                <div class="warning-icon">📍</div>
                <div class="warning-content">
                    <h3>Location Required</h3>
                    <p>You must be inside an allowed hostel area to access meal slots.</p>
                    <p class="warning-subtitle">Click "Check My Location" above to verify your location.</p>
                </div>
            </div>
        `;
        container.appendChild(locationWarning);
        return;
    }
    
    // Get only the next meal slot
    const nextSlot = getNextMealSlot();
    const isActive = isCurrentMealActive(nextSlot);
    
    console.log(`Rendering single slot: ${nextSlot.name}, Active: ${isActive}`);
    
    // Create meal slot card
    const slotCard = document.createElement('div');
    slotCard.className = `meal-slot-card ${!isActive ? 'disabled' : ''}`;
    
    // Determine status text and color
    let statusText = 'Unavailable';
    let statusClass = 'error';
    
    if (isActive) {
        statusText = 'Available Now';
        statusClass = 'success';
    } else {
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        const startTime = parseInt(nextSlot.startTime.replace(':', ''));
        
        if (currentTime < startTime - 15) {
            statusText = 'Coming Soon';
            statusClass = 'warning';
        }
    }
    
    slotCard.innerHTML = `
        <div class="meal-slot-header">
            <div class="meal-name">${nextSlot.name}</div>
            <div class="meal-status status--${statusClass}">
                ${statusText}
            </div>
        </div>
        <div class="meal-time">${nextSlot.displayTime}</div>
    `;
    
    if (isActive) {
        slotCard.style.cursor = 'pointer';
        slotCard.addEventListener('click', function() {
            console.log('Meal slot clicked:', nextSlot.name);
            generateQR(nextSlot);
        });
        slotCard.addEventListener('mouseenter', function() {
            slotCard.style.transform = 'translateY(-2px)';
        });
        slotCard.addEventListener('mouseleave', function() {
            slotCard.style.transform = 'translateY(0)';
        });
    }
    
    container.appendChild(slotCard);
}


function checkLocationValidity() {
    return isBackendLocationValid === true;
}

// Get the next upcoming meal slot
function getNextMealSlot() {
    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes(); // Convert to HHMM format
    
    console.log('Current time:', Math.floor(currentTime/100) + ':' + String(currentTime%100).padStart(2,'0'));
    
    // Check each meal slot in order
    for (let slot of appData.mealSlots) {
        const startTime = parseInt(slot.startTime.replace(':', ''));
        const endTime = parseInt(slot.endTime.replace(':', ''));
        
        console.log(`Checking ${slot.name}: ${slot.startTime}-${slot.endTime} (${startTime}-${endTime})`);
        
        // If current time is before this slot starts, this is the next slot
        if (currentTime < startTime) {
            console.log(`✅ Next meal: ${slot.name} (upcoming)`);
            return slot;
        }
        
        // If current time is during this slot, this is the current/active slot
        if (currentTime >= startTime && currentTime <= endTime) {
            console.log(`✅ Current meal: ${slot.name} (active now)`);
            return slot;
        }
    }
    
    // If we're past all slots for today, return breakfast (next day)
    console.log('✅ All meals done today, next meal: Breakfast (tomorrow)');
    return appData.mealSlots[0]; // Return breakfast for next day
}

// Check if the current meal slot is available (active)
function isCurrentMealActive(slot) {
    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes();
    const startTime = parseInt(slot.startTime.replace(':', ''));
    const endTime = parseInt(slot.endTime.replace(':', ''));
    
    // Available 15 minutes before start time and during the slot
    const availableFrom = startTime - 15;
    const isActive = currentTime >= availableFrom && currentTime <= endTime;
    
    console.log(`${slot.name} active check: ${isActive} (current: ${currentTime}, available from: ${availableFrom}, ends: ${endTime})`);
    
    return isActive;
}

// Enhanced QR Code Generation
async function generateQR(slot) {

        if (!isBackendLocationValid) {
            alert('Location not verified. Please verify that you are inside your assigned hostel area.');
            renderMealSlots();
            return;
        }

    const now = new Date();

    // If there is a current QR and it is still valid for the same slot, reuse
    if (currentQRData && qrExpiryTime && now < qrExpiryTime && currentQRData.meal.slot === slot.name) {
        console.log('Existing valid QR found for this slot, reusing');
        showScreen('qr-screen');
        startQRTimer(calculateTimeLeft());
        return;
    }

    const mealNameElem = document.getElementById('qr-meal-name');
    const qrDateElem = document.getElementById('qr-date');

    if (mealNameElem) {
        mealNameElem.textContent = slot.name;
    }
    if (qrDateElem) {
        qrDateElem.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    const [endHour, endMinute] = slot.endTime.split(':').map(Number);

        qrExpiryTime = new Date();
        qrExpiryTime.setHours(endHour, endMinute, 0, 0);

        if (qrExpiryTime <= now) {
            alert('❌ This meal slot has already ended.');
            return;
        }


    const timestamp = now.toISOString();
    const validUntil = qrExpiryTime.toISOString();
    const uniqueId = generateUniqueId();

    const saveQRResult = await apiCall('/api/student/generate-qr', 'POST', {
        studentId: currentUser.id,
        studentEmail: currentUser.email,
        mealSlot: slot.name,
        qrId: uniqueId,
        timestamp,
        validUntil,
        location: userLocation
    });

    if (!saveQRResult.success) {
        alert('❌ QR could not be saved: ' + saveQRResult.message);
        return;
    }

    // Use the QR ID returned by backend/database
    const finalQrId = saveQRResult.qrId || uniqueId;
    const finalValidUntil = validUntil;

    const scannableData = {
        type: "BIT_MESRA_MEAL_PASS",
        student: {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email
        },
        meal: {
            slot: slot.name,
            time: slot.displayTime,
            date: now.toDateString()
        },
        security: {
            qrId: finalQrId,
            timestamp,
            validUntil: finalValidUntil,
            location: verifiedLocationName 
        },
        verification: {
            institution: "BIT_MESRA",
            version: "1.0"
        }
    };

    const qrString = JSON.stringify(scannableData);
    currentQRData = scannableData;

    // Render QR
    const qrContainer = document.getElementById('qr-code');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
        text: qrString,
        width: 280,
        height: 280,
        colorDark: "#000000",
        colorLight: "#FFFFFF",
        correctLevel: QRCode.CorrectLevel.M
    });

    showScreen('qr-screen');
    startQRTimer(calculateTimeLeft());
    pollQRStatus(finalQrId);

    console.log(`🎫 Generated new QR with expiry at ${validUntil}`);
}



// Fallback QR generation using Google Charts API
function createGoogleChartsQR(container, data, slot) {
  console.log('Using Google Charts for QR generation (fallback)');

  const minimal = { t:"BIT_MESRA", s:currentUser.id, m:slot.name, q:currentQRData.security.qrId, v:currentQRData.security.validUntil };
  const qrData = encodeURIComponent(JSON.stringify(minimal));
  const url = `https://chart.googleapis.com/chart?chs=280x280&cht=qr&chl=${qrData}&choe=UTF-8`;

  console.log('Google Charts QR URL:', url);
  container.innerHTML = '';  // clear any old content

  const img = document.createElement('img');
  img.src = url;
  img.alt = 'BIT Mesra Meal Pass QR Code';
  img.style.cssText = `
    width:280px;height:280px;
    border:8px solid #003366;
    border-radius:12px;
    background:white;
    box-shadow:0 4px 12px rgba(0,0,0,0.15);
  `;
  img.onerror = () => console.error('❌ Failed to load QR image from URL');
  container.appendChild(img);
}




// Generate unique QR ID
function generateUniqueId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2);
    return `BIT-${timestamp}-${randomStr}`.toUpperCase();
}

// Get device fingerprint for security
function getDeviceFingerprint() {
    return {
        userAgent: navigator.userAgent.substring(0, 50) + '...',
        platform: navigator.platform,
        language: navigator.language,
        screen: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
}

// Enhanced QR placeholder with security info
function createEnhancedQRPlaceholder(container, qrData) {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
        width: 250px;
        height: 250px;
        background: white;
        border: 4px solid #003366;
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', sans-serif;
        font-size: 10px;
        text-align: center;
        padding: 20px;
        box-sizing: border-box;
        word-wrap: break-word;
        color: #003366;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
        position: relative;
    `;
    
    placeholder.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #FF931E; font-size: 12px;">🎓 BIT MESRA</div>
        <div style="font-weight: 600; margin-bottom: 4px; font-size: 11px;">${qrData.studentName}</div>
        <div style="font-weight: 500; color: #FF931E; margin-bottom: 4px; font-size: 10px;">${qrData.mealSlot}</div>
        <div style="font-size: 8px; margin: 4px 0; color: #4A4A4A;">${qrData.studentId}</div>
        <div style="font-size: 7px; margin: 4px 0; color: #666; border: 1px solid #ddd; padding: 2px 4px; border-radius: 4px;">ID: ${qrData.qrId.substring(0,12)}...</div>
        <div style="font-size: 7px; margin-top: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px; width: 100%;">SECURE SMART PASS</div>
        <div style="position: absolute; bottom: 5px; right: 8px; font-size: 6px; color: #94a3b8;">🔒</div>
    `;
    
    container.appendChild(placeholder);
}


function createBITQRPlaceholder(container, qrData) {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
        width: 200px;
        height: 200px;
        background: white;
        border: 4px solid #003366;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', sans-serif;
        font-size: 10px;
        text-align: center;
        padding: 15px;
        box-sizing: border-box;
        word-wrap: break-word;
        color: #003366;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
        position: relative;
    `;
    
    placeholder.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #FF931E; font-size: 11px;">🎓 BIT MESRA</div>
        <div style="font-weight: 600; margin-bottom: 4px; font-size: 11px;">${qrData.studentName}</div>
        <div style="font-weight: 500; color: #FF931E; margin-bottom: 4px; font-size: 10px;">${qrData.mealSlot}</div>
        <div style="font-size: 8px; margin-top: 6px; color: #4A4A4A;">${qrData.studentId}</div>
        <div style="font-size: 7px; margin-top: 6px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 4px; width: 100%;">SMART PASS QR</div>
        <div style="position: absolute; bottom: 5px; right: 5px; font-size: 6px; color: #94a3b8;">✓</div>
    `;
    
    container.appendChild(placeholder);
}

function startQRTimer(timeLeftSeconds) {
    let timeLeft = typeof timeLeftSeconds === 'number' ? timeLeftSeconds : 0;
    const initialTime = timeLeft;

    const timerElement = document.getElementById('timer');
    const timerFill = document.getElementById('timer-fill');

    if (qrTimer) {
        clearInterval(qrTimer);
    }

    if (timerFill) timerFill.style.width = '100%';

    qrTimer = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        if (timerElement) {
            timerElement.textContent =
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        if (timerFill && initialTime > 0) {
            const percentage = (timeLeft / initialTime) * 100;
            timerFill.style.width = Math.max(0, percentage) + '%';
        }

        if (timeLeft <= 0) {
            clearInterval(qrTimer);
            qrTimer = null;

            if (timerElement) timerElement.textContent = "EXPIRED";
            if (timerFill) timerFill.style.width = '0%';

            currentQRData = null;
            qrExpiryTime = null;

            console.log('QR Code expired');
            showScreen('student-dashboard');
            renderMealSlots();
        }

        timeLeft--;
    }, 1000);
}


function calculateTimeLeft() {
    if (!qrExpiryTime) return 0;
    const now = new Date();
    const diff = Math.floor((qrExpiryTime.getTime() - now.getTime()) / 1000);
    return diff > 0 ? diff : 0;
}

async function pollQRStatus(qrId) {
    if (!qrId) return;

    if (qrStatusPoll) {
        clearInterval(qrStatusPoll);
    }

    async function checkStatus() {
        try {
            const result = await apiCall(`/api/admin/qr-status/${encodeURIComponent(qrId)}`);

            if (result.success && result.qrRecord && result.qrRecord.status === 'used') {
                clearInterval(qrStatusPoll);
                qrStatusPoll = null;

                if (qrTimer) {
                    clearInterval(qrTimer);
                    qrTimer = null;
                }

                currentQRData = null;
                qrExpiryTime = null;

                alert('✅ Your QR has been verified by the checker. Returning to home page.');
                showScreen('student-dashboard');
                renderMealSlots();
            }
        } catch (error) {
            console.error('QR status poll failed:', error);
        }
    }

    qrStatusPoll = setInterval(checkStatus, 3000);
    checkStatus();
}

// Navigation Functions
function toggleMenu() {
    console.log('Menu toggle clicked');
    const menu = document.getElementById('nav-menu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

function backToDashboard() {
    console.log('Back to dashboard');
    if (qrTimer) {
        clearInterval(qrTimer);
        qrTimer = null;
    }
    if (qrStatusPoll) {
        clearInterval(qrStatusPoll);
        qrStatusPoll = null;
    }
    showScreen('student-dashboard');
}

function showToAdmin() {
    if (currentQRData && currentQRData.security?.qrId) {
        pollQRStatus(currentQRData.security.qrId);
    }
    alert('📱 Present this QR code to the mess admin for scanning.\n\n✅ Valid for ' + document.getElementById('timer').textContent + ' more minutes.');
}

function logout() {
    console.log('Student logout');
    
    // Clear stored session data
    localStorage.removeItem('smartpass_token');
    localStorage.removeItem('smartpass_user');
    
    currentUser = null;
    userLocation = null;
    if (qrTimer) {
        clearInterval(qrTimer);
        qrTimer = null;
    }
    showScreen('student-login');
}




// Profile Functions
function showProfile() {
    console.log('Showing profile modal');
    const modal = document.getElementById('profile-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
    toggleMenu(); // Close the nav menu
}

function closeProfile() {
    const modal = document.getElementById('profile-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function showSettings() {
    const existing = document.getElementById('student-settings-modal');
    if (existing) {
        existing.classList.remove('hidden');
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'student-settings-modal';
    modal.className = 'modal';

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Settings</h3>
                <button class="modal-close" onclick="closeSettingsModal()">×</button>
            </div>

            <div class="modal-body">
                <div class="setting-row">
                    <div>
                        <strong>Device Lock</strong>
                        <p>This account is linked to this browser/device for security.</p>
                    </div>
                    <span class="status-active">Enabled</span>
                </div>

                <div class="setting-row">
                    <div>
                        <strong>Location Verification</strong>
                        <p>Required before generating meal QR.</p>
                    </div>
                    <span class="status-active">Required</span>
                </div>

                <div class="setting-row">
                    <div>
                        <strong>College Email</strong>
                        <p>${currentUser?.email || '-'}</p>
                    </div>
                </div>

                <button class="btn btn--secondary btn--full-width" onclick="requestLocationPermission()">
                    Re-check Location
                </button>

                <button class="btn btn--outline btn--full-width" onclick="logout()">
                    Logout
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeSettingsModal() {
    const modal = document.getElementById('student-settings-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Close menu when clicking outside
    document.addEventListener('click', function(event) {
        const menu = document.getElementById('nav-menu');
        const menuBtn = document.querySelector('.menu-btn');
        
        if (menu && menuBtn && !menu.contains(event.target) && !menuBtn.contains(event.target)) {
            menu.classList.remove('active');
        }
    });
    
    // Close modals when clicking outside
    document.addEventListener('click', function(event) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (event.target === modal && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal:not(.hidden)');
            modals.forEach(modal => modal.classList.add('hidden'));
            
            const menu = document.getElementById('nav-menu');
            if (menu) menu.classList.remove('active');
        }
    });
    
    console.log('Event listeners setup completed');
}


// Initialize Application
function initializeApp() {
    console.log('🎓 Initializing BIT Mesra Smart Pass App...');
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize geolocation services
    checkGeolocation();
    
    // Attempt silent re-login from stored token
    const savedToken = localStorage.getItem('smartpass_token');
    if (savedToken) {
        console.log('🔄 Found saved session, attempting auto-login...');
        
        apiCall('/api/auth/verify', 'POST', { token: savedToken })
            .then(res => {
                if (res.success) {
                    currentUser = res.user;
                    console.log('🔄 Restored session for', currentUser.name);
                    populateStudentData();
                    showScreen('student-dashboard');
                    setTimeout(() => checkLocation(), 300);
                } else {
                    // Token expired or invalid - clear storage
                    console.log('❌ Saved token invalid, clearing storage');
                    localStorage.removeItem('smartpass_token');
                    localStorage.removeItem('smartpass_user');
                    showScreen('student-login');
                }
            })
            .catch(() => {
                console.log('❌ Auto-login failed, clearing storage');
                localStorage.removeItem('smartpass_token');
                localStorage.removeItem('smartpass_user');
                showScreen('student-login');
            });
    } else {
        // No saved token, show login screen
        console.log('No saved session found, showing login screen');
        showScreen('student-login');
    }
    
    console.log('✅ App initialization completed');
    console.log('🎨 BIT Mesra color theme: Navy #003366, Orange #FF931E, Light Blue #E6F2F8');
    console.log('🏫 Welcome to BIT Mesra Smart Pass System!');
}

// Make all functions available globally
window.handleStudentLogin = handleStudentLogin;
window.toggleMenu = toggleMenu;
window.backToDashboard = backToDashboard;
window.showToAdmin = showToAdmin;
window.logout = logout;
window.showProfile = showProfile;
window.closeProfile = closeProfile;
window.showSettings = showSettings;

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

window.closeSettingsModal = closeSettingsModal;