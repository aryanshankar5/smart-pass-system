const API_BASE_URL = 'https://bitmesspass-backend.onrender.com';
//const API_BASE_URL = 'http://localhost:3001';

let checkerToken = localStorage.getItem('checker_token');
let checkerUser = JSON.parse(localStorage.getItem('checker_user') || 'null');
let html5QrCode = null;
let scannerRunning = false;
let currentVerifiedQR = null;

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

window.addEventListener('load', () => {
  if (checkerToken && checkerUser) {
    showScreen('checker-dashboard-screen');
  } else {
    showScreen('checker-login-screen');
  }
});
