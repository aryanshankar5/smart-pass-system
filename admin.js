const API_BASE_URL = 'http://localhost:3001';

let adminToken = localStorage.getItem('smartpass_admin_token');
let adminUser = JSON.parse(localStorage.getItem('smartpass_admin_user') || 'null');
let allStudents = [];
let currentVerifiedQR = null;

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
          ${
            student.accessStatus === 'active'
              ? `<button class="btn btn--sm btn--outline" onclick="revokeStudent(${student.id})">Revoke</button>`
              : `<button class="btn btn--sm btn--primary" onclick="allowStudent(${student.id})">Allow</button>`
          }
          <button class="btn btn--sm btn--secondary" onclick="resetDevice(${student.id})">Reset Device</button>
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
  }
});
