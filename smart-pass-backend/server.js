const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB (we'll set this up later)
// mongoose.connect(process.env.MONGODB_URI);

// Student Schema (for later database integration)
const studentSchema = {
  id: String,
  name: String,
  email: String,
  photo: String,
  branch: String,
  year: String,
  hostel: String
};

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
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'No authentication token provided' 
      });
    }

    console.log('Verifying Google OAuth token...');
    
    // Verify Google OAuth token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const email = payload['email'];
    const name = payload['name'];
    const photo = payload['picture'];
    
    console.log('Google OAuth verification successful for:', email);
    
    // Check if email is from BIT Mesra domain
    if (!email.endsWith('@bitmesra.ac.in')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please use your BIT Mesra college Gmail account (@bitmesra.ac.in)' 
      });
    }
    
    // Extract roll number from email
    const emailParts = email.split('@')[0];
    const rollNumber = emailParts.toUpperCase().replace('.', '/');
    
    // Create student object
    const student = {
      id: rollNumber,
      name: name,
      email: email,
      photo: photo,
      branch: "Computer Science", // Default for demo
      year: "2nd Year",
      hostel: "Vivekananda Hostel"
    };
    
    // Create JWT token for session
    const authToken = jwt.sign(
      { studentId: student.id, email: student.email, name: student.name, photo: student.photo }, 
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
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === mockData.adminCredentials.username && 
      password === mockData.adminCredentials.password) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET || 'default-secret');
    
    console.log('✅ Admin login successful:', username);
    
    res.json({ success: true, token, admin: { username } });
  } else {
    console.log('❌ Admin login failed for username:', username);
    res.status(401).json({ success: false, message: 'Invalid credentials' });
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
app.post('/api/student/generate-qr', (req, res) => {
  const { studentId, mealSlot, qrId, timestamp, validUntil, location } = req.body;
  
  console.log('📱 QR generation request:', {
    student: studentId,
    meal: mealSlot,
    qrId: qrId,
    location: location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Unknown'
  });
  
  // In production, you would store this in database
  const qrRecord = {
    qrId,
    studentId,
    mealSlot,
    timestamp,
    validUntil,
    location: location || null,
    status: 'active',
    createdAt: new Date().toISOString()
  };
  
  // Simulate storing in database (in memory for demo)
  global.activeQRCodes = global.activeQRCodes || {};
  global.activeQRCodes[qrId] = qrRecord;
  
  console.log('✅ QR code registered:', qrId);
  
  res.json({
    success: true,
    qrId: qrId,
    message: 'QR code generated and registered successfully',
    validUntil: validUntil
  });
});

// QR Code Verification (Enhanced)
app.post('/api/admin/verify-qr', (req, res) => {
  const { qrData } = req.body;
  
  console.log('🔍 QR verification request received');
  
  try {
    const data = JSON.parse(qrData);
    const qrId = data.qrId;
    
    // Check if QR exists in our records
    const qrRecord = global.activeQRCodes && global.activeQRCodes[qrId];
    
    if (!qrRecord) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found or invalid'
      });
    }
    
    // Check if QR is still valid (not expired)
    const now = new Date();
    const validUntil = new Date(data.validUntil);
    
    if (now > validUntil) {
      return res.status(400).json({
        success: false,
        message: 'QR code has expired'
      });
    }
    
    // Check if already used
    if (qrRecord.status === 'used') {
      return res.status(400).json({
        success: false,
        message: 'QR code has already been used'
      });
    }
    
    // Get student info
    const student = mockData.students.find(s => s.id === data.studentId) || {
      id: data.studentId,
      name: data.studentName,
      email: data.studentEmail,
      photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?crop=entropy&cs=tinysrgb&fit=crop&h=150&w=150',
      branch: 'Computer Science',
      year: '2nd Year',
      hostel: 'Vivekananda Hostel'
    };
    
    console.log('✅ QR verification successful:', {
      qrId: qrId,
      student: student.name,
      meal: data.mealSlot
    });
    
    res.json({
      success: true,
      student,
      mealData: data,
      qrRecord,
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
app.post('/api/admin/use-qr', (req, res) => {
  const { qrId } = req.body;
  
  if (global.activeQRCodes && global.activeQRCodes[qrId]) {
    global.activeQRCodes[qrId].status = 'used';
    global.activeQRCodes[qrId].usedAt = new Date().toISOString();
    
    console.log('✅ QR marked as used:', qrId);
    
    res.json({ success: true, message: 'QR code marked as used' });
  } else {
    res.status(404).json({ success: false, message: 'QR code not found' });
  }
});

// Get QR status (for debugging)
app.get('/api/admin/qr-status/:qrId', (req, res) => {
  const qrId = req.params.qrId;
  const qrRecord = global.activeQRCodes && global.activeQRCodes[qrId];
  
  if (qrRecord) {
    res.json({ success: true, qrRecord });
  } else {
    res.status(404).json({ success: false, message: 'QR not found' });
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
