const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./config/database');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

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

// ⚡ IMPORTANT: Increase payload limits for 50MB file uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Ensure upload directories exist
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log('✅ Created application uploads directory');
}

if (!fs.existsSync(editingUploadPath)) {
  fs.mkdirSync(editingUploadPath, { recursive: true });
  console.log('✅ Created editing service uploads directory');
}

// ========== EMAIL CONFIGURATION ==========
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

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

// ========== GENERATE APPLICATION ID ==========
function generateApplicationId() {
    const prefix = 'AGC';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}

// ========== SEND CONFIRMATION EMAIL ==========
async function sendConfirmationEmail(application) {
    const mailOptions = {
        from: '"Apex Global Careers" <noreply@apexglobal.com>',
        to: application.personalInfo.email,
        subject: `Application Received - ${application.applicationId}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .application-id { background: #667eea; color: white; padding: 15px; text-align: center; font-size: 24px; border-radius: 5px; margin: 20px 0; letter-spacing: 2px; }
                    .details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
                    .button { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; }
                    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Application Received! 🎉</h1>
                    </div>
                    <div class="content">
                        <p>Dear <strong>${application.personalInfo.fullName}</strong>,</p>
                        <p>Thank you for submitting your application to Apex Global Careers. We have successfully received your documents and will begin processing them shortly.</p>
                        
                        <div class="application-id">
                            <strong>${application.applicationId}</strong>
                        </div>
                        
                        <div class="details">
                            <h3>Application Summary</h3>
                            <p><strong>Preferred Country:</strong> ${application.jobPreferences.preferredCountry}</p>
                            <p><strong>Preferred Job:</strong> ${application.jobPreferences.preferredJob}</p>
                            <p><strong>Submitted:</strong> ${new Date(application.createdAt).toLocaleString()}</p>
                        </div>
                        
                        <p>You can track your application status anytime using your Application ID or email:</p>
                        <p style="text-align: center;">
                            <a href="http://localhost:${PORT}/progress?email=${encodeURIComponent(application.personalInfo.email)}" class="button">Track Application</a>
                        </p>
                        
                        <p><strong>What happens next?</strong></p>
                        <ul>
                            <li>Our team will review your documents within 24-48 hours</li>
                            <li>You'll receive an email when your application status changes</li>
                            <li>Check your status anytime using the link above</li>
                        </ul>
                        
                        <p>If you have any questions, please contact our support team.</p>
                        
                        <p>Best regards,<br>
                        <strong>Apex Global Careers Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2024 Apex Global Careers. All rights reserved.</p>
                        <p>This is an automated message, please do not reply.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Confirmation email sent to ${application.personalInfo.email}`);
    } catch (error) {
        console.error('❌ Error sending email:', error);
    }
}

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

// ========== COUNTRY CODES API ==========
app.get('/api/country-codes', (req, res) => {
    const countryCodes = [
        { code: '+93', country: 'Afghanistan' },
        { code: '+355', country: 'Albania' },
        { code: '+213', country: 'Algeria' },
        { code: '+376', country: 'Andorra' },
        { code: '+244', country: 'Angola' },
        { code: '+54', country: 'Argentina' },
        { code: '+374', country: 'Armenia' },
        { code: '+61', country: 'Australia' },
        { code: '+43', country: 'Austria' },
        { code: '+994', country: 'Azerbaijan' },
        { code: '+973', country: 'Bahrain' },
        { code: '+880', country: 'Bangladesh' },
        { code: '+375', country: 'Belarus' },
        { code: '+32', country: 'Belgium' },
        { code: '+229', country: 'Benin' },
        { code: '+975', country: 'Bhutan' },
        { code: '+591', country: 'Bolivia' },
        { code: '+387', country: 'Bosnia and Herzegovina' },
        { code: '+267', country: 'Botswana' },
        { code: '+55', country: 'Brazil' },
        { code: '+673', country: 'Brunei' },
        { code: '+359', country: 'Bulgaria' },
        { code: '+226', country: 'Burkina Faso' },
        { code: '+257', country: 'Burundi' },
        { code: '+238', country: 'Cabo Verde' },
        { code: '+855', country: 'Cambodia' },
        { code: '+237', country: 'Cameroon' },
        { code: '+1', country: 'Canada' },
        { code: '+236', country: 'Central African Republic' },
        { code: '+235', country: 'Chad' },
        { code: '+56', country: 'Chile' },
        { code: '+86', country: 'China' },
        { code: '+57', country: 'Colombia' },
        { code: '+269', country: 'Comoros' },
        { code: '+242', country: 'Congo' },
        { code: '+243', country: 'Congo, Democratic Republic' },
        { code: '+506', country: 'Costa Rica' },
        { code: '+225', country: 'Côte d\'Ivoire' },
        { code: '+385', country: 'Croatia' },
        { code: '+53', country: 'Cuba' },
        { code: '+357', country: 'Cyprus' },
        { code: '+420', country: 'Czech Republic' },
        { code: '+45', country: 'Denmark' },
        { code: '+253', country: 'Djibouti' },
        { code: '+1', country: 'Dominica' },
        { code: '+1', country: 'Dominican Republic' },
        { code: '+593', country: 'Ecuador' },
        { code: '+20', country: 'Egypt' },
        { code: '+503', country: 'El Salvador' },
        { code: '+240', country: 'Equatorial Guinea' },
        { code: '+291', country: 'Eritrea' },
        { code: '+372', country: 'Estonia' },
        { code: '+268', country: 'Eswatini' },
        { code: '+251', country: 'Ethiopia' },
        { code: '+679', country: 'Fiji' },
        { code: '+358', country: 'Finland' },
        { code: '+33', country: 'France' },
        { code: '+241', country: 'Gabon' },
        { code: '+220', country: 'Gambia' },
        { code: '+995', country: 'Georgia' },
        { code: '+49', country: 'Germany' },
        { code: '+233', country: 'Ghana' },
        { code: '+30', country: 'Greece' },
        { code: '+299', country: 'Greenland' },
        { code: '+502', country: 'Guatemala' },
        { code: '+224', country: 'Guinea' },
        { code: '+245', country: 'Guinea-Bissau' },
        { code: '+592', country: 'Guyana' },
        { code: '+509', country: 'Haiti' },
        { code: '+504', country: 'Honduras' },
        { code: '+36', country: 'Hungary' },
        { code: '+354', country: 'Iceland' },
        { code: '+91', country: 'India' },
        { code: '+62', country: 'Indonesia' },
        { code: '+98', country: 'Iran' },
        { code: '+964', country: 'Iraq' },
        { code: '+353', country: 'Ireland' },
        { code: '+972', country: 'Israel' },
        { code: '+39', country: 'Italy' },
        { code: '+1', country: 'Jamaica' },
        { code: '+81', country: 'Japan' },
        { code: '+962', country: 'Jordan' },
        { code: '+7', country: 'Kazakhstan' },
        { code: '+254', country: 'Kenya' },
        { code: '+686', country: 'Kiribati' },
        { code: '+383', country: 'Kosovo' },
        { code: '+965', country: 'Kuwait' },
        { code: '+996', country: 'Kyrgyzstan' },
        { code: '+856', country: 'Laos' },
        { code: '+371', country: 'Latvia' },
        { code: '+961', country: 'Lebanon' },
        { code: '+266', country: 'Lesotho' },
        { code: '+231', country: 'Liberia' },
        { code: '+218', country: 'Libya' },
        { code: '+423', country: 'Liechtenstein' },
        { code: '+370', country: 'Lithuania' },
        { code: '+352', country: 'Luxembourg' },
        { code: '+261', country: 'Madagascar' },
        { code: '+265', country: 'Malawi' },
        { code: '+60', country: 'Malaysia' },
        { code: '+960', country: 'Maldives' },
        { code: '+223', country: 'Mali' },
        { code: '+356', country: 'Malta' },
        { code: '+692', country: 'Marshall Islands' },
        { code: '+222', country: 'Mauritania' },
        { code: '+230', country: 'Mauritius' },
        { code: '+52', country: 'Mexico' },
        { code: '+691', country: 'Micronesia' },
        { code: '+373', country: 'Moldova' },
        { code: '+377', country: 'Monaco' },
        { code: '+976', country: 'Mongolia' },
        { code: '+382', country: 'Montenegro' },
        { code: '+212', country: 'Morocco' },
        { code: '+258', country: 'Mozambique' },
        { code: '+95', country: 'Myanmar' },
        { code: '+264', country: 'Namibia' },
        { code: '+674', country: 'Nauru' },
        { code: '+977', country: 'Nepal' },
        { code: '+31', country: 'Netherlands' },
        { code: '+64', country: 'New Zealand' },
        { code: '+505', country: 'Nicaragua' },
        { code: '+227', country: 'Niger' },
        { code: '+234', country: 'Nigeria' },
        { code: '+389', country: 'North Macedonia' },
        { code: '+47', country: 'Norway' },
        { code: '+968', country: 'Oman' },
        { code: '+92', country: 'Pakistan' },
        { code: '+680', country: 'Palau' },
        { code: '+970', country: 'Palestine' },
        { code: '+507', country: 'Panama' },
        { code: '+675', country: 'Papua New Guinea' },
        { code: '+595', country: 'Paraguay' },
        { code: '+51', country: 'Peru' },
        { code: '+63', country: 'Philippines' },
        { code: '+48', country: 'Poland' },
        { code: '+351', country: 'Portugal' },
        { code: '+974', country: 'Qatar' },
        { code: '+40', country: 'Romania' },
        { code: '+7', country: 'Russia' },
        { code: '+250', country: 'Rwanda' },
        { code: '+290', country: 'Saint Helena' },
        { code: '+1', country: 'Saint Kitts and Nevis' },
        { code: '+1', country: 'Saint Lucia' },
        { code: '+1', country: 'Saint Vincent and the Grenadines' },
        { code: '+685', country: 'Samoa' },
        { code: '+378', country: 'San Marino' },
        { code: '+239', country: 'São Tomé and Príncipe' },
        { code: '+966', country: 'Saudi Arabia' },
        { code: '+221', country: 'Senegal' },
        { code: '+381', country: 'Serbia' },
        { code: '+248', country: 'Seychelles' },
        { code: '+232', country: 'Sierra Leone' },
        { code: '+65', country: 'Singapore' },
        { code: '+421', country: 'Slovakia' },
        { code: '+386', country: 'Slovenia' },
        { code: '+677', country: 'Solomon Islands' },
        { code: '+252', country: 'Somalia' },
        { code: '+27', country: 'South Africa' },
        { code: '+82', country: 'South Korea' },
        { code: '+211', country: 'South Sudan' },
        { code: '+34', country: 'Spain' },
        { code: '+94', country: 'Sri Lanka' },
        { code: '+249', country: 'Sudan' },
        { code: '+597', country: 'Suriname' },
        { code: '+46', country: 'Sweden' },
        { code: '+41', country: 'Switzerland' },
        { code: '+963', country: 'Syria' },
        { code: '+886', country: 'Taiwan' },
        { code: '+992', country: 'Tajikistan' },
        { code: '+255', country: 'Tanzania' },
        { code: '+66', country: 'Thailand' },
        { code: '+670', country: 'Timor-Leste' },
        { code: '+228', country: 'Togo' },
        { code: '+690', country: 'Tokelau' },
        { code: '+676', country: 'Tonga' },
        { code: '+1', country: 'Trinidad and Tobago' },
        { code: '+216', country: 'Tunisia' },
        { code: '+90', country: 'Turkey' },
        { code: '+993', country: 'Turkmenistan' },
        { code: '+688', country: 'Tuvalu' },
        { code: '+256', country: 'Uganda' },
        { code: '+380', country: 'Ukraine' },
        { code: '+971', country: 'United Arab Emirates' },
        { code: '+44', country: 'United Kingdom' },
        { code: '+1', country: 'United States' },
        { code: '+598', country: 'Uruguay' },
        { code: '+998', country: 'Uzbekistan' },
        { code: '+678', country: 'Vanuatu' },
        { code: '+379', country: 'Vatican City' },
        { code: '+58', country: 'Venezuela' },
        { code: '+84', country: 'Vietnam' },
        { code: '+681', country: 'Wallis and Futuna' },
        { code: '+967', country: 'Yemen' },
        { code: '+260', country: 'Zambia' },
        { code: '+263', country: 'Zimbabwe' }
    ];
    
    res.json(countryCodes);
});

// ========== ADMIN AUTHENTICATION ==========
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    // Simple authentication - in production, use proper authentication
    if (username === 'admin' && password === 'admin123') {
        res.json({ 
            success: true, 
            message: 'Login successful' 
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: 'Invalid credentials' 
        });
    }
});

// ========== ADMIN: GET SINGLE APPLICATION ==========
app.get('/api/admin/application/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ 
                success: false, 
                error: 'Application not found' 
            });
        }
        
        res.json({ 
            success: true, 
            application: {
                applicationId: application.applicationId,
                personalInfo: application.personalInfo,
                jobPreferences: application.jobPreferences,
                status: application.status,
                uploadCount: application.uploadCount,
                uploadedFiles: application.uploadedFiles,
                documentReviews: application.documentReviews,
                comments: application.comments,
                jobOffer: application.jobOffer,
                contract: application.contract,
                createdAt: application.createdAt,
                updatedAt: application.updatedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Admin fetch error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch application' 
        });
    }
});

// ========== ADMIN: ADD COMMENT ==========
app.post('/api/admin/application/:email/comment', async (req, res) => {
    try {
        const { email } = req.params;
        const { comment } = req.body;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        if (!application.comments) application.comments = [];
        
        application.comments.push({
            text: comment,
            timestamp: new Date(),
            admin: 'Admin'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        res.json({ 
            success: true, 
            message: 'Comment added successfully' 
        });
        
    } catch (error) {
        console.error('❌ Comment error:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// ========== ADMIN: DOCUMENT REVIEW ==========
app.post('/api/admin/application/:email/document/review', async (req, res) => {
    try {
        const { email } = req.params;
        const { documentType, status, comments } = req.body;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Initialize documentReviews if it doesn't exist
        if (!application.documentReviews) application.documentReviews = new Map();
        
        // Update document review
        application.documentReviews.set(documentType, {
            status: status,
            comments: comments || null,
            reviewedAt: new Date(),
            reviewedBy: 'Admin'
        });
        
        // Add comment about review
        if (!application.comments) application.comments = [];
        application.comments.push({
            text: `📄 Document ${documentType} ${status}: ${comments || 'No comments'}`,
            timestamp: new Date(),
            admin: 'Admin'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        res.json({ 
            success: true, 
            message: `Document ${status} successfully` 
        });
        
    } catch (error) {
        console.error('❌ Document review error:', error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

// ========== ADMIN: REQUEST RE-UPLOAD ==========
app.post('/api/admin/application/:email/request-reupload', async (req, res) => {
    try {
        const { email } = req.params;
        const { documents, message } = req.body;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Update status
        application.status = 'reupload-requested';
        
        // Add comment
        if (!application.comments) application.comments = [];
        application.comments.push({
            text: `📤 Re-upload requested for: ${documents.join(', ')}. Message: ${message}`,
            timestamp: new Date(),
            admin: 'Admin'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        res.json({ 
            success: true, 
            message: 'Re-upload requested successfully' 
        });
        
    } catch (error) {
        console.error('❌ Reupload request error:', error);
        res.status(500).json({ error: 'Failed to request re-upload' });
    }
});

// ========== ADMIN: UPDATE JOB OFFER STATUS ==========
app.post('/api/admin/application/:email/job-offer/status', async (req, res) => {
    try {
        const { email } = req.params;
        const { status } = req.body;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        if (!application.jobOffer) {
            return res.status(400).json({ error: 'No job offer found' });
        }
        
        application.jobOffer.status = status;
        
        if (!application.comments) application.comments = [];
        application.comments.push({
            text: `📄 Job offer status updated to: ${status}`,
            timestamp: new Date(),
            admin: 'Admin'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        res.json({ 
            success: true, 
            message: 'Job offer status updated' 
        });
        
    } catch (error) {
        console.error('❌ Job offer update error:', error);
        res.status(500).json({ error: 'Failed to update job offer status' });
    }
});

// ========== ADMIN: UPDATE CONTRACT STATUS ==========
app.post('/api/admin/application/:email/contract/status', async (req, res) => {
    try {
        const { email } = req.params;
        const { status } = req.body;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        if (!application.contract) {
            return res.status(400).json({ error: 'No contract found' });
        }
        
        application.contract.status = status;
        
        if (!application.comments) application.comments = [];
        application.comments.push({
            text: `📝 Contract status updated to: ${status}`,
            timestamp: new Date(),
            admin: 'Admin'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        res.json({ 
            success: true, 
            message: 'Contract status updated' 
        });
        
    } catch (error) {
        console.error('❌ Contract update error:', error);
        res.status(500).json({ error: 'Failed to update contract status' });
    }
});

// ========== ADMIN: DELETE APPLICATION ==========
app.delete('/api/admin/application/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Delete uploaded files from disk
        const clientFolder = path.join(uploadPath, email);
        if (fs.existsSync(clientFolder)) {
            fs.rmSync(clientFolder, { recursive: true, force: true });
        }
        
        // Delete from database
        await Application.deleteOne({ 'personalInfo.email': email });
        
        res.json({ 
            success: true, 
            message: 'Application deleted successfully' 
        });
        
    } catch (error) {
        console.error('❌ Delete error:', error);
        res.status(500).json({ error: 'Failed to delete application' });
    }
});

// ========== ADMIN FILE ACCESS ==========
app.get('/api/admin/files/:email/:filename', (req, res) => {
    try {
        const { email, filename } = req.params;
        const filePath = path.join(uploadPath, email, filename);
        
        // Security check - prevent directory traversal
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(path.resolve(uploadPath))) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('File access error:', error);
        res.status(500).json({ error: 'Failed to retrieve file' });
    }
});

// ========== EXPORT APPLICATIONS TO EXCEL ==========
app.get('/api/admin/export/applications', async (req, res) => {
    try {
        const Application = require('./models/Application');
        const applications = await Application.find().sort({ createdAt: -1 });
        
        // Create CSV content
        let csv = 'Date,Name,Email,Phone,Country,Visa Type,Preferred Country,Preferred Job,Status,Upload Count\n';
        
        applications.forEach(app => {
            const date = new Date(app.createdAt).toLocaleDateString();
            const name = app.personalInfo?.fullName || 'N/A';
            const email = app.personalInfo?.email || 'N/A';
            const phone = app.personalInfo?.phone || 'N/A';
            const country = app.personalInfo?.country || 'N/A';
            const visaType = app.personalInfo?.visaType || 'N/A';
            const prefCountry = app.jobPreferences?.preferredCountry || 'N/A';
            const prefJob = app.jobPreferences?.preferredJob || 'N/A';
            const status = app.status || 'N/A';
            const uploadCount = app.uploadCount || 1;
            
            // Escape commas in fields
            csv += `"${date}","${name}","${email}","${phone}","${country}","${visaType}","${prefCountry}","${prefJob}","${status}","${uploadCount}"\n`;
        });
        
        // Set response headers for Excel download
        res.setHeader('Content-Type', 'application/vnd.ms-excel');
        res.setHeader('Content-Disposition', `attachment; filename="apex_applications_${new Date().toISOString().split('T')[0]}.csv"`);
        
        res.send(csv);
        
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export applications' });
    }
});

// ========== APPLICATION SUBMISSION ENDPOINT ==========
app.post('/api/application/upload', async (req, res) => {
    try {
        const formData = req.body;
        
        console.log('📝 New application received for:', formData.email);
        
        // Validate required fields
        const requiredFields = ['fullName', 'email', 'phone', 'age', 'gender', 'maritalStatus', 'country', 'visaType', 'preferredCountry', 'preferredJob'];
        for (const field of requiredFields) {
            if (!formData[field]) {
                return res.status(400).json({ 
                    success: false, 
                    error: `Missing required field: ${field}` 
                });
            }
        }
        
        // Check if email already exists
        const Application = require('./models/Application');
        const existingApp = await Application.findOne({ 'personalInfo.email': formData.email });
        if (existingApp) {
            return res.status(400).json({
                success: false,
                error: 'An application with this email already exists'
            });
        }
        
        // Generate Application ID
        const applicationId = generateApplicationId();
        
        // Create new application
        const application = new Application({
            applicationId: applicationId,
            personalInfo: {
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                age: parseInt(formData.age),
                gender: formData.gender,
                maritalStatus: formData.maritalStatus,
                country: formData.country,
                visaType: formData.visaType
            },
            jobPreferences: {
                preferredCountry: formData.preferredCountry,
                preferredJob: formData.preferredJob,
                additionalInfo: formData.additionalInfo || ''
            },
            status: 'received',
            uploadCount: 1,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        await application.save();
        
        // Send confirmation email
        await sendConfirmationEmail(application);
        
        console.log(`✅ Application #${applicationId} received from ${formData.email}`);
        
        res.json({ 
            success: true, 
            message: 'Application submitted successfully',
            applicationId: applicationId,
            email: formData.email
        });
        
    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server error processing application' 
        });
    }
});

// ========== APPLICATION STATUS ENDPOINT ==========
app.get('/api/application/status/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        console.log(`📊 Checking status for: ${email}`);
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ 
                success: false, 
                error: 'Application not found' 
            });
        }
        
        res.json({ 
            success: true, 
            application: {
                applicationId: application.applicationId,
                personalInfo: application.personalInfo,
                jobPreferences: application.jobPreferences,
                status: application.status,
                uploadCount: application.uploadCount,
                createdAt: application.createdAt,
                updatedAt: application.updatedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Status error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to check status' 
        });
    }
});

// ========== ADMIN: GET ALL APPLICATIONS ==========
app.get('/api/admin/applications', async (req, res) => {
    try {
        const Application = require('./models/Application');
        const applications = await Application.find().sort({ createdAt: -1 });
        
        res.json({ 
            success: true, 
            applications: applications.map(app => ({
                applicationId: app.applicationId,
                personalInfo: app.personalInfo,
                jobPreferences: app.jobPreferences,
                status: app.status,
                uploadCount: app.uploadCount,
                createdAt: app.createdAt,
                updatedAt: app.updatedAt
            }))
        });
        
    } catch (error) {
        console.error('❌ Admin fetch error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch applications' 
        });
    }
});

// ========== ADMIN: UPDATE APPLICATION STATUS ==========
app.post('/api/admin/application/:email/status', async (req, res) => {
    try {
        const { email } = req.params;
        const { status } = req.body;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        application.status = status;
        application.updatedAt = new Date();
        await application.save();
        
        res.json({ 
            success: true, 
            message: 'Status updated successfully' 
        });
        
    } catch (error) {
        console.error('❌ Status update error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ========== ADMIN: SYNC DOCUMENT STATUSES ==========
app.post('/api/admin/application/:email/sync-document-statuses', async (req, res) => {
    try {
        const { email } = req.params;
        
        const Application = require('./models/Application');
        const application = await Application.findOne({ 'personalInfo.email': email });
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Initialize documentReviews if needed
        if (!application.documentReviews) {
            application.documentReviews = new Map();
        }
        
        let syncCount = 0;
        
        // Sync logic - ensure all documents have a review status
        const documentTypes = ['passport', 'photo', 'cv', 'coverLetter', 'qualifications', 'experience'];
        
        documentTypes.forEach(docType => {
            if (!application.documentReviews.has(docType)) {
                application.documentReviews.set(docType, {
                    status: 'pending',
                    reviewedAt: new Date(),
                    reviewedBy: 'System'
                });
                syncCount++;
            }
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        res.json({ 
            success: true, 
            message: `Synced ${syncCount} document statuses` 
        });
        
    } catch (error) {
        console.error('❌ Sync error:', error);
        res.status(500).json({ error: 'Failed to sync document statuses' });
    }
});

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
  console.log('⚡ File upload limit: 50MB (increased for mobile photos)');
  console.log('===========================================\n');
  console.log('✅ NEW FEATURES ENABLED:');
  console.log('   - Auto-generated Application IDs');
  console.log('   - Confirmation Emails');
  console.log('   - Dynamic Country Codes API');
  console.log('   - Admin Dashboard Integration');
  console.log('   - Full Admin API Routes');
  console.log('   - File Access for Admin');
  console.log('   - Export to Excel');
  console.log('===========================================\n');
});