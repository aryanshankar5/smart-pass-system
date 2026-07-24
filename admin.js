const API_BASE_URL = 'https://bitmesspass-backend.onrender.com';

let allAccessLogs = [];
let allMealReports = [];
let allLocationLogs = [];
let html5QrCode = null;
let scannerRunning = false;
let adminToken = localStorage.getItem('smartpass_admin_token');
let adminUser = JSON.parse(localStorage.getItem('smartpass_admin_user') || 'null');
let allStudents = [];
let currentVerifiedQR = null;
let allLoginLogs = [];

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });

  document.getElementById(screenId).classList.add('active');
}

async function apiCall(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (adminToken) {
    options.headers.Authorization = `Bearer ${adminToken}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Request failed');
  }

  return result;
}

function showForgotPassword() {
  showScreen('forgot-password-page');
}

function showAdminLogin() {
  showScreen('admin-login-page');
}

async function adminLogin() {
  const username = document.getElementById('admin-username').value.trim();
  const password = document.getElementById('admin-password').value.trim();
  const message = document.getElementById('admin-login-message');

  message.textContent = '';

  try {
    const result = await apiCall('/api/admin/login', 'POST', {
      username,
      password
    });

    adminToken = result.token;
    adminUser = result.admin;

    localStorage.setItem('smartpass_admin_token', adminToken);
    localStorage.setItem('smartpass_admin_user', JSON.stringify(adminUser));

    showScreen('admin-dashboard-page');
    await loadStudents();
    await loadLoginLogs();
    await loadLocationLogs();
    await loadDashboardStats();
    await loadMealReports();
    await loadAccessLogs();

  } catch (error) {
    message.textContent = '❌ ' + error.message;
  }
}

async function resetAdminPassword() {
  const username = document.getElementById('reset-username').value.trim();
  const resetCode = document.getElementById('reset-code').value.trim();
  const newPassword = document.getElementById('new-password').value.trim();
  const message = document.getElementById('reset-message');

  message.textContent = '';

  try {
    const result = await apiCall('/api/admin/forgot-password', 'POST', {
      username,
      resetCode,
      newPassword
    });

    message.textContent = '✅ ' + result.message;

    setTimeout(() => {
      showAdminLogin();
    }, 1000);

  } catch (error) {
    message.textContent = '❌ ' + error.message;
  }
}

function adminLogout() {
  localStorage.removeItem('smartpass_admin_token');
  localStorage.removeItem('smartpass_admin_user');

  adminToken = null;
  adminUser = null;

  showScreen('admin-login-page');
}

async function loadStudents() {
  try {
    const result = await apiCall('/api/admin/students');
    allStudents = result.students;
    renderStudentStats();
    renderStudentsTable(allStudents);
  } catch (error) {
    document.getElementById('students-table-container').innerHTML =
      `<p class="error-text">Failed to load students: ${error.message}</p>`;
  }
}

function renderStudentStats() {
  const total = allStudents.length;
  const active = allStudents.filter(s => s.accessStatus === 'active').length;
  const revoked = allStudents.filter(s => s.accessStatus === 'revoked').length;

  document.getElementById('total-students').textContent = total;
  document.getElementById('active-students').textContent = active;
  document.getElementById('revoked-students').textContent = revoked;
}

function renderStudentsTable(students) {
  const container = document.getElementById('students-table-container');

  if (!students.length) {
    container.innerHTML = '<p>No students found.</p>';
    return;
  }

  const rows = students.map(student => {
    const statusClass = student.accessStatus === 'active' ? 'status-active' : 'status-revoked';

    return `
      <tr>
        <td>${student.rollNo}</td>
        <td>${student.name}</td>
        <td>${student.email}</td>
        <td>Hostel ${student.hostel}</td>
        <td><span class="${statusClass}">${student.accessStatus}</span></td>
        <td>${student.deviceLocked ? 'Locked' : 'Not Locked'}</td>
        <td>
          <button class="btn btn--sm btn--outline" onclick="openAccessModal(${student.id}, '${student.name}', '${student.accessStatus}')">
            Manage Access
            </button>

            <button class="btn btn--sm btn--secondary" onclick="resetDevice(${student.id})">
            Reset Device
          </button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Roll No</th>
            <th>Name</th>
            <th>Email</th>
            <th>Hostel</th>
            <th>Access</th>
            <th>Device</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function filterStudents() {
  const search = document.getElementById('student-search').value.toLowerCase();

  const filtered = allStudents.filter(student => {
    return (
      String(student.rollNo).toLowerCase().includes(search) ||
      String(student.name).toLowerCase().includes(search) ||
      String(student.email).toLowerCase().includes(search) ||
      String(student.hostel).toLowerCase().includes(search)
    );
  });

  renderStudentsTable(filtered);
}

async function revokeStudent(id) {
  try {
    await apiCall(`/api/admin/students/${id}/revoke`, 'POST');
    await loadStudents();
  } catch (error) {
    alert(error.message);
  }
}

async function allowStudent(id) {
  try {
    await apiCall(`/api/admin/students/${id}/allow`, 'POST');
    await loadStudents();
  } catch (error) {
    alert(error.message);
  }
}

async function resetDevice(id) {
  try {
    await apiCall(`/api/admin/students/${id}/reset-device`, 'POST');
    await loadStudents();
    alert('Device reset successfully');
  } catch (error) {
    alert(error.message);
  }
}

async function verifyQRFromInput() {
  const qrData = document.getElementById('qr-input').value.trim();
  const resultBox = document.getElementById('qr-result');

  resultBox.innerHTML = '';

  if (!qrData) {
    resultBox.innerHTML = '<p class="error-text">Please paste QR data first.</p>';
    return;
  }

  try {
    const result = await apiCall('/api/admin/verify-qr', 'POST', {
      qrData
    });

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

async function markQRUsed() {
  const resultBox = document.getElementById('qr-result');

  if (!currentVerifiedQR || !currentVerifiedQR.qrId) {
    resultBox.innerHTML = '<p class="error-text">Please verify a QR first.</p>';
    return;
  }

  try {
    const result = await apiCall('/api/admin/use-qr', 'POST', {
      qrId: currentVerifiedQR.qrId
    });

    resultBox.innerHTML += `
      <div class="success-card">
        <h4>✅ Pass Marked as Used</h4>
        <p>${result.message}</p>
      </div>
    `;

    await loadDashboardStats();
    currentVerifiedQR = null;

  } catch (error) {
    resultBox.innerHTML += `
      <div class="error-card">
        <h4>❌ Could not mark as used</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

window.addEventListener('load', async () => {
  if (adminToken && adminUser) {
    showScreen('admin-dashboard-page');
    await loadStudents();
    await loadLoginLogs();
    await loadLocationLogs();
    await loadDashboardStats();
    await loadMealReports();
    await loadAccessLogs();
  }
});

async function startCameraScanner() {
  const resultBox = document.getElementById('qr-result');

  if (scannerRunning) {
    resultBox.innerHTML = '<p class="error-text">Scanner is already running.</p>';
    return;
  }

  try {
    html5QrCode = new Html5Qrcode("reader");

    const config = {
      fps: 10,
      qrbox: {
        width: 250,
        height: 250
      }
    };

    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        document.getElementById('qr-input').value = decodedText;

        await stopCameraScanner();

        await verifyQRFromInput();
      },
      (errorMessage) => {
        // Ignore continuous scan errors
      }
    );

    scannerRunning = true;
    resultBox.innerHTML = '<p class="success-text">📷 Scanner started. Show QR code to camera.</p>';

  } catch (error) {
    resultBox.innerHTML = `
      <div class="error-card">
        <h4>❌ Camera Scanner Failed</h4>
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

async function loadLoginLogs() {
  const container = document.getElementById('login-logs-container');
  if (!container) return;

  try {
    const status = document.getElementById('login-log-status')?.value || 'all';
    const email = document.getElementById('login-log-email')?.value || '';
    const fromDate = document.getElementById('login-log-from')?.value || '';
    const toDate = document.getElementById('login-log-to')?.value || '';

    const params = new URLSearchParams();

    if (status) params.append('status', status);
    if (email) params.append('email', email);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate + 'T23:59:59');

    const result = await apiCall(`/api/admin/login-logs?${params.toString()}`);

    allLoginLogs = result.logs;
    renderLoginLogs(allLoginLogs);

  } catch (error) {
    container.innerHTML = `<p class="error-text">Failed to load login logs: ${error.message}</p>`;
  }
}

function renderLoginLogs(logs) {
  const container = document.getElementById('login-logs-container');

  if (!logs.length) {
    container.innerHTML = '<p>No login logs found.</p>';
    return;
  }

  const rows = logs.map(log => {
    const statusClass = log.loginStatus === 'success' ? 'status-active' : 'status-revoked';
    const dateTime = new Date(log.createdAt).toLocaleString();

    return `
      <tr>
        <td>${dateTime}</td>
        <td>${log.studentName || '-'}</td>
        <td>${log.rollNo || '-'}</td>
        <td>${log.email || '-'}</td>
        <td><span class="${statusClass}">${log.loginStatus}</span></td>
        <td>${log.reason || '-'}</td>
        <td>${log.ipAddress || '-'}</td>
        <td title="${log.userAgent || ''}">
          ${log.deviceId ? log.deviceId.substring(0, 20) + '...' : '-'}
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Student</th>
            <th>Roll No</th>
            <th>Email</th>
            <th>Status</th>
            <th>Reason</th>
            <th>IP</th>
            <th>Device</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function loadLocationLogs() {
  const container = document.getElementById('location-logs-container');
  if (!container) return;

  try {
    const status = document.getElementById('location-log-status')?.value || 'all';
    const email = document.getElementById('location-log-email')?.value || '';
    const fromDate = document.getElementById('location-log-from')?.value || '';
    const toDate = document.getElementById('location-log-to')?.value || '';

    const params = new URLSearchParams();

    if (status) params.append('status', status);
    if (email) params.append('email', email);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate + 'T23:59:59');

    const result = await apiCall(`/api/admin/location-logs?${params.toString()}`);

    allLocationLogs = result.logs;
    renderLocationLogs(allLocationLogs);

  } catch (error) {
    container.innerHTML = `<p class="error-text">Failed to load location logs: ${error.message}</p>`;
  }
}

function renderLocationLogs(logs) {
  const container = document.getElementById('location-logs-container');

  if (!logs.length) {
    container.innerHTML = '<p>No location logs found.</p>';
    return;
  }

  const rows = logs.map(log => {
    const statusClass = log.isValid ? 'status-active' : 'status-revoked';
    const statusText = log.isValid ? 'Valid' : 'Invalid';
    const dateTime = new Date(log.createdAt).toLocaleString();

    return `
      <tr>
        <td>${dateTime}</td>
        <td>${log.studentName || '-'}</td>
        <td>${log.rollNo || '-'}</td>
        <td>${log.email || '-'}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td>${log.distanceFromMess ?? '-'} m</td>
        <td>${log.accuracy ? Math.round(log.accuracy) + ' m' : '-'}</td>
        <td>${log.latitude?.toFixed(6) || '-'}</td>
        <td>${log.longitude?.toFixed(6) || '-'}</td>
        <td>${log.reason || '-'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Student</th>
            <th>Roll No</th>
            <th>Email</th>
            <th>Status</th>
            <th>Distance</th>
            <th>Accuracy</th>
            <th>Latitude</th>
            <th>Longitude</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function loadDashboardStats() {
  try {
    const result = await apiCall('/api/admin/dashboard-stats');

    if (!result.success) return;

    const stats = result.stats;

    document.getElementById('total-students').textContent = stats.totalStudents;
    document.getElementById('active-students').textContent = stats.activeStudents;
    document.getElementById('revoked-students').textContent = stats.revokedStudents;
    document.getElementById('today-login-attempts').textContent = stats.todayLoginAttempts;
    document.getElementById('today-success-logins').textContent = stats.todaySuccessfulLogins;
    document.getElementById('today-failed-logins').textContent = stats.todayFailedLogins;
    document.getElementById('today-meal-scans').textContent = stats.todayMealScans;
    document.getElementById('today-failed-scans').textContent = stats.failedScansToday;

    renderMealSummary(stats.mealWiseToday);

  } catch (error) {
    console.error('Dashboard stats load failed:', error);
  }
}

function renderMealSummary(meals) {
  const container = document.getElementById('meal-summary-container');
  if (!container) return;

  const mealCounts = {
    Breakfast: 0,
    Lunch: 0,
    Snacks: 0,
    Dinner: 0
  };

  meals.forEach(item => {
    mealCounts[item.mealSlot] = item.count;
  });

  container.innerHTML = `
    <div class="admin-stats">
      <div class="stat-card">
        <div class="stat-number">${mealCounts.Breakfast}</div>
        <div class="stat-label">Breakfast</div>
      </div>

      <div class="stat-card">
        <div class="stat-number">${mealCounts.Lunch}</div>
        <div class="stat-label">Lunch</div>
      </div>

      <div class="stat-card">
        <div class="stat-number">${mealCounts.Snacks}</div>
        <div class="stat-label">Snacks</div>
      </div>

      <div class="stat-card">
        <div class="stat-number">${mealCounts.Dinner}</div>
        <div class="stat-label">Dinner</div>
      </div>
    </div>
  `;
}

async function loadMealReports() {
  const container = document.getElementById('meal-reports-container');
  if (!container) return;

  try {
    const mealSlot = document.getElementById('meal-report-slot')?.value || 'all';
    const status = document.getElementById('meal-report-status')?.value || 'all';
    const email = document.getElementById('meal-report-email')?.value || '';
    const fromDate = document.getElementById('meal-report-from')?.value || '';
    const toDate = document.getElementById('meal-report-to')?.value || '';

    const params = new URLSearchParams();

    if (mealSlot) params.append('mealSlot', mealSlot);
    if (status) params.append('status', status);
    if (email) params.append('email', email);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);

    const result = await apiCall(`/api/admin/meal-reports?${params.toString()}`);

    allMealReports = result.reports;
    renderMealReports(allMealReports);

  } catch (error) {
    container.innerHTML = `<p class="error-text">Failed to load meal reports: ${error.message}</p>`;
  }
}

function renderMealReports(reports) {
  const container = document.getElementById('meal-reports-container');

  if (!reports.length) {
    container.innerHTML = '<p>No meal reports found.</p>';
    return;
  }

  const rows = reports.map(report => {
    const statusClass = report.status === 'used' ? 'status-active' : 'status-revoked';

    return `
      <tr>
        <td>${report.ticketDate ? new Date(report.ticketDate).toLocaleDateString() : '-'}</td>
        <td>${report.mealSlot || '-'}</td>
        <td>${report.studentName || '-'}</td>
        <td>${report.rollNo || '-'}</td>
        <td>${report.email || '-'}</td>
        <td>Hostel ${report.hostel || '-'}</td>
        <td><span class="${statusClass}">${report.status}</span></td>
        <td>${report.generatedAt ? new Date(report.generatedAt).toLocaleString() : '-'}</td>
        <td>${report.usedAt ? new Date(report.usedAt).toLocaleString() : '-'}</td>
        <td>${report.verifiedBy || '-'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Meal</th>
            <th>Student</th>
            <th>Roll No</th>
            <th>Email</th>
            <th>Hostel</th>
            <th>Status</th>
            <th>Generated</th>
            <th>Used</th>
            <th>Verified By</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function openAccessModal(studentId, studentName, currentStatus) {
  document.getElementById('access-student-id').value = studentId;
  document.getElementById('access-student-name').textContent =
    `Student: ${studentName} | Current Status: ${currentStatus}`;

  document.getElementById('access-action').value =
    currentStatus === 'active' ? 'revoke' : 'allow';

  document.getElementById('access-duration').value = 'permanent';
  document.getElementById('access-custom-until').value = '';
  document.getElementById('access-reason').value = '';

  document.getElementById('access-modal').classList.remove('hidden');
}

function closeAccessModal() {
  document.getElementById('access-modal').classList.add('hidden');
}

async function submitAccessChange() {
  const studentId = document.getElementById('access-student-id').value;
  const action = document.getElementById('access-action').value;
  const duration = document.getElementById('access-duration').value;
  const customUntil = document.getElementById('access-custom-until').value;
  const reason = document.getElementById('access-reason').value.trim();

  if (!reason) {
    alert('Please enter reason for access change.');
    return;
  }

  try {
    const result = await apiCall(`/api/admin/students/${studentId}/manage-access`, 'POST', {
      action,
      duration,
      customUntil,
      reason
    });

    alert('✅ ' + result.message);

    closeAccessModal();

    await loadStudents();
    await loadDashboardStats();
    await loadAccessLogs();

  } catch (error) {
    alert('❌ ' + error.message);
  }
}

async function loadAccessLogs() {
  const container = document.getElementById('access-logs-container');
  if (!container) return;

  try {
    const status = document.getElementById('access-log-status')?.value || 'all';
    const email = document.getElementById('access-log-email')?.value || '';
    const fromDate = document.getElementById('access-log-from')?.value || '';
    const toDate = document.getElementById('access-log-to')?.value || '';

    const params = new URLSearchParams();

    if (status) params.append('status', status);
    if (email) params.append('email', email);
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate + 'T23:59:59');

    const result = await apiCall(`/api/admin/access-logs?${params.toString()}`);

    allAccessLogs = result.logs;
    renderAccessLogs(allAccessLogs);

  } catch (error) {
    container.innerHTML = `<p class="error-text">Failed to load access logs: ${error.message}</p>`;
  }
}

function renderAccessLogs(logs) {
  const container = document.getElementById('access-logs-container');

  if (!logs.length) {
    container.innerHTML = '<p>No access logs found.</p>';
    return;
  }

  const rows = logs.map(log => {
    const statusClass = log.newStatus === 'active' ? 'status-active' : 'status-revoked';

    return `
      <tr>
        <td>${new Date(log.createdAt).toLocaleString()}</td>
        <td>${log.studentName || '-'}</td>
        <td>${log.rollNo || '-'}</td>
        <td>${log.email || '-'}</td>
        <td>${log.oldStatus || '-'}</td>
        <td><span class="${statusClass}">${log.newStatus}</span></td>
        <td>${log.accessUntil ? new Date(log.accessUntil).toLocaleString() : 'Permanent'}</td>
        <td>${log.reason || '-'}</td>
        <td>${log.changedBy || '-'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-responsive">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Student</th>
            <th>Roll No</th>
            <th>Email</th>
            <th>Old Status</th>
            <th>New Status</th>
            <th>Until</th>
            <th>Reason</th>
            <th>Changed By</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function addStudentManually() {
  const rollNo = document.getElementById('new-roll-no').value.trim();
  const studentName = document.getElementById('new-student-name').value.trim();
  const email = document.getElementById('new-student-email').value.trim();
  const hostel = document.getElementById('new-student-hostel').value.trim();
  const message = document.getElementById('add-student-message');

  message.textContent = '';

  try {
    const result = await apiCall('/api/admin/students/add', 'POST', {
      rollNo,
      studentName,
      email,
      hostel
    });

    message.textContent = '✅ ' + result.message;

    document.getElementById('new-roll-no').value = '';
    document.getElementById('new-student-name').value = '';
    document.getElementById('new-student-email').value = '';
    document.getElementById('new-student-hostel').value = '';

    await loadStudents();
    await loadDashboardStats();

  } catch (error) {
    message.textContent = '❌ ' + error.message;
  }
}

function downloadReport(endpoint) {
  window.open(`${API_BASE_URL}${endpoint}`, '_blank');
}

window.downloadReport = downloadReport;
window.addStudentManually = addStudentManually;
window.loadAccessLogs = loadAccessLogs;
window.openAccessModal = openAccessModal;
window.closeAccessModal = closeAccessModal;
window.submitAccessChange = submitAccessChange;
window.loadMealReports = loadMealReports;
window.loadDashboardStats = loadDashboardStats;
window.loadLocationLogs = loadLocationLogs;
window.startCameraScanner = startCameraScanner;
window.stopCameraScanner = stopCameraScanner;
window.loadLoginLogs = loadLoginLogs;