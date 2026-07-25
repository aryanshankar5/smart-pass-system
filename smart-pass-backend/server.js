const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const app = express();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(cors({
  origin: [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://bitmesspass.netlify.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.connect()
  .then(() => console.log('✅ PostgreSQL connected successfully'))
  .catch((err) => console.error('❌ PostgreSQL connection error:', err));

// Mock data for now (same as frontend)
const mockData = {
  students: [
    {
      id: "BTECH/10090/24",
      name: "Aryan Shankar",
      email: "aryan.btech2024@bitmesra.ac.in",
      photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150",
      branch: "Computer Science",
      year: "2nd Year",
      hostel: "Vivekananda Hostel"
    }
  ],
  adminCredentials: {
    username: "admin",
    password: "admin123"
  }
};

app.get('/api/admin/students', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        roll_no AS "rollNo",
        student_name AS "name",
        hostel,
        email,
        access_status AS "accessStatus",
        device_id AS "deviceId",
        device_locked AS "deviceLocked",
        last_login_at AS "lastLoginAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM students
      ORDER BY hostel ASC, roll_no ASC
    `);

    res.json({
      success: true,
      students: result.rows
    });
  } catch (error) {
    console.error('Fetch students error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/students/:id/revoke', async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE students
      SET access_status = 'revoked',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id,
        roll_no AS "rollNo",
        student_name AS "name",
        hostel,
        email,
        access_status AS "accessStatus",
        device_id AS "deviceId",
        device_locked AS "deviceLocked"
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      message: 'Student access revoked',
      student: result.rows[0]
    });
  } catch (error) {
    console.error('Revoke student error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/students/:id/allow', async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE students
      SET access_status = 'active',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id,
        roll_no AS "rollNo",
        student_name AS "name",
        hostel,
        email,
        access_status AS "accessStatus",
        device_id AS "deviceId",
        device_locked AS "deviceLocked"
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      message: 'Student access allowed',
      student: result.rows[0]
    });
  } catch (error) {
    console.error('Allow student error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/students/:id/reset-device', async (req, res) => {
  try {
    const result = await pool.query(
      `
      UPDATE students
      SET device_id = NULL,
          device_locked = FALSE,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING 
        id,
        roll_no AS "rollNo",
        student_name AS "name",
        hostel,
        email,
        access_status AS "accessStatus",
        device_id AS "deviceId",
        device_locked AS "deviceLocked"
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.json({
      success: true,
      message: 'Student device reset successfully',
      student: result.rows[0]
    });
  } catch (error) {
    console.error('Reset device error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/import-students', async (req, res) => {
  try {
    const workbook = XLSX.readFile('./data/data.xlsx');
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const rollNo = String(row['Roll No'] || '').trim();
      const name = String(row['Student Name'] || '').trim();
      const hostel = Number(row['Hostel']);
      const email = String(row['Email ID'] || '').trim().toLowerCase();

      if (!rollNo || !name || !hostel || !email) {
        skipped++;
        continue;
      }

      const result = await pool.query(
        `
        INSERT INTO students (roll_no, student_name, hostel, email, access_status)
        VALUES ($1, $2, $3, $4, 'active')
        ON CONFLICT (email)
        DO UPDATE SET
          roll_no = EXCLUDED.roll_no,
          student_name = EXCLUDED.student_name,
          hostel = EXCLUDED.hostel,
          updated_at = CURRENT_TIMESTAMP
        RETURNING xmax
        `,
        [rollNo, name, hostel, email]
      );

      if (result.rows[0].xmax === '0') {
        inserted++;
      } else {
        updated++;
      }
    }

    res.json({
      success: true,
      message: 'Students imported successfully',
      inserted,
      updated,
      skipped,
      total: rows.length
    });

  } catch (error) {
    console.error('Excel import error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Smart Pass Backend API Running!',
    version: '1.0.0',
    endpoints: ['/api/student/login', '/api/student/demo-login', '/api/admin/login', '/api/location/verify']
  });
});

// Demo Login Route (for testing without Google OAuth)
app.post('/api/student/demo-login', (req, res) => {
  console.log('Demo login request received');
  const { email } = req.body;
  
  if (email && email.endsWith('@bitmesra.ac.in')) {
    // Extract roll number from email
    const emailParts = email.split('@')[0];
    const rollNumber = emailParts.toUpperCase().replace('.', '/');
    
    const student = {
      id: rollNumber,
      name: "Aryan Shankar", // Demo name
      email: email,
      photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150",
      branch: "Computer Science",
      year: "2nd Year",
      hostel: "Vivekananda Hostel"
    };
    
    const token = jwt.sign({ studentId: student.id }, process.env.JWT_SECRET || 'default-secret');
    
    console.log('✅ Demo student authenticated:', student.name);
    
    res.json({
      success: true,
      user: student,
      token: token
    });
  } else {
    res.status(400).json({
      success: false,
      message: 'Please use your college Gmail account'
    });
  }
});

async function saveLoginLog({
  email = null,
  rollNo = null,
  studentName = null,
  loginStatus = 'failed',
  reason = '',
  deviceId = null,
  req
}) {
  try {
    const ipAddress =
      req.headers['x-forwarded-for'] ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;

    const userAgent = req.headers['user-agent'] || null;

    await pool.query(
      `
      INSERT INTO login_logs (
        email,
        roll_no,
        student_name,
        login_status,
        reason,
        device_id,
        ip_address,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        email,
        rollNo,
        studentName,
        loginStatus,
        reason,
        deviceId,
        ipAddress,
        userAgent
      ]
    );
  } catch (error) {
    console.error('Login log save error:', error.message);
  }
}


// Student Login with Google OAuth
app.post('/api/student/login', async (req, res) => {
  let email = null;
  let deviceId = null;

  try {
    const body = req.body;
    const token = body.token;
    deviceId = body.deviceId;

    if (!token) {
      await saveLoginLog({
        loginStatus: 'failed',
        reason: 'No authentication token provided',
        deviceId,
        req
      });

      return res.status(400).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    console.log('Verifying Google OAuth token...');
    console.log('ENV GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
    console.log('Token received length:', token ? token.length : 0);

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    email = String(payload.email || '').toLowerCase();
    const googleName = payload.name;
    const photo = payload.picture;

    console.log('Google OAuth verification successful for:', email);

    if (!email.endsWith('@bitmesra.ac.in')) {
      await saveLoginLog({
        email,
        loginStatus: 'failed',
        reason: 'Non BIT Mesra email used',
        deviceId,
        req
      });

      return res.status(400).json({
        success: false,
        message: 'Please use your BIT Mesra college Gmail account (@bitmesra.ac.in)'
      });
    }

    const result = await pool.query(
      `
      SELECT 
        id,
        roll_no,
        student_name,
        hostel,
        email,
        access_status,
        access_from,
        access_until,
        access_reason,
        device_id,
        device_locked
      FROM students
      WHERE LOWER(email) = LOWER($1)
      `,
      [email]
    );

    if (result.rows.length === 0) {
      await saveLoginLog({
        email,
        loginStatus: 'failed',
        reason: 'Email not found in student database',
        deviceId,
        req
      });

      return res.status(403).json({
        success: false,
        message: 'Your email is not registered in the Smart Pass student database. Please contact the hostel/mess admin.'
      });
    }

    const dbStudent = result.rows[0];
    const now = new Date();

    if (dbStudent.access_status === 'revoked') {
      const accessUntil = dbStudent.access_until ? new Date(dbStudent.access_until) : null;

      if (!accessUntil || accessUntil > now) {
        await saveLoginLog({
          email,
          rollNo: dbStudent.roll_no,
          studentName: dbStudent.student_name,
          loginStatus: 'failed',
          reason: dbStudent.access_reason || 'Access revoked by admin',
          deviceId,
          req
        });

        return res.status(403).json({
          success: false,
          message: dbStudent.access_reason
            ? `Your Smart Pass access has been revoked. Reason: ${dbStudent.access_reason}`
            : 'Your Smart Pass access has been revoked. Please contact the admin.'
        });
      }

      await pool.query(
        `
        UPDATE students
        SET access_status = 'active',
            access_reason = NULL,
            access_until = NULL,
            access_updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [dbStudent.id]
      );

      dbStudent.access_status = 'active';
    }

    if (dbStudent.access_from && new Date(dbStudent.access_from) > now) {
      await saveLoginLog({
        email,
        rollNo: dbStudent.roll_no,
        studentName: dbStudent.student_name,
        loginStatus: 'failed',
        reason: 'Access period has not started yet',
        deviceId,
        req
      });

      return res.status(403).json({
        success: false,
        message: 'Your Smart Pass access period has not started yet.'
      });
    }

    if (dbStudent.access_until && new Date(dbStudent.access_until) < now) {
      await saveLoginLog({
        email,
        rollNo: dbStudent.roll_no,
        studentName: dbStudent.student_name,
        loginStatus: 'failed',
        reason: 'Temporary access expired',
        deviceId,
        req
      });

      return res.status(403).json({
        success: false,
        message: 'Your temporary Smart Pass access has expired. Please contact admin.'
      });
    }

    if (dbStudent.device_locked && dbStudent.device_id && deviceId && dbStudent.device_id !== deviceId) {
      await saveLoginLog({
        email,
        rollNo: dbStudent.roll_no,
        studentName: dbStudent.student_name,
        loginStatus: 'failed',
        reason: 'Account already linked to another device',
        deviceId,
        req
      });

      return res.status(403).json({
        success: false,
        message: 'This account is already linked to another device. Please contact admin to reset device access.'
      });
    }

    if (deviceId && !dbStudent.device_id) {
      await pool.query(
        `
        UPDATE students
        SET device_id = $1,
            device_locked = TRUE,
            last_login_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        `,
        [deviceId, dbStudent.id]
      );
    } else {
      await pool.query(
        `
        UPDATE students
        SET last_login_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [dbStudent.id]
      );
    }

    const student = {
      id: dbStudent.roll_no,
      name: dbStudent.student_name,
      email: dbStudent.email,
      photo: photo,
      branch: dbStudent.branch || 'Mechanical Engineering',
      year: dbStudent.year || '2nd Year',
      hostel: `Hostel ${dbStudent.hostel}`,
      hostelNumber: dbStudent.hostel,
      accessStatus: dbStudent.access_status,
      accessReason: dbStudent.access_reason || null
    };

    const authToken = jwt.sign(
      {
        studentId: student.id,
        email: student.email,
        name: student.name,
        photo: student.photo,
        hostel: dbStudent.hostel,
        dbId: dbStudent.id
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    await saveLoginLog({
      email,
      rollNo: dbStudent.roll_no,
      studentName: dbStudent.student_name,
      loginStatus: 'success',
      reason: 'Login successful',
      deviceId,
      req
    });

    console.log('Student authenticated successfully:', student.name);

    res.json({
      success: true,
      user: student,
      token: authToken
    });

  } catch (error) {
    console.error('Google OAuth verification failed:', error);

    await saveLoginLog({
      email,
      loginStatus: 'failed',
      reason: 'Invalid Google authentication token',
      deviceId,
      req
    });

    res.status(401).json({
      success: false,
      message: 'Invalid authentication token. Please try logging in again.'
    });
  }
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    const result = await pool.query(
      `
      SELECT id, username, password_hash, role, allowed_hostels
      FROM admins
      WHERE username = $1
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin username or password'
      });
    }

    const admin = result.rows[0];

    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin username or password'
      });
    }

    const token = jwt.sign(
      {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        allowedHostels: admin.allowed_hostels
      },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '12h' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        allowedHostels: admin.allowed_hostels
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/admin/login-logs', async (req, res) => {
  try {
    const {
      status,
      email,
      fromDate,
      toDate
    } = req.query;

    let query = `
      SELECT 
        id,
        email,
        roll_no AS "rollNo",
        student_name AS "studentName",
        login_status AS "loginStatus",
        reason,
        device_id AS "deviceId",
        ip_address AS "ipAddress",
        user_agent AS "userAgent",
        created_at AS "createdAt"
      FROM login_logs
      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;

    if (status && status !== 'all') {
      query += ` AND login_status = $${index}`;
      values.push(status);
      index++;
    }

    if (email) {
      query += ` AND LOWER(email) LIKE LOWER($${index})`;
      values.push(`%${email}%`);
      index++;
    }

    if (fromDate) {
      query += ` AND created_at >= $${index}`;
      values.push(fromDate);
      index++;
    }

    if (toDate) {
      query += ` AND created_at <= $${index}`;
      values.push(toDate);
      index++;
    }

    query += ` ORDER BY created_at DESC LIMIT 200`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      logs: result.rows
    });

  } catch (error) {
    console.error('Login logs fetch error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/forgot-password', async (req, res) => {
  try {
    const { username, resetCode, newPassword } = req.body;

    if (!username || !resetCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Username, reset code and new password are required'
      });
    }

    if (resetCode !== process.env.ADMIN_RESET_CODE) {
      return res.status(403).json({
        success: false,
        message: 'Invalid reset code'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const result = await pool.query(
      `
      UPDATE admins
      SET password_hash = $1
      WHERE username = $2
      RETURNING id, username, role
      `,
      [passwordHash, username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Location verification
app.post('/api/location/verify', async (req, res) => {
  const {
    latitude,
    longitude,
    accuracy,
    email,
    rollNo,
    studentName
  } = req.body;

  try {
    const messLat = parseFloat(process.env.MESS_LOCATION_LAT) || 23.4136;
    const messLng = parseFloat(process.env.MESS_LOCATION_LNG) || 85.4399;
    const radius = parseInt(process.env.MESS_LOCATION_RADIUS) || 50000;

    function calculateDistance(lat1, lng1, lat2, lng2) {
      const R = 6371e3;
      const φ1 = lat1 * Math.PI / 180;
      const φ2 = lat2 * Math.PI / 180;
      const Δφ = (lat2 - lat1) * Math.PI / 180;
      const Δλ = (lng2 - lng1) * Math.PI / 180;

      const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    const distance = calculateDistance(latitude, longitude, messLat, messLng);
    const roundedDistance = Math.round(distance);
    const isValid = distance <= radius;

    const reason = isValid
      ? 'Location verified successfully'
      : `Student is ${roundedDistance}m away from allowed mess area`;

    await pool.query(
      `
      INSERT INTO location_logs (
        email,
        roll_no,
        student_name,
        latitude,
        longitude,
        accuracy,
        distance_from_mess,
        is_valid,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        email || null,
        rollNo || null,
        studentName || null,
        latitude,
        longitude,
        accuracy,
        roundedDistance,
        isValid,
        reason
      ]
    );

    console.log(`Location verification: distance=${roundedDistance}m, valid=${isValid}`);

    res.json({
      isValid,
      distance: roundedDistance,
      accuracy,
      message: isValid
        ? 'Location verified - You are at the mess'
        : `Please move closer to mess hall (${roundedDistance}m away)`
    });

  } catch (error) {
    console.error('Location verification error:', error);

    res.status(500).json({
      isValid: false,
      message: error.message
    });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

// Verify JWT and return student profile
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.json({ success: false });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    );

    const email = String(decoded.email || '').toLowerCase();

    if (!email.endsWith('@bitmesra.ac.in')) {
      return res.json({ success: false });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        roll_no,
        student_name,
        email,
        hostel,
        access_status,
        access_reason
      FROM students
      WHERE LOWER(email) = LOWER($1)
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false });
    }

    const dbStudent = result.rows[0];

    if (dbStudent.access_status === 'revoked') {
      return res.json({ success: false });
    }

    const user = {
      id: dbStudent.roll_no,
      name: dbStudent.student_name,
      email: dbStudent.email,
      photo: decoded.photo || '',
      branch: 'Mechanical Engineering',
      year: '2nd Year',
      hostel: `Hostel ${dbStudent.hostel}`,
      hostelNumber: dbStudent.hostel,
      accessStatus: dbStudent.access_status,
      accessReason: dbStudent.access_reason || null
    };

    return res.json({
      success: true,
      user
    });

  } catch (error) {
    console.error('Auth verify error:', error.message);
    return res.json({ success: false });
  }
});

// Enhanced QR Code Generation
app.post('/api/student/generate-qr', async (req, res) => {
  try {
    const { studentId, studentEmail, mealSlot, qrId, timestamp, validUntil, location } = req.body;

    console.log('📱 QR generation request:', {
      student: studentId,
      meal: mealSlot,
      qrId,
      location: location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Unknown'
    });

    const normalizedStudentId = String(studentId || '').trim().replaceAll('-', '/');
    const normalizedEmail = String(studentEmail || '').trim().toLowerCase();

    console.log('Searching student for QR:', {
      studentId,
      studentEmail,
      normalizedStudentId,
      normalizedEmail
    });

    const studentResult = await pool.query(
      `
      SELECT roll_no, student_name, email, hostel, access_status
      FROM students
      WHERE REPLACE(roll_no, '-', '/') = $1
        OR LOWER(email) = $2
      `,
      [normalizedStudentId, normalizedEmail]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Student not found in database for ${normalizedEmail || normalizedStudentId}`
      });
    }

    const student = studentResult.rows[0];

    if (student.access_status === 'revoked') {
      return res.status(403).json({
        success: false,
        message: 'Your access has been revoked. Please contact admin.'
      });
    }

    const ticketDate = new Date(timestamp).toISOString().split('T')[0];

    const ticketId = `${student.roll_no.replaceAll('/', '-')}_${ticketDate}_${mealSlot.toLowerCase()}`;

    const existingTicket = await pool.query(
      `
      SELECT *
      FROM tickets
      WHERE roll_no = $1
        AND ticket_date = $2
        AND LOWER(meal_slot) = LOWER($3)
      `,
      [student.roll_no, ticketDate, mealSlot]
    );

      if (existingTicket.rows.length > 0) {
        const ticket = existingTicket.rows[0];
        const nowTime = new Date();
        const oldValidUntil = new Date(ticket.valid_until);

        if (ticket.status === 'used') {
          return res.status(400).json({
            success: false,
            message: 'This meal pass has already been used.'
          });
        }

        // If existing ticket is still valid, return same QR
        if (ticket.status === 'active' && nowTime <= oldValidUntil) {
          return res.json({
            success: true,
            qrId: ticket.qr_id,
            ticketId: ticket.ticket_id,
            message: 'Existing active QR returned',
            validUntil: ticket.valid_until
          });
        }

        // If existing ticket is expired, refresh same ticket with new QR ID
        const refreshedTicket = await pool.query(
          `
          UPDATE tickets
          SET qr_id = $1,
              status = 'active',
              generated_at = $2,
              valid_until = $3
          WHERE id = $4
          RETURNING ticket_id, qr_id, valid_until
          `,
          [qrId, timestamp, validUntil, ticket.id]
        );

        return res.json({
          success: true,
          qrId: refreshedTicket.rows[0].qr_id,
          ticketId: refreshedTicket.rows[0].ticket_id,
          message: 'Expired QR refreshed successfully',
          validUntil: refreshedTicket.rows[0].valid_until
        });
      }

    await pool.query(
      `
      INSERT INTO tickets (
        ticket_id,
        qr_id,
        roll_no,
        student_name,
        email,
        hostel,
        meal_slot,
        ticket_date,
        status,
        generated_at,
        valid_until
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $10)
      `,
      [
        ticketId,
        qrId,
        student.roll_no,
        student.student_name,
        student.email,
        student.hostel,
        mealSlot,
        ticketDate,
        timestamp,
        validUntil
      ]
    );

    console.log('✅ QR stored in PostgreSQL:', qrId);

    res.json({
      success: true,
      qrId,
      ticketId,
      message: 'QR code generated and stored successfully',
      validUntil
    });

  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// QR Code Verification (Enhanced)
app.post('/api/admin/verify-qr', async (req, res) => {
  const { qrData } = req.body;

  console.log('🔍 QR verification request received');

  try {
    const data = JSON.parse(qrData);

    const qrId = data.security?.qrId || data.qrId;
    const validUntilValue = data.security?.validUntil || data.validUntil;
    const studentId = data.student?.id || data.studentId;
    const studentName = data.student?.name || data.studentName;
    const studentEmail = data.student?.email || data.studentEmail;
    const mealSlot = data.meal?.slot || data.mealSlot;

    if (!qrId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code: missing QR ID'
      });
    }

    const ticketResult = await pool.query(
      `
      SELECT *
      FROM tickets
      WHERE qr_id = $1
      `,
      [qrId]
    );

    if (ticketResult.rows.length === 0) {
      await pool.query(
        `
        INSERT INTO scan_logs (qr_id, roll_no, email, meal_slot, scan_status, message, scanned_by)
        VALUES ($1, $2, $3, $4, 'invalid', 'QR code not found', 'admin')
        `,
        [qrId, studentId, studentEmail, mealSlot]
      );

      return res.status(404).json({
        success: false,
        message: 'QR code not found or invalid'
      });
    }

    const ticket = ticketResult.rows[0];

    const now = new Date();
    const validUntil = new Date(validUntilValue);

    if (now > validUntil) {
      await pool.query(
        `
        UPDATE tickets
        SET status = 'expired'
        WHERE qr_id = $1 AND status = 'active'
        `,
        [qrId]
      );

      await pool.query(
        `
        INSERT INTO scan_logs (qr_id, roll_no, email, meal_slot, scan_status, message, scanned_by)
        VALUES ($1, $2, $3, $4, 'expired', 'QR code expired', 'admin')
        `,
        [qrId, ticket.roll_no, ticket.email, ticket.meal_slot]
      );

      return res.status(400).json({
        success: false,
        message: 'QR code has expired'
      });
    }

    if (ticket.status === 'used') {
      await pool.query(
        `
        INSERT INTO scan_logs (qr_id, roll_no, email, meal_slot, scan_status, message, scanned_by)
        VALUES ($1, $2, $3, $4, 'duplicate', 'QR code already used', 'admin')
        `,
        [qrId, ticket.roll_no, ticket.email, ticket.meal_slot]
      );

      return res.status(400).json({
        success: false,
        message: 'QR code has already been used'
      });
    }

    const student = {
      id: ticket.roll_no || studentId,
      name: ticket.student_name || studentName,
      email: ticket.email || studentEmail,
      hostel: `Hostel ${ticket.hostel}`,
      branch: 'Mechanical Engineering',
      year: '2nd Year',
      photo: ''
    };

    console.log('✅ QR verification successful:', {
      qrId,
      student: student.name,
      meal: ticket.meal_slot
    });

    res.json({
      success: true,
      student,
      mealData: data,
      qrRecord: {
        qrId: ticket.qr_id,
        ticketId: ticket.ticket_id,
        mealSlot: ticket.meal_slot,
        status: ticket.status,
        validUntil: ticket.valid_until
      },
      message: 'QR code verified successfully'
    });

  } catch (error) {
    console.error('QR verification error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid QR code format'
    });
  }
});

// Mark QR as used
app.post('/api/admin/use-qr', async (req, res) => {
  try {
    const { qrId } = req.body;

    const result = await pool.query(
      `
      UPDATE tickets
      SET status = 'used',
          used_at = CURRENT_TIMESTAMP,
          verified_by = 'admin'
      WHERE qr_id = $1
        AND status = 'active'
      RETURNING *
      `,
      [qrId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'QR code not found or already used'
      });
    }

    const ticket = result.rows[0];

    await pool.query(
      `
      INSERT INTO scan_logs (qr_id, roll_no, email, meal_slot, scan_status, message, scanned_by)
      VALUES ($1, $2, $3, $4, 'success', 'QR verified and marked as used', 'admin')
      `,
      [ticket.qr_id, ticket.roll_no, ticket.email, ticket.meal_slot]
    );

    console.log('✅ QR marked as used in PostgreSQL:', qrId);

    res.json({
      success: true,
      message: 'QR code marked as used',
      ticket
    });

  } catch (error) {
    console.error('Use QR error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get QR status (for debugging)
app.get('/api/admin/qr-status/:qrId', async (req, res) => {
  try {
    const qrId = req.params.qrId;

    const result = await pool.query(
      `
      SELECT *
      FROM tickets
      WHERE qr_id = $1
      `,
      [qrId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'QR not found'
      });
    }

    res.json({
      success: true,
      qrRecord: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/create-default-admin', async (req, res) => {
  try {
    const username = 'admin';
    const password = 'admin123';

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO admins (username, password_hash, role, allowed_hostels)
      VALUES ($1, $2, 'superadmin', ARRAY[1,2,3,4,5,6,7,8,9,10])
      ON CONFLICT (username)
      DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id, username, role, allowed_hostels
      `,
      [username, passwordHash]
    );

    res.json({
      success: true,
      message: 'Default admin created successfully',
      admin: result.rows[0],
      login: {
        username,
        password
      }
    });

  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/admin/location-logs', async (req, res) => {
  try {
    const { status, email, fromDate, toDate } = req.query;

    let query = `
      SELECT
        id,
        email,
        roll_no AS "rollNo",
        student_name AS "studentName",
        latitude,
        longitude,
        accuracy,
        distance_from_mess AS "distanceFromMess",
        is_valid AS "isValid",
        reason,
        created_at AS "createdAt"
      FROM location_logs
      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;

    if (status === 'valid') {
      query += ` AND is_valid = true`;
    }

    if (status === 'invalid') {
      query += ` AND is_valid = false`;
    }

    if (email) {
      query += ` AND LOWER(email) LIKE LOWER($${index})`;
      values.push(`%${email}%`);
      index++;
    }

    if (fromDate) {
      query += ` AND created_at >= $${index}`;
      values.push(fromDate);
      index++;
    }

    if (toDate) {
      query += ` AND created_at <= $${index}`;
      values.push(toDate);
      index++;
    }

    query += ` ORDER BY created_at DESC LIMIT 200`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      logs: result.rows
    });

  } catch (error) {
    console.error('Location logs fetch error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/admin/dashboard-stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalStudents = await pool.query(`
      SELECT COUNT(*)::int AS count FROM students
    `);

    const activeStudents = await pool.query(`
      SELECT COUNT(*)::int AS count 
      FROM students 
      WHERE access_status = 'active'
    `);

    const revokedStudents = await pool.query(`
      SELECT COUNT(*)::int AS count 
      FROM students 
      WHERE access_status = 'revoked'
    `);

    const todayLoginAttempts = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM login_logs
      WHERE DATE(created_at) = $1
      `,
      [today]
    );

    const todaySuccessfulLogins = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM login_logs
      WHERE DATE(created_at) = $1
        AND login_status = 'success'
      `,
      [today]
    );

    const todayFailedLogins = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM login_logs
      WHERE DATE(created_at) = $1
        AND login_status = 'failed'
      `,
      [today]
    );

    const todayMealScans = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM tickets
      WHERE ticket_date = $1
        AND status = 'used'
      `,
      [today]
    );

    const mealWiseToday = await pool.query(
      `
      SELECT 
        meal_slot AS "mealSlot",
        COUNT(*)::int AS count
      FROM tickets
      WHERE ticket_date = $1
        AND status = 'used'
      GROUP BY meal_slot
      ORDER BY meal_slot
      `,
      [today]
    );

    const failedScansToday = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM scan_logs
      WHERE DATE(scanned_at) = $1
        AND scan_status != 'success'
      `,
      [today]
    );

    res.json({
      success: true,
      stats: {
        totalStudents: totalStudents.rows[0].count,
        activeStudents: activeStudents.rows[0].count,
        revokedStudents: revokedStudents.rows[0].count,
        todayLoginAttempts: todayLoginAttempts.rows[0].count,
        todaySuccessfulLogins: todaySuccessfulLogins.rows[0].count,
        todayFailedLogins: todayFailedLogins.rows[0].count,
        todayMealScans: todayMealScans.rows[0].count,
        failedScansToday: failedScansToday.rows[0].count,
        mealWiseToday: mealWiseToday.rows
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/admin/meal-reports', async (req, res) => {
  try {
    const { mealSlot, status, email, fromDate, toDate } = req.query;

    let query = `
      SELECT
        id,
        ticket_id AS "ticketId",
        qr_id AS "qrId",
        roll_no AS "rollNo",
        student_name AS "studentName",
        email,
        hostel,
        meal_slot AS "mealSlot",
        ticket_date AS "ticketDate",
        status,
        generated_at AS "generatedAt",
        valid_until AS "validUntil",
        used_at AS "usedAt",
        verified_by AS "verifiedBy"
      FROM tickets
      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;

    if (mealSlot && mealSlot !== 'all') {
      query += ` AND meal_slot = $${index}`;
      values.push(mealSlot);
      index++;
    }

    if (status && status !== 'all') {
      query += ` AND status = $${index}`;
      values.push(status);
      index++;
    }

    if (email) {
      query += ` AND LOWER(email) LIKE LOWER($${index})`;
      values.push(`%${email}%`);
      index++;
    }

    if (fromDate) {
      query += ` AND ticket_date >= $${index}`;
      values.push(fromDate);
      index++;
    }

    if (toDate) {
      query += ` AND ticket_date <= $${index}`;
      values.push(toDate);
      index++;
    }

    query += ` ORDER BY ticket_date DESC, generated_at DESC LIMIT 300`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      reports: result.rows
    });

  } catch (error) {
    console.error('Meal reports error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/students/:id/manage-access', async (req, res) => {
  try {
    const studentId = req.params.id;
    const {
      action,
      duration,
      customUntil,
      reason
    } = req.body;

    const studentResult = await pool.query(
      `
      SELECT id, roll_no, email, access_status
      FROM students
      WHERE id = $1
      `,
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const student = studentResult.rows[0];
    const oldStatus = student.access_status;

    let newStatus = action === 'allow' ? 'active' : 'revoked';
    let accessUntil = null;

    if (duration && duration !== 'permanent') {
      if (duration === 'custom') {
        accessUntil = customUntil || null;
      } else {
        const days = parseInt(duration);
        const untilDate = new Date();
        untilDate.setDate(untilDate.getDate() + days);
        accessUntil = untilDate.toISOString();
      }
    }

    await pool.query(
      `
      UPDATE students
      SET access_status = $1,
          access_until = $2,
          access_reason = $3,
          access_updated_by = $4,
          access_updated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      `,
      [
        newStatus,
        accessUntil,
        reason || null,
        'admin',
        studentId
      ]
    );

    await pool.query(
      `
      INSERT INTO access_logs (
        student_id,
        roll_no,
        email,
        old_status,
        new_status,
        access_until,
        reason,
        changed_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        student.id,
        student.roll_no,
        student.email,
        oldStatus,
        newStatus,
        accessUntil,
        reason || null,
        'admin'
      ]
    );

    res.json({
      success: true,
      message: `Student access changed to ${newStatus}`,
      accessUntil
    });

  } catch (error) {
    console.error('Manage access error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get('/api/admin/access-logs', async (req, res) => {
  try {
    const { email, status, fromDate, toDate } = req.query;

    let query = `
      SELECT
        al.id,
        al.student_id AS "studentId",
        al.roll_no AS "rollNo",
        s.student_name AS "studentName",
        al.email,
        al.old_status AS "oldStatus",
        al.new_status AS "newStatus",
        al.access_from AS "accessFrom",
        al.access_until AS "accessUntil",
        al.reason,
        al.changed_by AS "changedBy",
        al.created_at AS "createdAt"
      FROM access_logs al
      LEFT JOIN students s ON s.id = al.student_id
      WHERE 1 = 1
    `;

    const values = [];
    let index = 1;

    if (email) {
      query += ` AND LOWER(al.email) LIKE LOWER($${index})`;
      values.push(`%${email}%`);
      index++;
    }

    if (status && status !== 'all') {
      query += ` AND al.new_status = $${index}`;
      values.push(status);
      index++;
    }

    if (fromDate) {
      query += ` AND al.created_at >= $${index}`;
      values.push(fromDate);
      index++;
    }

    if (toDate) {
      query += ` AND al.created_at <= $${index}`;
      values.push(toDate);
      index++;
    }

    query += ` ORDER BY al.created_at DESC LIMIT 200`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      logs: result.rows
    });

  } catch (error) {
    console.error('Access logs fetch error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post('/api/admin/students/add', async (req, res) => {
  try {
    const {
      rollNo,
      studentName,
      email,
      hostel
    } = req.body;

    if (!rollNo || !studentName || !email || !hostel) {
      return res.status(400).json({
        success: false,
        message: 'Roll no, student name, email and hostel are required'
      });
    }

    if (!email.toLowerCase().endsWith('@bitmesra.ac.in')) {
      return res.status(400).json({
        success: false,
        message: 'Only BIT Mesra email is allowed'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO students (
        roll_no,
        student_name,
        email,
        hostel,
        access_status
      )
      VALUES ($1,$2,$3,$4,'active')
      RETURNING id, roll_no, student_name, email, hostel, access_status
      `,
      [
        rollNo.trim(),
        studentName.trim(),
        email.trim().toLowerCase(),
        parseInt(hostel)
      ]
    );

    res.json({
      success: true,
      message: 'Student added successfully',
      student: result.rows[0]
    });

  } catch (error) {
    console.error('Add student error:', error);

    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Student with this roll no or email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

function sendCSV(res, filename, rows) {
  if (!rows || rows.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('No data found\n');
  }

  const headers = Object.keys(rows[0]);

  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(header => {
        const value = row[header] === null || row[header] === undefined ? '' : String(row[header]);
        return `"${value.replace(/"/g, '""')}"`;
      }).join(',')
    )
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvRows.join('\n'));
}

app.get('/api/admin/export/students.csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        roll_no,
        student_name,
        email,
        hostel,
        access_status,
        device_locked,
        last_login_at,
        created_at
      FROM students
      ORDER BY hostel, roll_no
    `);

    sendCSV(res, 'students.csv', result.rows);

  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/admin/export/login-logs.csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        created_at,
        student_name,
        roll_no,
        email,
        login_status,
        reason,
        device_id,
        ip_address,
        user_agent
      FROM login_logs
      ORDER BY created_at DESC
    `);

    sendCSV(res, 'login_logs.csv', result.rows);

  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/admin/export/location-logs.csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        created_at,
        student_name,
        roll_no,
        email,
        latitude,
        longitude,
        accuracy,
        distance_from_mess,
        is_valid,
        reason
      FROM location_logs
      ORDER BY created_at DESC
    `);

    sendCSV(res, 'location_logs.csv', result.rows);

  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get('/api/admin/export/meal-reports.csv', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ticket_date,
        meal_slot,
        student_name,
        roll_no,
        email,
        hostel,
        status,
        generated_at,
        valid_until,
        used_at,
        verified_by
      FROM tickets
      ORDER BY ticket_date DESC, generated_at DESC
    `);

    sendCSV(res, 'meal_reports.csv', result.rows);

  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Smart Pass Backend running on http://localhost:${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured'}`);
  console.log(`📍 Mess Location: ${process.env.MESS_LOCATION_LAT || '23.4136'}, ${process.env.MESS_LOCATION_LNG || '85.4399'}`);
  console.log(`✅ Available endpoints:`);
  console.log(`   GET  /              - API info`);
  console.log(`   POST /api/student/demo-login    - Demo login`);
  console.log(`   POST /api/student/login         - Google OAuth login`);
  console.log(`   POST /api/admin/login           - Admin login`);
  console.log(`   POST /api/location/verify       - Location verification`);
  console.log(`   POST /api/student/generate-qr   - Generate QR code`);
  console.log(`   POST /api/admin/verify-qr       - Verify QR code`);
  console.log(`   POST /api/admin/use-qr          - Mark QR as used`);
  console.log(`   POST /api/auth/verify           - Verify JWT token`);

});
