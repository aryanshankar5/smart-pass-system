// API Configuration
const API_BASE_URL = 'http://localhost:3001';

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
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('API Error:', error);
        return { success: false, message: 'Connection failed' };
    }
}

let qrExpiryTime = null;


// Application Data
const appData = {
    students: [
        {
            id: "BTECH/10090/24",
            name: "Aryan Shankar",
            email: "aryan.btech2024@bitmesra.ac.in",
            photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150",
            branch: "Computer Science",
            year: "2nd Year",
            hostel: "Vivekananda Hostel"
        },
        {
            id: "BTECH/10091/24", 
            name: "Priya Sharma",
            email: "priya.btech2024@bitmesra.ac.in",
            photo: "https://images.unsplash.com/photo-1494790108755-2616b612b1e5?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150",
            branch: "Electronics",
            year: "2nd Year",
            hostel: "Saraswati Hostel"
        }
    ],
    mealSlots: [
        {
            id: "breakfast",
            name: "Breakfast",
            startTime: "00:01",
            endTime: "01:46",
            displayTime: "7:30 AM - 9:00 AM"
        },
        {
            id: "lunch", 
            name: "Lunch",
            startTime: "11:30",
            endTime: "14:00", 
            displayTime: "12:30 PM - 2:00 PM"
        },
        {
            id: "snacks",
            name: "Snacks",
            startTime: "17:00",
            endTime: "18:30",
            displayTime: "5:00 PM - 6:30 PM"
        },
        {
            id: "dinner",
            name: "Dinner", 
            startTime: "20:00",
            endTime: "22:00",
            displayTime: "8:00 PM - 10:00 PM"
        }
    ],

    messLocation: {
        latitude: 23.4136,
        longitude: 85.4399,
        name: "BIT Mesra Main Mess",
        radius: 50000
    },
    adminCredentials: {
        username: "admin",
        password: "admin123"
    }
};

// Application State
let currentUser = null;
let userLocation = null;
let qrTimer = null;
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
function handleStudentLogin() {
    console.log('Initializing Real Google OAuth...');
    
    // Check if Google OAuth is loaded
    if (typeof google === 'undefined') {
        console.error('Google OAuth SDK not loaded');
        alert('Google OAuth not available. Please refresh the page.');
        return;
    }
    
    // Initialize Google OAuth with your actual Client ID
    google.accounts.id.initialize({
        client_id: '439746768038-882bgdhrt4qmft3el25lqf5djs36bgtg.apps.googleusercontent.com', // Replace with your real Client ID
        callback: handleGoogleResponse,
        auto_select: false,
        cancel_on_tap_outside: false
    });

    // Show Google One Tap prompt
    google.accounts.id.prompt((notification) => {
        console.log('Google prompt notification:', notification);
        
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.log('One Tap not shown, rendering sign-in button');
            
            // Create button container if it doesn't exist
            let buttonContainer = document.getElementById('google-signin-button');
            if (!buttonContainer) {
                buttonContainer = document.createElement('div');
                buttonContainer.id = 'google-signin-button';
                buttonContainer.style.marginTop = '15px';
                
                // Find the login button and add container after it
                const loginButton = document.querySelector('.google-login-btn');
                if (loginButton && loginButton.parentNode) {
                    loginButton.parentNode.appendChild(buttonContainer);
                }
            }
            
            // Clear and render Google button
            buttonContainer.innerHTML = '';
            google.accounts.id.renderButton(buttonContainer, {
                theme: 'filled_blue',
                size: 'large',
                type: 'standard',
                text: 'continue_with',
                shape: 'rectangular',
                width: 300
            });
        }
    });
}


// New function to handle Google OAuth response
async function handleGoogleResponse(response) {
    console.log('Google OAuth response received');
    
    try {
        // Send the Google JWT token to our backend
        const result = await apiCall('/api/student/login', 'POST', {
            token: response.credential
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
        { id: 'profile-photo', value: currentUser.photo, type: 'src' },
        { id: 'profile-name', value: currentUser.name, type: 'text' },
        { id: 'profile-roll', value: currentUser.id, type: 'text' },
        { id: 'profile-branch', value: currentUser.branch, type: 'text' },
        { id: 'profile-year', value: currentUser.year, type: 'text' },
        { id: 'profile-hostel', value: currentUser.hostel, type: 'text' },
        { id: 'qr-student-photo', value: currentUser.photo, type: 'src' },
        { id: 'qr-student-name', value: currentUser.name, type: 'text' },
        { id: 'qr-student-roll', value: currentUser.id, type: 'text' }
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
    console.log('Requesting location permission...');
    updateLocationStatus('requesting');
    
    const options = {
        enableHighAccuracy: true,  // Use GPS if available
        timeout: 10000,           // 10 second timeout
        maximumAge: 30000         // Cache for 30 seconds
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
        // Verify location with backend
const result = await apiCall('/api/location/verify', 'POST', currentLocation);

// Get current location name using reverse geocoding
let locationName = 'Unknown Location';
try {
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${currentLocation.latitude}&longitude=${currentLocation.longitude}&localityLanguage=en`);
    const locationData = await response.json();
    
    if (locationData.city && locationData.principalSubdivision) {
        locationName = `${locationData.city}, ${locationData.principalSubdivision}`;
    } else if (locationData.locality) {
        locationName = locationData.locality;
    } else if (locationData.principalSubdivision) {
        locationName = locationData.principalSubdivision;
    }
    
    console.log('📍 Current location name:', locationName);
    } catch (error) {
        console.log('Could not get location name:', error);
        locationName = 'Current Location';
    }

    // ADD THESE DEBUG LINES HERE:
    console.log('🔍 DEBUG INFO:');
    console.log('- Your coordinates:', currentLocation.latitude.toFixed(6), currentLocation.longitude.toFixed(6));
    console.log('- BIT Mesra coordinates:', appData.messLocation.latitude, appData.messLocation.longitude);
    console.log('- Frontend radius:', appData.messLocation.radius, 'meters');

    // Calculate distance manually
    const manualDistance = calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        appData.messLocation.latitude,
        appData.messLocation.longitude
    );
    console.log('- Calculated distance:', Math.round(manualDistance), 'meters');
    console.log('- Should be valid:', manualDistance <= appData.messLocation.radius);

    // Check backend response
    console.log('- Backend result:', result);


    if (result.isValid) {
        userLocation = currentLocation;
        updateLocationStatus('verified', null, locationName);
        console.log('✅ Location verified - At:', locationName);
    } else {
        userLocation = currentLocation;
        updateLocationStatus('invalid', result.distance, locationName);
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
            locationText.textContent = "📍 Location services ready";
            locationText.className = "location-subtitle";
            if (button) {
                button.textContent = "📍 Check My Location";
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
            const verifiedLocationName = errorMessage || 'BIT Mesra Main Mess';
            locationText.textContent = `✅ You are at ${verifiedLocationName} - Location Verified`;
            locationText.className = "location-subtitle location-verified";
            if (button) {
                button.textContent = "✅ Location Verified";
                button.disabled = true;
                button.className = "btn btn--success location-check-btn disabled";
            }
            break;

            
        case 'invalid':
            const distanceText = distance ? ` (${distance}m away)` : '';
            const currentLocationName = errorMessage || 'Wrong location';
            locationText.textContent = `❌ You are at ${currentLocationName}${distanceText}`;
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
    button.textContent = '📍 Check My Location';
    button.onclick = requestLocationPermission;
    
    // Add button after location text
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
                    <p>You must be at the BIT Mesra mess hall to access meal slots.</p>
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
    if (!userLocation) {
        console.log('Location check: No location data');
        return false;
    }
    
    const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        appData.messLocation.latitude,
        appData.messLocation.longitude
    );
    
    const isValid = distance <= appData.messLocation.radius;
    console.log(`Location check: Distance=${Math.round(distance)}m, Valid=${isValid}`);
    
    return isValid;
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

function checkLocationValidity() {
    if (!userLocation) return false;
    
    const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        appData.messLocation.latitude,
        appData.messLocation.longitude
    );
    
    return distance <= appData.messLocation.radius;
}

// QR Code Generation
// Enhanced QR Code Generation
async function generateQR(slot) {
    console.log('Attempting to generate QR for slot:', slot.name);

    const now = new Date();

    // If there is a current QR and it is still valid for the same slot, reuse
    if (currentQRData && qrExpiryTime && now < qrExpiryTime && currentQRData.meal.slot === slot.name) {
        console.log('Existing valid QR found for this slot, reusing');
        showScreen('qr-screen');
        startQRTimer(calculateTimeLeft());
        return;
    }

    const mealNameElem = document.getElementById('qr-meal-name');
    if (mealNameElem) {
    mealNameElem.textContent = slot.name;
    }

    

    // Calculate slot close time
    const slotEndParts = slot.endTime.split(':');
    const slotCloseTime = new Date();
    slotCloseTime.setHours(parseInt(slotEndParts[0]), parseInt(slotEndParts[1]), 0, 0);

    // Calculate expiry time = min(now + 40min, slot close time)
    const fortyMinLater = new Date(now.getTime() + 40 * 60 * 1000);
    qrExpiryTime = new Date(Math.min(fortyMinLater.getTime(), slotCloseTime.getTime()));

    // Build scannableData with qrExpiryTime
    const timestamp = now.toISOString();
    const validUntil = qrExpiryTime.toISOString();
    const uniqueId = generateUniqueId();

    const scannableData = {
        type: "BIT_MESRA_MEAL_PASS",
        student: { id: currentUser.id, name: currentUser.name, email: currentUser.email },
        meal: { slot: slot.name, time: slot.displayTime, date: now.toDateString() },
        security: { qrId: uniqueId, timestamp, validUntil, location: "BIT Mesra Main Mess" },
        verification: { institution: "BIT_MESRA", version: "1.0" }
    };
    const qrString = JSON.stringify(scannableData);
    currentQRData = scannableData;

    // Register with backend
    await apiCall('/api/student/generate-qr', 'POST', {
        studentId: currentUser.id,
        mealSlot: slot.name,
        qrId: uniqueId,
        timestamp,
        validUntil,
        location: userLocation
    });

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
    const timerElement = document.getElementById('timer');
    const timerFill = document.getElementById('timer-fill');

    if (timeLeft <= 0) {
        clearInterval(qrTimer);
        qrTimer = null;

        if (timerElement) timerElement.textContent = "EXPIRED";
        if (timerFill) timerFill.style.width = "0%";

        currentQRData = null;
        qrExpiryTime = null;

        console.log("QR Code expired");

        // Show dashboard
        showScreen("student-dashboard");

        // Refresh meal slots to update active slot
        renderMealSlots();

        // Optionally auto-generate QR for next slot if desired:
        let nextSlot = getNextMealSlot();
        if (nextSlot) {
            generateQR(nextSlot);
        }
    }


    if (qrTimer) {
        clearInterval(qrTimer);
    }

    if (timerFill) timerFill.style.width = '100%';

    qrTimer = setInterval(() => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        if (timerElement) {
            timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        if (timerFill) {
            const percentage = (timeLeft / (40 * 60)) * 100; // max bar for 40 mins
            timerFill.style.width = percentage + '%';
        }

        if (timeLeft <= 0) {
            clearInterval(qrTimer);
            if (timerElement) timerElement.textContent = "EXPIRED";
            if (timerFill) timerFill.style.width = '0%';

            currentQRData = null;
            qrExpiryTime = null;
            console.log('QR Code expired');

            // After expiry, revert to student dashboard and refresh meal slots
            showScreen('student-dashboard');
            renderMealSlots();
        }

        timeLeft--;
    }, 1000);

    console.log('QR Timer started');
}


function calculateTimeLeft() {
    if (!qrExpiryTime) return 0;
    const now = new Date();
    const diff = Math.floor((qrExpiryTime.getTime() - now.getTime()) / 1000);
    return diff > 0 ? diff : 0;
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
    showScreen('student-dashboard');
}

function showToAdmin() {
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


// Admin Functions
function switchToAdmin() {
    console.log('Switching to admin login');
    showScreen('admin-login');
}

function switchToStudent() {
    console.log('Switching to student login');
    showScreen('student-login');
}

function handleAdminLogin() {
    console.log('Admin login attempt');
    const username = document.getElementById('admin-username');
    const password = document.getElementById('admin-password');
    
    if (!username || !password) {
        alert('Please enter both username and password.');
        return;
    }
    
    const usernameVal = username.value.trim();
    const passwordVal = password.value.trim();
    
    console.log('Admin credentials entered:', usernameVal);
    
    if (usernameVal === appData.adminCredentials.username && 
        passwordVal === appData.adminCredentials.password) {
        console.log('Admin login successful');
        showScreen('admin-dashboard');
        
        // Clear input fields
        username.value = '';
        password.value = '';
    } else {
        alert('❌ Invalid admin credentials.\n\nDemo credentials:\nUsername: admin\nPassword: admin123');
    }
}

function adminLogout() {
    console.log('Admin logout');
    showScreen('admin-login');
}

function startScanning() {
    console.log('Starting QR scanner');
    const modal = document.getElementById('scanner-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeScanner() {
    console.log('Closing QR scanner');
    const modal = document.getElementById('scanner-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function simulateScan() {
    console.log('Simulating QR scan');
    
    // Use current QR data if available, otherwise create mock data
    const scanData = currentQRData || {
        studentId: "BTECH/10090/24",
        studentName: "Aryan Shankar",
        mealSlot: "Lunch",
        timestamp: new Date().toISOString(),
        validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        location: appData.messLocation.name,
        bitMesra: true
    };
    
    displayScannedStudent(scanData);
    closeScanner();
}

function displayScannedStudent(qrData) {
    console.log('Displaying scanned student details:', qrData.studentName);
    const student = appData.students.find(s => s.id === qrData.studentId);
    
    if (student) {
        // Populate modal with student data
        const elements = [
            { id: 'scanned-photo', value: student.photo, type: 'src' },
            { id: 'scanned-name', value: student.name, type: 'text' },
            { id: 'scanned-roll', value: student.id, type: 'text' },
            { id: 'scanned-branch', value: student.branch, type: 'text' },
            { id: 'scanned-meal', value: qrData.mealSlot, type: 'text' },
            { id: 'scanned-generated', value: new Date(qrData.timestamp).toLocaleString(), type: 'text' }
        ];
        
        elements.forEach(elem => {
            const element = document.getElementById(elem.id);
            if (element) {
                if (elem.type === 'src') {
                    element.src = elem.value;
                    element.alt = `${student.name} photo`;
                } else {
                    element.textContent = elem.value;
                }
            }
        });
        
        // Set meal time
        const mealSlot = appData.mealSlots.find(s => s.name === qrData.mealSlot);
        const timeElem = document.getElementById('scanned-time');
        if (timeElem && mealSlot) {
            timeElem.textContent = mealSlot.displayTime;
        }
        
        // Show the modal
        const modal = document.getElementById('student-details-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    } else {
        alert('❌ Student not found in database.');
    }
}

function closeStudentDetails() {
    const modal = document.getElementById('student-details-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

function approveMeal() {
    console.log('Meal approved by admin');
    alert('✅ Meal approved successfully!\n\nStudent can proceed to collect their meal.');
    addToRecentScans('Approved');
    closeStudentDetails();
}

function rejectMeal() {
    console.log('Meal rejected by admin');
    const reason = prompt('Reason for rejection:') || 'No reason provided';
    alert('❌ Meal rejected.\n\nReason: ' + reason);
    addToRecentScans('Rejected');
    closeStudentDetails();
}

function addToRecentScans(status) {
    console.log('Adding to recent scans:', status);
    const scansList = document.querySelector('.scans-list');
    if (scansList && currentQRData) {
        const newScan = document.createElement('div');
        newScan.className = 'scan-item';
        newScan.innerHTML = `
            <div class="scan-student">${currentQRData.studentName}</div>
            <div class="scan-meal">${currentQRData.mealSlot}</div>
            <div class="scan-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            <div class="scan-status status--${status === 'Approved' ? 'success' : 'error'}">${status}</div>
        `;
        scansList.insertBefore(newScan, scansList.firstChild);
        
        // Remove oldest scan if more than 5
        if (scansList.children.length > 5) {
            scansList.removeChild(scansList.lastChild);
        }
    }
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
    alert('⚙️ Settings functionality coming soon!\n\nFeatures planned:\n• Notification preferences\n• Language settings\n• Theme customization');
    toggleMenu(); // Close the nav menu
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
        if (event.altKey && event.key === 's') {
            showScreen('student-login');
        }
        if (event.altKey && event.key === 'a') {
            showScreen('admin-login');
        }
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal:not(.hidden)');
            modals.forEach(modal => modal.classList.add('hidden'));
            
            const menu = document.getElementById('nav-menu');
            if (menu) menu.classList.remove('active');
        }
    });
    
    console.log('Event listeners setup completed');
}

// Setup event listeners
setupEventListeners();

// NEW: Attempt silent re-login from stored token
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
    showScreen('student-login');
}

// Initialize geolocation
checkGeolocation();


// Initialize Application
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
    console.log('🔐 Demo admin credentials: admin / admin123');
    console.log('🏫 Welcome to BIT Mesra Smart Pass System!');
}


// Make all functions available globally
window.handleStudentLogin = handleStudentLogin;
window.switchToAdmin = switchToAdmin;
window.switchToStudent = switchToStudent;
window.handleAdminLogin = handleAdminLogin;
window.toggleMenu = toggleMenu;
window.backToDashboard = backToDashboard;
window.showToAdmin = showToAdmin;
window.logout = logout;
window.adminLogout = adminLogout;
window.startScanning = startScanning;
window.closeScanner = closeScanner;
window.simulateScan = simulateScan;
window.closeStudentDetails = closeStudentDetails;
window.approveMeal = approveMeal;
window.rejectMeal = rejectMeal;
window.showProfile = showProfile;
window.closeProfile = closeProfile;
window.showSettings = showSettings;

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}