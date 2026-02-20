const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./config/database');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Get absolute paths
const publicPath = path.join(__dirname, '../public');
const uploadPath = path.join(__dirname, 'uploads');
const editingUploadPath = path.join(__dirname, 'editing-uploads');

console.log('\n===========================================');
console.log('🔧 SERVER CONFIGURATION');
console.log('===========================================');
console.log(`📁 Public directory: ${publicPath}`);
console.log(`📁 Application uploads: ${uploadPath}`);
console.log(`📁 Editing service uploads: ${editingUploadPath}`);
console.log('===========================================\n');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directories exist
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log('✅ Created application uploads directory');
}

if (!fs.existsSync(editingUploadPath)) {
  fs.mkdirSync(editingUploadPath, { recursive: true });
  console.log('✅ Created editing service uploads directory');
}

// ========== CONNECTION CHECK MIDDLEWARE ==========
app.use(async (req, res, next) => {
  // Skip for static files and page routes
  if (req.path.startsWith('/api/')) {
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ MongoDB not connected for API request:', req.path);
      return res.status(503).json({ 
        success: false, 
        error: 'Database connection unavailable. Please try again.' 
      });
    }
  }
  next();
});

// ========== API ROUTES ==========
// Load routers
const applicationRouter = require('./routes/application');
const adminRouter = require('./routes/admin');
const editingRouter = require('./routes/editing');

// IMPORTANT: Mount on multiple paths for backward compatibility
app.use('/api', applicationRouter);           // New path: /api/status/email
app.use('/api/application', applicationRouter); // Legacy path: /api/application/status/email

app.use('/api/admin', adminRouter);
app.use('/api/editing', editingRouter);

// ========== PAGE ROUTES WITH DATA ==========
app.get('/', (req, res) => {
  console.log('🏠 Root route accessed, serving landing page');
  res.sendFile(path.join(publicPath, 'landing.html'));
});

app.get('/apply', (req, res) => {
  console.log('📝 /apply route accessed - New Application');
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/reupload', (req, res) => {
  console.log('🔄 /reupload route accessed - Document Re-upload');
  res.sendFile(path.join(publicPath, 'reupload.html'));
});

// PROGRESS PAGE - Now with data fetching
app.get('/progress', async (req, res) => {
  console.log('📊 /progress route accessed - Application Status Check');
  
  // Check if email is provided in query
  const { email } = req.query;
  
  if (email) {
    try {
      const Application = require('./models/Application');
      const application = await Application.findOne({ 'personalInfo.email': email });
      
      if (application) {
        // Pass application data to the page
        return res.sendFile(path.join(publicPath, 'progress.html'));
      }
    } catch (error) {
      console.error('❌ Error fetching application for progress page:', error);
    }
  }
  
  // Serve the page normally - client-side JS will fetch data
  res.sendFile(path.join(publicPath, 'progress.html'));
});

app.get('/editing', (req, res) => {
  console.log('✏️ /editing route accessed - Editing Service');
  res.sendFile(path.join(publicPath, 'editing.html'));
});

app.get('/next-steps', (req, res) => {
  console.log('📄 /next-steps route accessed - Document Upload');
  res.sendFile(path.join(publicPath, 'next-steps.html'));
});

// ADMIN PAGE - Now with data
app.get('/admin', async (req, res) => {
  console.log('🔐 /admin route accessed - Admin Dashboard');
  
  // Check if there's a session/token (you can implement proper auth later)
  // For now, just serve the page - client-side JS will handle auth
  res.sendFile(path.join(publicPath, 'admin.html'));
});

// Serve static files (CSS, JS, images)
app.use(express.static(publicPath));

// ========== API STATUS ENDPOINT ==========
app.get('/api/status', (req, res) => {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.json({ 
    success: true,
    status: 'OK', 
    time: new Date().toISOString(),
    mongodb: {
      state: states[state] || 'unknown',
      readyState: state,
      host: mongoose.connection.host || 'not connected'
    }
  });
});

// ========== HEALTH CHECK ENDPOINT ==========
app.get('/health', (req, res) => {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.json({ 
    status: 'OK', 
    time: new Date().toISOString(),
    mongodb: {
      state: states[state] || 'unknown',
      readyState: state
    },
    uptime: process.uptime()
  });
});

// ========== ROUTE DEBUGGING ENDPOINT ==========
app.get('/api/routes', (req, res) => {
  res.json({
    success: true,
    message: 'Available API routes',
    routes: {
      status: [
        '/api/status/:email',
        '/api/application/status/:email (legacy)'
      ],
      admin: [
        '/api/admin/application/:email',
        '/api/admin/applications',
        '/api/admin/application/:email/document/review',
        '/api/admin/application/:email/sync-document-statuses',
        '/api/admin/application/:email/status',
        '/api/admin/application/:email/comment',
        '/api/admin/application/:email/request-reupload',
        '/api/admin/application/:email/job-offer/status',
        '/api/admin/application/:email/contract/status'
      ],
      editing: [
        '/api/editing/*'
      ]
    }
  });
});

// ========== ERROR HANDLING ==========
// 404 handler
app.use((req, res) => {
  console.log('❓ 404 Not Found:', req.url);
  
  if (req.url.startsWith('/api/')) {
    return res.status(404).json({ 
      success: false, 
      error: 'API endpoint not found',
      message: 'The requested API endpoint does not exist',
      path: req.url,
      availableAt: '/api/routes for available routes'
    });
  }
  
  const notFoundPath = path.join(publicPath, '404.html');
  
  if (fs.existsSync(notFoundPath)) {
    res.status(404).sendFile(notFoundPath);
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head><title>404 - Page Not Found</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>404 - Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <a href="/">Go to Home</a>
        </body>
      </html>
    `);
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err.stack);
  
  if (req.url.startsWith('/api/')) {
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
  
  const errorPath = path.join(publicPath, '500.html');
  
  if (fs.existsSync(errorPath)) {
    res.status(500).sendFile(errorPath);
  } else {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>500 - Server Error</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>500 - Internal Server Error</h1>
          <p>Something went wrong on our end. Please try again later.</p>
          <a href="/">Go to Home</a>
        </body>
      </html>
    `);
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('🚀 APEX GLOBAL CAREERS SERVER STARTED');
  console.log('===========================================');
  console.log(`📍 Server URL: http://localhost:${PORT}`);
  console.log(`🏠 Landing Page: http://localhost:${PORT}/`);
  console.log(`📝 New Application: http://localhost:${PORT}/apply`);
  console.log(`🔄 Re-upload Documents: http://localhost:${PORT}/reupload`);
  console.log(`📊 Application Status: http://localhost:${PORT}/progress`);
  console.log(`✏️ Editing Service: http://localhost:${PORT}/editing`);
  console.log(`📄 Next Steps: http://localhost:${PORT}/next-steps`);
  console.log(`🔐 Admin Panel: http://localhost:${PORT}/admin`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`📡 API Status: http://localhost:${PORT}/api/status`);
  console.log(`🗺️ API Routes: http://localhost:${PORT}/api/routes`);
  console.log('===========================================\n');
  console.log('📁 Storage Locations:');
  console.log(`   - Applications: ${uploadPath}`);
  console.log(`   - Editing Service: ${editingUploadPath}`);
  console.log('===========================================\n');
  console.log('🔄 Both API paths are active:');
  console.log('   - New path: /api/status/email');
  console.log('   - Legacy path: /api/application/status/email');
  console.log('===========================================\n');
});