const API_BASE_URL = 'https://bitmesspass-backend.onrender.com';
//const API_BASE_URL = 'http://localhost:3001';

let checkerToken = localStorage.getItem('checker_token');
let checkerUser = JSON.parse(localStorage.getItem('checker_user') || 'null');
let html5QrCode = null;
let scannerRunning = false;
let currentVerifiedQR = null;

const CHECKER_TRANSLATIONS = {
  en: {
    checkerDashboardTitle: 'Smart Pass Checker',
    menuLogout: 'Logout',
    studentPortal: 'Student Portal',
    loginHeading: 'Checker Login',
    loginDesc: 'Enter the checker credentials to access the scanner.',
    usernamePlaceholder: 'Username',
    passwordPlaceholder: 'Password',
    loginButton: 'Login',
    scanVerifyHeading: 'QR Scan & Verify',
    scanVerifyText: 'Scan the student QR or paste the QR payload to verify the meal pass.',
    startScannerButton: 'Start Camera Scanner',
    stopScannerButton: 'Stop Scanner',
    pasteQrPlaceholder: 'Paste QR data here',
    verifyQRButton: 'Verify QR',
    clearButton: 'Clear',
    manualMealHeading: 'Manual Meal Entry',
    manualMealText: 'Use only this when a student does not have a QR code.',
    rollNoPlaceholder: 'Enter student roll number',
    mealSlotSelectDefault: 'Select meal slot',
    mealSlotBreakfast: 'Breakfast',
    mealSlotLunch: 'Lunch',
    mealSlotSnacks: 'Snacks',
    mealSlotDinner: 'Dinner',
    studentEmailPlaceholder: 'Enter student email if available',
    manualMealButton: 'Record Manual Meal',
    languageToggleLabel: 'हिन्दी'
  },
  hi: {
    checkerDashboardTitle: 'स्मार्ट पास चेकर',
    menuLogout: 'लॉगआउट',
    studentPortal: 'छात्र पोर्टल',
    loginHeading: 'चेकर लॉगिन',
    loginDesc: 'स्कैनर तक पहुँचने के लिए चेकर प्रमाण-पत्र दर्ज करें।',
    usernamePlaceholder: 'उपयोगकर्ता नाम',
    passwordPlaceholder: 'पासवर्ड',
    loginButton: 'लॉगिन',
    scanVerifyHeading: 'क्यूआर स्कैन और सत्यापित करें',
    scanVerifyText: 'छात्र की क्यूआर स्कैन करें या क्यूआर डेटा पेस्ट करके भोजन पास सत्यापित करें।',
    startScannerButton: 'कैमरा स्कैनर शुरू करें',
    stopScannerButton: 'स्कैनर बंद करें',
    pasteQrPlaceholder: 'यहाँ क्यूआर डेटा पेस्ट करें',
    verifyQRButton: 'क्यूआर सत्यापित करें',
    clearButton: 'साफ़ करें',
    manualMealHeading: 'मैन्युअल भोजन प्रविष्टि',
    manualMealText: 'केवल तभी उपयोग करें जब छात्र के पास क्यूआर कोड नहीं हो।',
    rollNoPlaceholder: 'छात्र रोल नंबर दर्ज करें',
    mealSlotSelectDefault: 'भोजन स्लॉट चुनें',
    mealSlotBreakfast: 'नाश्ता',
    mealSlotLunch: 'दोपहर का भोजन',
    mealSlotSnacks: 'नाश्ता',
    mealSlotDinner: 'रात का खाना',
    studentEmailPlaceholder: 'यदि उपलब्ध हो तो छात्र ईमेल दर्ज करें',
    manualMealButton: 'मैन्युअल भोजन रिकॉर्ड करें',
    languageToggleLabel: 'English'
  }
};

function getSavedLanguage() {
  return localStorage.getItem('checker_language') || 'en';
}

function saveLanguage(lang) {
  localStorage.setItem('checker_language', lang);
}

function translatePage(lang) {
  const translations = CHECKER_TRANSLATIONS[lang] || CHECKER_TRANSLATIONS.en;
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (translations[key]) {
      element.textContent = translations[key];
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (translations[key]) {
      element.placeholder = translations[key];
    }
  });
  const toggleBtn = document.getElementById('language-toggle-btn');
  if (toggleBtn) {
    toggleBtn.textContent = translations.languageToggleLabel || (lang === 'hi' ? 'English' : 'हिन्दी');
  }
}

function toggleLanguage() {
  const current = getSavedLanguage();
  const next = current === 'en' ? 'hi' : 'en';
  saveLanguage(next);
  translatePage(next);
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

async function apiCall(endpoint, method = 'GET', data = null) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (checkerToken) {
    options.headers.Authorization = `Bearer ${checkerToken}`;
  }
  if (data) options.body = JSON.stringify(data);

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Request failed');
  }

  return result;
}

function toggleMenu() {
  const menu = document.getElementById('nav-menu');
  menu.classList.toggle('active');
}

function clearQrInput() {
  document.getElementById('qr-input').value = '';
  document.getElementById('qr-result').innerHTML = '';
  currentVerifiedQR = null;
}

async function checkerLogin() {
  const username = document.getElementById('checker-username').value.trim();
  const password = document.getElementById('checker-password').value.trim();
  const message = document.getElementById('checker-login-message');

  message.textContent = '';

  if (!username || !password) {
    message.textContent = 'Please enter both username and password.';
    return;
  }

  try {
    const result = await apiCall('/api/admin/login', 'POST', { username, password });
    checkerToken = result.token;
    checkerUser = result.admin;
    localStorage.setItem('checker_token', checkerToken);
    localStorage.setItem('checker_user', JSON.stringify(checkerUser));
    showScreen('checker-dashboard-screen');
    document.getElementById('checker-username').value = '';
    document.getElementById('checker-password').value = '';
  } catch (error) {
    message.textContent = error.message;
  }
}

function checkerLogout() {
  localStorage.removeItem('checker_token');
  localStorage.removeItem('checker_user');
  checkerToken = null;
  checkerUser = null;
  showScreen('checker-login-screen');
}

async function verifyQRFromInput() {
  const qrData = document.getElementById('qr-input').value.trim();
  const resultBox = document.getElementById('qr-result');
  resultBox.innerHTML = '';
  const scannedBy = checkerUser?.username || 'checker';

  if (!qrData) {
    resultBox.innerHTML = '<p class="error-text">Please paste QR data first.</p>';
    return;
  }

  try {
    const result = await apiCall('/api/admin/verify-qr', 'POST', { qrData, scannedBy });
    currentVerifiedQR = result.qrRecord;

    resultBox.innerHTML = `
      <div class="success-card">
        <h4>✅ QR Verified</h4>
        <p><strong>Name:</strong> ${result.student.name}</p>
        <p><strong>Roll No:</strong> ${result.student.id}</p>
        <p><strong>Email:</strong> ${result.student.email}</p>
        <p><strong>Hostel:</strong> ${result.student.hostel}</p>
        <p><strong>Meal:</strong> ${result.qrRecord.mealSlot}</p>
        <p><strong>Status:</strong> ${result.qrRecord.status}</p>
      </div>
    `;
  } catch (error) {
    currentVerifiedQR = null;
    resultBox.innerHTML = `
      <div class="error-card">
        <h4>❌ Verification Failed</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

async function startCameraScanner() {
  const resultBox = document.getElementById('qr-result');
  if (scannerRunning) {
    resultBox.innerHTML = '<p class="error-text">Scanner is already running.</p>';
    return;
  }

  try {
    html5QrCode = new Html5Qrcode('reader');
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    await html5QrCode.start(
      { facingMode: 'environment' },
      config,
      async (decodedText) => {
        document.getElementById('qr-input').value = decodedText;
        await stopCameraScanner();
        await verifyQRFromInput();
      },
      (errorMessage) => {
        // Ignore scan errors while scanning continuously.
      }
    );

    scannerRunning = true;
    resultBox.innerHTML = '<p class="success-text">📷 Scanner started. Show QR code to camera.</p>';
  } catch (error) {
    resultBox.innerHTML = `
      <div class="error-card">
        <h4>❌ Scanner error</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

async function stopCameraScanner() {
  if (html5QrCode && scannerRunning) {
    await html5QrCode.stop();
    html5QrCode.clear();
    scannerRunning = false;
  }
}

async function submitManualEntry() {
  const rollNo = document.getElementById('manual-roll-no').value.trim();
  const mealSlot = document.getElementById('manual-meal-slot').value;
  const email = document.getElementById('manual-email').value.trim();
  const resultBox = document.getElementById('manual-result');

  resultBox.innerHTML = '';

  if (!rollNo) {
    resultBox.innerHTML = '<p class="error-text">Please enter a roll number.</p>';
    return;
  }

  if (!mealSlot) {
    resultBox.innerHTML = '<p class="error-text">Please select a meal slot.</p>';
    return;
  }

  const scannedBy = checkerUser?.username || 'checker';

  try {
    const result = await apiCall('/api/checker/manual-entry', 'POST', {
      rollNo,
      mealSlot,
      email: email || null,
      scannedBy
    });

    resultBox.innerHTML = `
      <div class="success-card">
        <h4>✅ Manual meal recorded</h4>
        <p>${result.message}</p>
        <p><strong>Name:</strong> ${result.student.name}</p>
        <p><strong>Roll No:</strong> ${result.student.rollNo}</p>
        <p><strong>Meal:</strong> ${result.ticket.meal_slot}</p>
      </div>
    `;

    document.getElementById('manual-roll-no').value = '';
    document.getElementById('manual-meal-slot').value = '';
    document.getElementById('manual-email').value = '';
  } catch (error) {
    resultBox.innerHTML = `
      <div class="error-card">
        <h4>❌ Manual entry failed</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

window.startCameraScanner = startCameraScanner;
window.stopCameraScanner = stopCameraScanner;
window.verifyQRFromInput = verifyQRFromInput;
window.submitManualEntry = submitManualEntry;
window.clearQrInput = clearQrInput;
window.checkerLogin = checkerLogin;
window.checkerLogout = checkerLogout;
window.toggleMenu = toggleMenu;
window.toggleLanguage = toggleLanguage;

window.addEventListener('load', () => {
  const lang = getSavedLanguage();
  translatePage(lang);
  if (checkerToken && checkerUser) {
    showScreen('checker-dashboard-screen');
  } else {
    showScreen('checker-login-screen');
  }
});
