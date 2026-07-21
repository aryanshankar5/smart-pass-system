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

app.use(cors());
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

// Student Login with Google OAuth
app.post('/api/student/login', async (req, res) => {
  try {
    const { token, deviceId } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    console.log('Verifying Google OAuth token...');

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = String(payload.email || '').toLowerCase();
    const googleName = payload.name;
    const photo = payload.picture;

    console.log('Google OAuth verification successful for:', email);

    if (!email.endsWith('@bitmesra.ac.in')) {
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
        device_id,
        device_locked
      FROM students
      WHERE LOWER(email) = LOWER($1)
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Your email is not registered in the Smart Pass student database. Please contact the hostel/mess admin.'
      });
    }

    const dbStudent = result.rows[0];

    if (dbStudent.access_status === 'revoked') {
      return res.status(403).json({
        success: false,
        message: 'Your Smart Pass access has been revoked. Please contact the admin.'
      });
    }

    if (dbStudent.device_locked && dbStudent.device_id && deviceId && dbStudent.device_id !== deviceId) {
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
      name: dbStudent.student_name || googleName,
      email: dbStudent.email,
      photo: photo,
      branch: 'Mechanical Engineering',
      year: '2nd Year',
      hostel: `Hostel ${dbStudent.hostel}`,
      hostelNumber: dbStudent.hostel
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

    console.log('Student authenticated successfully:', student.name);

    res.json({
      success: true,
      user: student,
      token: authToken
    });

  } catch (error) {
    console.error('Google OAuth verification failed:', error);
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
app.post('/api/location/verify', (req, res) => {
  const { latitude, longitude, accuracy } = req.body;
  
  const messLat = parseFloat(process.env.MESS_LOCATION_LAT) || 23.4136;
  const messLng = parseFloat(process.env.MESS_LOCATION_LNG) || 85.4399;
  const radius = parseInt(process.env.MESS_LOCATION_RADIUS) || 50;
  
  // Calculate actual distance
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lng2-lng1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }
  
  const distance = calculateDistance(latitude, longitude, messLat, messLng);
  const isValid = distance <= radius;
  
  console.log(`Location verification: distance=${Math.round(distance)}m, valid=${isValid}`);
  
  res.json({
    isValid,
    distance: Math.round(distance),
    accuracy,
    message: isValid ? 'Location verified - You are at the mess' : `Please move closer to mess hall (${Math.round(distance)}m away)`
  });
});

// Start server
const PORT = process.env.PORT || 3001;

// Verify JWT and return student profile
app.post('/api/auth/verify', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ success: false });

    // Decode & verify
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    );

    // In production you would hit MongoDB; here we rebuild the student object
    const email = decoded.email;
    if (!email || !email.endsWith('@bitmesra.ac.in'))
      return res.json({ success: false });

    const roll = email.split('@')[0].toUpperCase().replace('.', '/');
    const student = {
      id: roll,
      name: decoded.name || 'BIT Student',
      email,
      photo: decoded.photo || '',
      branch: 'Computer Science',
      year: '2nd Year',
      hostel: 'Vivekananda Hostel'
    };

    return res.json({ success: true, user: student });
  } catch (err) {
    return res.json({ success: false });
  }
});

// Verify JWT and return student profile
app.post('/api/auth/verify', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.json({ success: false });

    // Decode & verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');

    // Extract student info from token
    const email = decoded.email;
    if (!email || !email.endsWith('@bitmesra.ac.in')) {
      return res.json({ success: false });
    }

    // Rebuild student object (in production, you'd query the database)
    const roll = email.split('@')[0].toUpperCase().replace('.', '/');
    const student = {
      id: roll,
      name: decoded.name || 'BIT Student',
      email,
      photo: decoded.photo || 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150',
      branch: 'Computer Science',
      year: '2nd Year',
      hostel: 'Vivekananda Hostel'
    };

    console.log('✅ Token verified for student:', student.name);
    
    return res.json({ success: true, user: student });
  } catch (err) {
    console.log('❌ Token verification failed:', err.message);
    return res.json({ success: false });
  }
});

// Enhanced QR Code Generation
app.post('/api/student/generate-qr', async (req, res) => {
  try {
    const { studentId, mealSlot, qrId, timestamp, validUntil, location } = req.body;

    console.log('📱 QR generation request:', {
      student: studentId,
      meal: mealSlot,
      qrId,
      location: location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Unknown'
    });

    const studentResult = await pool.query(
      `
      SELECT roll_no, student_name, email, hostel, access_status
      FROM students
      WHERE roll_no = $1
      `,
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student not found in database'
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

      if (ticket.status === 'used') {
        return res.status(400).json({
          success: false,
          message: 'This meal pass has already been used.'
        });
      }

      return res.json({
        success: true,
        qrId: ticket.qr_id,
        ticketId: ticket.ticket_id,
        message: 'Existing active QR returned',
        validUntil: ticket.valid_until
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
    const validUntil = new Date(ticket.valid_until || validUntilValue);

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




// const express = require('express');
// const cors = require('cors');
// const { Pool } = require('pg');
// const { OAuth2Client } = require('google-auth-library');
// require('dotenv').config();

// const app = express();
// const port = process.env.PORT || 3001;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Database connection
// const pool = new Pool({
//     connectionString: process.env.DATABASE_URL
// });

// // Google OAuth client
// const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// // Auth middleware
// async function authenticate(req, res, next) {
//     try {
//         const token = req.headers.authorization?.split(' ')[1];
        
//         if (!token) {
//             return res.status(401).json({ success: false, message: 'No token provided' });
//         }

//         const ticket = await client.verifyIdToken({
//             idToken: token,
//             audience: process.env.GOOGLE_CLIENT_ID
//         });
        
//         const payload = ticket.getPayload();
        
//         // Find user in database
//         const userResult = await pool.query(
//             'SELECT * FROM users WHERE email = $1',
//             [payload.email]
//         );
        
//         if (userResult.rows.length === 0) {
//             return res.status(404).json({ success: false, message: 'User not found in database' });
//         }
        
//         req.user = userResult.rows[0];
//         next();
//     } catch (error) {
//         console.error('Auth error:', error);
//         res.status(401).json({ success: false, message: 'Invalid token' });
//     }
// }

// // Routes

// // Student login
// app.post('/api/student/login', async (req, res) => {
//     try {
//         const { token } = req.body;
        
//         const ticket = await client.verifyIdToken({
//             idToken: token,
//             audience: process.env.GOOGLE_CLIENT_ID
//         });
        
//         const payload = ticket.getPayload();
        
//         // Find user in database
//         const userResult = await pool.query(
//             'SELECT * FROM users WHERE email = $1',
//             [payload.email]
//         );
        
//         if (userResult.rows.length === 0) {
//             return res.status(404).json({ 
//                 success: false, 
//                 message: 'Email not registered in BIT Mesra system' 
//             });
//         }
        
//         const user = userResult.rows[0];
        
//         res.json({
//             success: true,
//             token: token, // In production, generate your own JWT
//             user: {
//                 id: user.student_id,
//                 name: user.name,
//                 email: user.email,
//                 photo: user.photo_url,
//                 branch: user.branch,
//                 year: user.year,
//                 hostel: user.hostel
//             }
//         });
//     } catch (error) {
//         console.error('Login error:', error);
//         res.status(500).json({ success: false, message: 'Login failed' });
//     }
// });

// // Generate QR code
// app.post('/api/student/generate-qr', authenticate, async (req, res) => {
//     try {
//         const { studentId, mealSlot, qrId, timestamp, validUntil, location } = req.body;
        
//         await pool.query(
//             `INSERT INTO qr_activities 
//              (user_id, qr_id, meal_slot, generated_at, latitude, longitude, expires_at) 
//              VALUES ($1, $2, $3, $4, $5, $6, $7)`,
//             [
//                 req.user.id,
//                 qrId,
//                 mealSlot,
//                 timestamp,
//                 location?.latitude || null,
//                 location?.longitude || null,
//                 validUntil
//             ]
//         );
        
//         res.json({ success: true, message: 'QR generated and logged' });
//     } catch (error) {
//         console.error('QR generation error:', error);
//         res.status(500).json({ success: false, message: 'Failed to generate QR' });
//     }
// });

// // Location verification
// app.post('/api/location/verify', authenticate, async (req, res) => {
//     try {
//         const { latitude, longitude } = req.body;
        
//         // BIT Mesra coordinates
//         const bitLat = 23.4136;
//         const bitLng = 85.4399;
//         const allowedRadius = 50000; // 50km for testing
        
//         // Calculate distance
//         const distance = calculateDistance(latitude, longitude, bitLat, bitLng);
        
//         res.json({
//             success: true,
//             isValid: distance <= allowedRadius,
//             distance: Math.round(distance)
//         });
//     } catch (error) {
//         console.error('Location verification error:', error);
//         res.status(500).json({ success: false, message: 'Location verification failed' });
//     }
// });

// // Auth verification
// app.post('/api/auth/verify', authenticate, (req, res) => {
//     res.json({
//         success: true,
//         user: {
//             id: req.user.student_id,
//             name: req.user.name,
//             email: req.user.email,
//             photo: req.user.photo_url,
//             branch: req.user.branch,
//             year: req.user.year,
//             hostel: req.user.hostel
//         }
//     });
// });

// // Helper function to calculate distance
// function calculateDistance(lat1, lon1, lat2, lon2) {
//     const R = 6371000; // Earth's radius in meters
//     const dLat = (lat2 - lat1) * Math.PI / 180;
//     const dLon = (lon2 - lon1) * Math.PI / 180;
//     const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
//               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
//               Math.sin(dLon/2) * Math.sin(dLon/2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
//     return R * c;
// }

// app.listen(port, () => {
//     console.log(`🚀 Server running on http://localhost:${port}`);
// });
