const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const Application = require('../models/Application');
const mongoose = require('mongoose');

// Configure multer for file uploads (reuse the same config)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const { email } = req.params;
        const clientFolder = path.join(__dirname, '../uploads', email);
        if (!fs.existsSync(clientFolder)) {
            fs.mkdirSync(clientFolder, { recursive: true });
        }
        cb(null, clientFolder);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        // Add prefix to identify document types
        let prefix = '';
        
        if (file.fieldname === 'edited_cv') prefix = 'edited_cv_';
        else if (file.fieldname === 'edited_cover') prefix = 'edited_cover_';
        else if (file.fieldname === 'jobOffer') prefix = 'job_offer_';
        else if (file.fieldname === 'contract') prefix = 'contract_';
        else prefix = 'document_';
        
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `${prefix}${timestamp}_${sanitizedName}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for mobile photos
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|jpg|jpeg|png|doc|docx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only PDF, Images, and Word documents are allowed'));
        }
    }
});

// Simple admin authentication
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'apex2024';

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

// Admin login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// ============================================
// DEBUG ENDPOINT
// ============================================
router.get('/debug/files/:email', (req, res) => {
    try {
        const { email } = req.params;
        const uploadsDir = path.join(__dirname, '../uploads');
        const userFolder = path.join(uploadsDir, email);
        
        console.log(`🔍 Debug: Checking files for ${email}`);
        
        if (!fs.existsSync(userFolder)) {
            // Try to find similar user
            const users = fs.readdirSync(uploadsDir).filter(f => {
                return fs.statSync(path.join(uploadsDir, f)).isDirectory();
            });
            
            const similarUser = users.find(user => 
                user.toLowerCase().includes(email.toLowerCase()) ||
                email.toLowerCase().includes(user.toLowerCase())
            );
            
            if (similarUser) {
                const similarFolder = path.join(uploadsDir, similarUser);
                const files = fs.readdirSync(similarFolder).filter(f => f !== 'metadata.json');
                
                return res.json({
                    success: true,
                    requestedEmail: email,
                    foundSimilarUser: similarUser,
                    files: files,
                    fileUrls: files.map(f => ({
                        filename: f,
                        url: `/api/admin/files/${similarUser}/${f}`
                    }))
                });
            }
            
            return res.json({
                success: false,
                error: 'User folder not found',
                requestedEmail: email,
                availableUsers: users
            });
        }
        
        const files = fs.readdirSync(userFolder).filter(f => f !== 'metadata.json');
        
        res.json({
            success: true,
            email: email,
            folder: userFolder,
            files: files,
            fileUrls: files.map(f => ({
                filename: f,
                url: `/api/admin/files/${email}/${f}`
            }))
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// APPLICATION MANAGEMENT ENDPOINTS
// ============================================

// Get all applications (with MongoDB)
router.get('/applications', async (req, res) => {
    try {
        console.log('📊 Fetching all applications from MongoDB');
        
        const applications = await Application.find({ mode: 'application' })
            .sort({ createdAt: -1 })
            .maxTimeMS(5000);
        
        const formattedApps = applications.map(app => {
            // Convert documentStatus to object
            const documentStatus = {};
            if (app.documentStatus) {
                for (const [key, value] of app.documentStatus.entries()) {
                    documentStatus[key] = value;
                }
            }
            
            return {
                personalInfo: app.personalInfo,
                jobPreferences: app.jobPreferences || {
                    preferredCountry: 'Not specified',
                    preferredJob: 'Not specified'
                },
                status: app.status,
                uploadCount: app.uploadCount,
                documentStatus: documentStatus,
                jobOffer: app.jobOffer,
                contract: app.contract,
                createdAt: app.createdAt,
                updatedAt: app.updatedAt,
                type: 'application',
                serviceType: 'application',
                email: app.personalInfo?.email,
                jobOfferStatus: app.jobOffer?.status || 'pending',
                contractStatus: app.contract?.status || 'pending',
                jobOfferFile: app.jobOffer?.file || null,
                contractFile: app.contract?.file || null
            };
        });
        
        console.log(`✅ Found ${formattedApps.length} applications`);
        
        res.json({ 
            success: true, 
            applications: formattedApps 
        });
    } catch (error) {
        console.error('❌ Error fetching applications:', error);
        
        // Fallback to file system if MongoDB fails
        try {
            console.log('⚠️ Falling back to file system for applications');
            const uploadsDir = path.join(__dirname, '../uploads');
            
            if (!fs.existsSync(uploadsDir)) {
                return res.json({ success: true, applications: [] });
            }
            
            const clients = fs.readdirSync(uploadsDir).filter(file => {
                const filePath = path.join(uploadsDir, file);
                return fs.statSync(filePath).isDirectory();
            });

            const fileApplications = [];

            clients.forEach(client => {
                const metadataPath = path.join(uploadsDir, client, 'metadata.json');
                if (fs.existsSync(metadataPath)) {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    fileApplications.push({
                        email: client,
                        ...metadata,
                        folder: client
                    });
                }
            });

            fileApplications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            res.json({ success: true, applications: fileApplications, fallback: true });
        } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError);
            res.status(500).json({ error: 'Failed to fetch applications' });
        }
    }
});

// Get single application details
router.get('/application/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        console.log(`📋 Fetching application for admin: ${email}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            // Fallback to file system
            console.log('⚠️ Application not found in MongoDB, checking file system');
            const clientFolder = path.join(__dirname, '../uploads', email);
            const metadataPath = path.join(clientFolder, 'metadata.json');

            if (fs.existsSync(metadataPath)) {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                
                const files = fs.readdirSync(clientFolder).filter(file => 
                    file !== 'metadata.json' && !file.startsWith('.')
                );

                return res.json({ 
                    success: true, 
                    application: {
                        ...metadata,
                        files: files.map(file => ({
                            name: file,
                            path: `/api/admin/files/${email}/${file}`,
                            size: fs.statSync(path.join(clientFolder, file)).size
                        }))
                    },
                    fallback: true
                });
            } else {
                return res.status(404).json({ 
                    success: false,
                    error: 'Application not found' 
                });
            }
        }
        
        // Convert Maps to objects for client
        const documentReviews = {};
        if (application.documentReviews) {
            for (const [key, value] of application.documentReviews.entries()) {
                documentReviews[key] = value;
            }
        }
        
        const documentStatus = {};
        if (application.documentStatus) {
            for (const [key, value] of application.documentStatus.entries()) {
                documentStatus[key] = value;
            }
        }
        
        const documentRejectionCount = {};
        if (application.documentRejectionCount) {
            for (const [key, value] of application.documentRejectionCount.entries()) {
                documentRejectionCount[key] = value;
            }
        }
        
        // Get files from disk
        const clientFolder = path.join(__dirname, '../uploads', email);
        let files = [];
        if (fs.existsSync(clientFolder)) {
            files = fs.readdirSync(clientFolder)
                .filter(file => file !== 'metadata.json' && !file.startsWith('.'))
                .map(file => ({
                    name: file,
                    path: `/api/admin/files/${email}/${file}`,
                    size: fs.statSync(path.join(clientFolder, file)).size,
                    modified: fs.statSync(path.join(clientFolder, file)).mtime
                }));
        }
        
        console.log(`✅ Found application for admin: ${email}`);
        
        res.json({
            success: true,
            application: {
                personalInfo: application.personalInfo,
                jobPreferences: application.jobPreferences || {
                    preferredCountry: 'Not specified',
                    preferredJob: 'Not specified',
                    additionalInfo: ''
                },
                status: application.status,
                uploadCount: application.uploadCount,
                uploadedFiles: application.uploadedFiles,
                documentReviews: documentReviews,
                documentStatus: documentStatus,
                documentRejectionCount: documentRejectionCount,
                jobOffer: application.jobOffer,
                contract: application.contract,
                comments: application.comments,
                reuploadRequests: application.reuploadRequests,
                createdAt: application.createdAt,
                updatedAt: application.updatedAt,
                files: files
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching application:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch application' 
        });
    }
});

// ============================================
// FILE SERVING ENDPOINTS
// ============================================

// Download/View file with email normalization to handle typos
router.get('/files/:email/:filename', (req, res) => {
    try {
        let { email, filename } = req.params;
        
        // Normalize email - trim and lowercase
        email = email.trim().toLowerCase();
        
        console.log(`📁 File request: /files/${email}/${filename}`);
        
        // Construct paths
        const uploadsDir = path.join(__dirname, '../uploads');
        const exactPath = path.join(uploadsDir, email, filename);
        
        console.log(`📁 Checking exact path: ${exactPath}`);
        
        // First try exact match
        if (fs.existsSync(exactPath)) {
            console.log(`✅ File found at exact path`);
            
            // Set proper content type based on file extension
            const ext = path.extname(filename).toLowerCase();
            const contentTypes = {
                '.pdf': 'application/pdf',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.txt': 'text/plain'
            };
            
            if (contentTypes[ext]) {
                res.setHeader('Content-Type', contentTypes[ext]);
            }
            
            // For images and PDF, display inline; for others, prompt download
            if (['.jpg', '.jpeg', '.png', '.gif', '.pdf'].includes(ext)) {
                res.setHeader('Content-Disposition', 'inline');
            } else {
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            }
            
            return res.sendFile(exactPath);
        }
        
        // If exact match fails, check if the uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            console.error(`❌ Uploads directory not found: ${uploadsDir}`);
            return res.status(404).json({ error: 'Uploads directory not found' });
        }
        
        // Check if the exact email folder exists
        const exactFolder = path.join(uploadsDir, email);
        if (!fs.existsSync(exactFolder)) {
            console.log(`❌ Exact folder not found for: ${email}`);
            
            // Get all available users
            const users = fs.readdirSync(uploadsDir).filter(f => {
                const filePath = path.join(uploadsDir, f);
                return fs.statSync(filePath).isDirectory();
            });
            
            console.log(`📁 Available users:`, users);
            
            // Try to find a close match (case-insensitive, ignore special characters)
            const similarUser = users.find(user => 
                user.toLowerCase() === email.toLowerCase() ||
                user.replace(/[._-]/g, '').toLowerCase() === email.replace(/[._-]/g, '').toLowerCase() ||
                user.split('@')[0].toLowerCase() === email.split('@')[0].toLowerCase()
            );
            
            if (similarUser) {
                console.log(`✅ Found similar user: ${similarUser}`);
                const similarPath = path.join(uploadsDir, similarUser, filename);
                
                if (fs.existsSync(similarPath)) {
                    console.log(`✅ File found in similar user folder`);
                    
                    // Set proper content type based on file extension
                    const ext = path.extname(filename).toLowerCase();
                    const contentTypes = {
                        '.pdf': 'application/pdf',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                        '.gif': 'image/gif',
                        '.doc': 'application/msword',
                        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        '.txt': 'text/plain'
                    };
                    
                    if (contentTypes[ext]) {
                        res.setHeader('Content-Type', contentTypes[ext]);
                    }
                    
                    // For images and PDF, display inline; for others, prompt download
                    if (['.jpg', '.jpeg', '.png', '.gif', '.pdf'].includes(ext)) {
                        res.setHeader('Content-Disposition', 'inline');
                    } else {
                        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
                    }
                    
                    return res.sendFile(similarPath);
                } else {
                    console.log(`❌ File not found in similar user folder`);
                    // List files in similar user folder
                    const similarFolder = path.join(uploadsDir, similarUser);
                    const files = fs.readdirSync(similarFolder).filter(f => f !== 'metadata.json');
                    console.log(`📁 Files in ${similarUser}:`, files);
                    
                    return res.status(404).json({ 
                        error: 'File not found',
                        requested: filename,
                        similarUser: similarUser,
                        availableFiles: files
                    });
                }
            }
            
            return res.status(404).json({ 
                error: 'User folder not found',
                requestedEmail: email,
                availableUsers: users
            });
        }
        
        // If we get here, folder exists but file doesn't
        const files = fs.readdirSync(exactFolder).filter(f => f !== 'metadata.json');
        console.log(`📁 Files in ${email}:`, files);
        
        res.status(404).json({ 
            error: 'File not found',
            requested: filename,
            availableFiles: files
        });
        
    } catch (error) {
        console.error('❌ Error serving file:', error);
        res.status(500).json({ error: 'Failed to retrieve file', details: error.message });
    }
});

// ============================================
// EXCEL EXPORT ENDPOINT - NEW
// ============================================

router.get('/export/applications', async (req, res) => {
    try {
        console.log('📊 Exporting applications to Excel');
        
        // Fetch all applications from MongoDB
        const applications = await Application.find({ mode: 'application' })
            .sort({ createdAt: -1 })
            .maxTimeMS(5000);
        
        // Create a new workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Apex Global Careers';
        workbook.created = new Date();
        
        // Add worksheet
        const worksheet = workbook.addWorksheet('Applications', {
            properties: { tabColor: { argb: 'FF2C3E50' } },
            views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
        });
        
        // Define columns
        worksheet.columns = [
            { header: 'Submission Date', key: 'date', width: 15 },
            { header: 'Full Name', key: 'fullName', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Age', key: 'age', width: 8 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Marital Status', key: 'maritalStatus', width: 15 },
            { header: 'Country of Residence', key: 'country', width: 20 },
            { header: 'Visa Type', key: 'visaType', width: 20 },
            { header: 'Preferred Country', key: 'preferredCountry', width: 20 },
            { header: 'Preferred Job', key: 'preferredJob', width: 20 },
            { header: 'Additional Info', key: 'additionalInfo', width: 30 },
            { header: 'Application Status', key: 'status', width: 18 },
            { header: 'Upload Attempts', key: 'uploadCount', width: 12 },
            { header: 'Documents', key: 'documents', width: 25 },
            { header: 'Job Offer Status', key: 'jobOfferStatus', width: 15 },
            { header: 'Contract Status', key: 'contractStatus', width: 15 },
            { header: 'Payment Status', key: 'paymentStatus', width: 15 }
        ];
        
        // Style the header row
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2C3E50' }
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
        
        // Add data rows
        applications.forEach(app => {
            const personalInfo = app.personalInfo || {};
            const jobPrefs = app.jobPreferences || {};
            
            // Count documents
            const docCount = app.uploadedFiles ? Object.keys(app.uploadedFiles).length : 0;
            const docTypes = app.uploadedFiles ? Object.keys(app.uploadedFiles).join(', ') : 'None';
            
            worksheet.addRow({
                date: app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'N/A',
                fullName: personalInfo.fullName || 'N/A',
                email: personalInfo.email || 'N/A',
                phone: personalInfo.phone || 'N/A',
                age: personalInfo.age || 'N/A',
                gender: formatGenderForExport(personalInfo.gender),
                maritalStatus: formatMaritalStatusForExport(personalInfo.maritalStatus),
                country: personalInfo.country || 'N/A',
                visaType: personalInfo.visaType || 'N/A',
                preferredCountry: jobPrefs.preferredCountry || 'Not specified',
                preferredJob: jobPrefs.preferredJob || 'Not specified',
                additionalInfo: jobPrefs.additionalInfo || '',
                status: formatStatusForExport(app.status),
                uploadCount: app.uploadCount || 1,
                documents: `${docCount} files (${docTypes})`,
                jobOfferStatus: app.jobOffer?.status || 'pending',
                contractStatus: app.contract?.status || 'pending',
                paymentStatus: app.paymentStatus || 'pending'
            });
        });
        
        // Style data rows - alternate row colors
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);
            row.alignment = { vertical: 'middle' };
            
            // Alternate row colors
            if (i % 2 === 0) {
                row.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF2F2F2' }
                };
            }
            
            // Color-code status cells
            const statusCell = row.getCell(13); // Application Status column
            const status = statusCell.value;
            
            if (status === 'Approved' || status === 'Complete') {
                statusCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD4EDDA' }
                };
            } else if (status === 'Re-upload Needed' || status === 'Changes Required') {
                statusCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF8D7DA' }
                };
            } else if (status === 'Under Review') {
                statusCell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFCCE5FF' }
                };
            }
        }
        
        // Add borders to all cells
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });
        
        // Generate filename with current date
        const date = new Date().toISOString().split('T')[0];
        const filename = `apex_applications_${date}.xlsx`;
        
        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Write to response
        await workbook.xlsx.write(res);
        res.end();
        
        console.log(`✅ Excel export completed: ${applications.length} applications`);
        
    } catch (error) {
        console.error('❌ Error exporting applications:', error);
        
        // Fallback to file system if MongoDB fails
        try {
            console.log('⚠️ Falling back to file system for export');
            const uploadsDir = path.join(__dirname, '../uploads');
            
            if (!fs.existsSync(uploadsDir)) {
                return res.status(404).json({ error: 'No applications found' });
            }
            
            const clients = fs.readdirSync(uploadsDir).filter(file => {
                const filePath = path.join(uploadsDir, file);
                return fs.statSync(filePath).isDirectory();
            });

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Applications');
            
            worksheet.columns = [
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Submission Date', key: 'date', width: 15 }
            ];
            
            worksheet.getRow(1).font = { bold: true };
            
            clients.forEach(client => {
                const metadataPath = path.join(uploadsDir, client, 'metadata.json');
                if (fs.existsSync(metadataPath)) {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    worksheet.addRow({
                        email: client,
                        status: metadata.status || 'unknown',
                        date: metadata.createdAt ? new Date(metadata.createdAt).toLocaleDateString() : 'N/A'
                    });
                }
            });
            
            const filename = `apex_applications_fallback_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            await workbook.xlsx.write(res);
            res.end();
            
        } catch (fallbackError) {
            console.error('❌ Fallback export failed:', fallbackError);
            res.status(500).json({ error: 'Failed to export applications' });
        }
    }
});

// Export filtered applications
router.post('/export/filtered', async (req, res) => {
    try {
        const { filter, searchTerm } = req.body;
        console.log(`📊 Exporting filtered applications: ${filter}`);
        
        // Build query based on filter
        let query = { mode: 'application' };
        
        if (filter === 'pending') {
            query.status = { $in: ['received', 'reupload-requested'] };
        } else if (filter === 'review') {
            query.status = 'review';
        } else if (filter === 'changes') {
            query.status = 'changes-required';
        } else if (filter === 'approved') {
            query.status = 'documents-approved';
        } else if (filter === 'processed') {
            query.status = 'processed';
        } else if (filter === 'job-offer') {
            query['jobOffer.status'] = { $in: ['uploaded', 'approved'] };
        } else if (filter === 'contract') {
            query['contract.status'] = { $in: ['uploaded', 'approved'] };
        }
        
        // Add search if provided
        if (searchTerm) {
            query.$or = [
                { 'personalInfo.fullName': { $regex: searchTerm, $options: 'i' } },
                { 'personalInfo.email': { $regex: searchTerm, $options: 'i' } }
            ];
        }
        
        const applications = await Application.find(query).sort({ createdAt: -1 }).maxTimeMS(5000);
        
        // Create workbook (same structure as above)
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Filtered Applications');
        
        worksheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Name', key: 'fullName', width: 20 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Preferred Country', key: 'preferredCountry', width: 20 },
            { header: 'Preferred Job', key: 'preferredJob', width: 20 }
        ];
        
        worksheet.getRow(1).font = { bold: true };
        
        applications.forEach(app => {
            worksheet.addRow({
                date: app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'N/A',
                fullName: app.personalInfo?.fullName || 'N/A',
                email: app.personalInfo?.email || 'N/A',
                status: formatStatusForExport(app.status),
                preferredCountry: app.jobPreferences?.preferredCountry || 'N/A',
                preferredJob: app.jobPreferences?.preferredJob || 'N/A'
            });
        });
        
        const filename = `apex_filtered_${filter}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error('❌ Error exporting filtered applications:', error);
        res.status(500).json({ error: 'Failed to export applications' });
    }
});

// ============================================
// HELPER FUNCTIONS FOR EXCEL EXPORT
// ============================================

function formatGenderForExport(gender) {
    const formats = {
        'male': 'Male',
        'female': 'Female',
        'other': 'Other',
        'prefer-not-to-say': 'Prefer not to say'
    };
    return formats[gender] || gender || 'N/A';
}

function formatMaritalStatusForExport(status) {
    const formats = {
        'single': 'Single',
        'married': 'Married',
        'divorced': 'Divorced',
        'widowed': 'Widowed',
        'other': 'Other'
    };
    return formats[status] || status || 'N/A';
}

function formatStatusForExport(status) {
    const formats = {
        'received': 'Received',
        'review': 'Under Review',
        'documents-approved': 'Approved',
        'changes-required': 'Changes Required',
        'reupload-requested': 'Re-upload Needed',
        'processed': 'Processed',
        'editing_pending': 'Editing Pending',
        'editing_in_progress': 'Editing in Progress',
        'editing_completed': 'Ready for Payment',
        'editing_paid': 'Complete',
        'payment_pending': 'Payment Pending'
    };
    return formats[status] || status || 'Pending';
}

// ============================================
// JOB OFFER AND CONTRACT UPLOAD ENDPOINTS
// ============================================

// Upload job offer letter (from client)
router.post('/upload-job-offer/:email', upload.single('jobOffer'), async (req, res) => {
    try {
        const { email } = req.params;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('✅ Job offer file received:', file.originalname);

        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            // Update MongoDB
            application.jobOffer = {
                file: {
                    filename: file.filename,
                    originalName: file.originalname,
                    path: file.path,
                    size: file.size
                },
                status: 'uploaded',
                uploadedAt: new Date()
            };

            application.comments = application.comments || [];
            application.comments.push({
                text: `📄 Job offer letter uploaded: ${file.originalname}`,
                timestamp: new Date(),
                user: 'Client',
                type: 'system'
            });

            application.updatedAt = new Date();
            await application.save();
            
            console.log(`✅ Job offer saved to MongoDB for: ${email}`);
        } else {
            // Fallback to file system
            const clientFolder = path.join(__dirname, '../uploads', email);
            const metadataPath = path.join(clientFolder, 'metadata.json');

            if (!fs.existsSync(metadataPath)) {
                return res.status(404).json({ error: 'Application not found' });
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

            metadata.jobOffer = {
                file: {
                    filename: file.filename,
                    originalName: file.originalname,
                    path: file.path,
                    size: file.size
                },
                status: 'uploaded',
                uploadedAt: new Date().toISOString()
            };

            metadata.comments = metadata.comments || [];
            metadata.comments.push({
                text: `📄 Job offer letter uploaded: ${file.originalname}`,
                timestamp: new Date().toISOString(),
                user: 'Client'
            });

            metadata.updatedAt = new Date().toISOString();
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            console.log(`✅ Job offer saved to file system for: ${email}`);
        }

        res.json({ 
            success: true, 
            message: 'Job offer uploaded successfully',
            file: {
                filename: file.filename,
                originalName: file.originalname,
                url: `/api/admin/files/${email}/${file.filename}`
            }
        });

    } catch (error) {
        console.error('❌ Error uploading job offer:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false,
                error: 'File too large. Maximum file size is 50MB.' 
            });
        }
        
        res.status(500).json({ error: 'Failed to upload job offer' });
    }
});

// Upload contract (from client)
router.post('/upload-contract/:email', upload.single('contract'), async (req, res) => {
    try {
        const { email } = req.params;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('✅ Contract file received:', file.originalname);

        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            // Update MongoDB
            application.contract = {
                file: {
                    filename: file.filename,
                    originalName: file.originalname,
                    path: file.path,
                    size: file.size
                },
                status: 'uploaded',
                uploadedAt: new Date()
            };

            application.comments = application.comments || [];
            application.comments.push({
                text: `📝 Employment contract uploaded: ${file.originalname}`,
                timestamp: new Date(),
                user: 'Client',
                type: 'system'
            });

            application.updatedAt = new Date();
            await application.save();
            
            console.log(`✅ Contract saved to MongoDB for: ${email}`);
        } else {
            // Fallback to file system
            const clientFolder = path.join(__dirname, '../uploads', email);
            const metadataPath = path.join(clientFolder, 'metadata.json');

            if (!fs.existsSync(metadataPath)) {
                return res.status(404).json({ error: 'Application not found' });
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

            metadata.contract = {
                file: {
                    filename: file.filename,
                    originalName: file.originalname,
                    path: file.path,
                    size: file.size
                },
                status: 'uploaded',
                uploadedAt: new Date().toISOString()
            };

            metadata.comments = metadata.comments || [];
            metadata.comments.push({
                text: `📝 Employment contract uploaded: ${file.originalname}`,
                timestamp: new Date().toISOString(),
                user: 'Client'
            });

            metadata.updatedAt = new Date().toISOString();
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            console.log(`✅ Contract saved to file system for: ${email}`);
        }

        res.json({ 
            success: true, 
            message: 'Contract uploaded successfully',
            file: {
                filename: file.filename,
                originalName: file.originalname,
                url: `/api/admin/files/${email}/${file.filename}`
            }
        });

    } catch (error) {
        console.error('❌ Error uploading contract:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false,
                error: 'File too large. Maximum file size is 50MB.' 
            });
        }
        
        res.status(500).json({ error: 'Failed to upload contract' });
    }
});

// Get uploaded documents status (job offer and contract)
router.get('/documents/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        // Try MongoDB first
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            return res.json({
                success: true,
                jobOffer: application.jobOffer ? {
                    originalName: application.jobOffer.file.originalName,
                    uploadedAt: application.jobOffer.uploadedAt,
                    status: application.jobOffer.status,
                    url: `/api/admin/files/${email}/${application.jobOffer.file.filename}`
                } : null,
                contract: application.contract ? {
                    originalName: application.contract.file.originalName,
                    uploadedAt: application.contract.uploadedAt,
                    status: application.contract.status,
                    url: `/api/admin/files/${email}/${application.contract.file.filename}`
                } : null
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        res.json({
            success: true,
            jobOffer: metadata.jobOffer ? {
                originalName: metadata.jobOffer.file.originalName,
                uploadedAt: metadata.jobOffer.uploadedAt,
                status: metadata.jobOffer.status,
                url: `/api/admin/files/${email}/${metadata.jobOffer.file.filename}`
            } : null,
            contract: metadata.contract ? {
                originalName: metadata.contract.file.originalName,
                uploadedAt: metadata.contract.uploadedAt,
                status: metadata.contract.status,
                url: `/api/admin/files/${email}/${metadata.contract.file.filename}`
            } : null
        });

    } catch (error) {
        console.error('❌ Error fetching documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// ============================================
// EDITING SERVICE ENDPOINTS
// ============================================

// Upload edited documents (for editing service)
router.post('/application/:email/upload-edited', upload.fields([
    { name: 'edited_cv', maxCount: 1 },
    { name: 'edited_cover', maxCount: 1 }
]), async (req, res) => {
    try {
        const { email } = req.params;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            // Initialize editedFiles if not exists
            if (!application.editedFiles) {
                application.editedFiles = {};
            }

            // Handle edited CV upload
            if (req.files && req.files.edited_cv) {
                const file = req.files.edited_cv[0];
                application.editedFiles.cv = {
                    filename: file.filename,
                    originalName: file.originalname,
                    size: file.size,
                    path: file.path,
                    uploadedAt: new Date()
                };
                
                application.comments = application.comments || [];
                application.comments.push({
                    text: `✅ Edited CV uploaded: ${file.originalname}`,
                    timestamp: new Date(),
                    admin: 'Admin',
                    type: 'system'
                });
            }

            // Handle edited Cover Letter upload
            if (req.files && req.files.edited_cover) {
                const file = req.files.edited_cover[0];
                application.editedFiles.cover = {
                    filename: file.filename,
                    originalName: file.originalname,
                    size: file.size,
                    path: file.path,
                    uploadedAt: new Date()
                };
                
                application.comments = application.comments || [];
                application.comments.push({
                    text: `✅ Edited Cover Letter uploaded: ${file.originalname}`,
                    timestamp: new Date(),
                    admin: 'Admin',
                    type: 'system'
                });
            }

            // Check if all required documents are uploaded based on service type
            const serviceType = application.serviceType;
            let allUploaded = true;

            if (serviceType === 'cv' || serviceType === 'both') {
                if (!application.editedFiles.cv) allUploaded = false;
            }
            if (serviceType === 'cover' || serviceType === 'both') {
                if (!application.editedFiles.cover) allUploaded = false;
            }

            if (allUploaded) {
                application.status = 'editing_completed';
                application.editingCompletedAt = new Date();
                
                application.comments.push({
                    text: `✅ All edited documents uploaded. Ready for client payment.`,
                    timestamp: new Date(),
                    admin: 'Admin',
                    type: 'system'
                });
            } else {
                application.status = 'editing_in_progress';
            }

            application.updatedAt = new Date();
            await application.save();

            return res.json({ 
                success: true, 
                message: 'Edited documents uploaded successfully',
                status: application.status,
                editedFiles: application.editedFiles
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        // Initialize editedFiles if not exists
        if (!metadata.editedFiles) {
            metadata.editedFiles = {};
        }

        // Handle edited CV upload
        if (req.files && req.files.edited_cv) {
            const file = req.files.edited_cv[0];
            metadata.editedFiles.cv = {
                filename: file.filename,
                originalName: file.originalname,
                size: file.size,
                path: file.path,
                uploadedAt: new Date().toISOString()
            };
            
            if (!metadata.comments) metadata.comments = [];
            metadata.comments.push({
                text: `✅ Edited CV uploaded: ${file.originalname}`,
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });
        }

        // Handle edited Cover Letter upload
        if (req.files && req.files.edited_cover) {
            const file = req.files.edited_cover[0];
            metadata.editedFiles.cover = {
                filename: file.filename,
                originalName: file.originalname,
                size: file.size,
                path: file.path,
                uploadedAt: new Date().toISOString()
            };
            
            if (!metadata.comments) metadata.comments = [];
            metadata.comments.push({
                text: `✅ Edited Cover Letter uploaded: ${file.originalname}`,
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });
        }

        // Check if all required documents are uploaded based on service type
        const serviceType = metadata.serviceType;
        let allUploaded = true;

        if (serviceType === 'cv' || serviceType === 'both') {
            if (!metadata.editedFiles.cv) allUploaded = false;
        }
        if (serviceType === 'cover' || serviceType === 'both') {
            if (!metadata.editedFiles.cover) allUploaded = false;
        }

        if (allUploaded) {
            metadata.status = 'editing_completed';
            metadata.editingCompletedAt = new Date().toISOString();
            
            metadata.comments.push({
                text: `✅ All edited documents uploaded. Ready for client payment.`,
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });
        } else {
            metadata.status = 'editing_in_progress';
        }

        metadata.updatedAt = new Date().toISOString();
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        res.json({ 
            success: true, 
            message: 'Edited documents uploaded successfully',
            status: metadata.status,
            editedFiles: metadata.editedFiles
        });

    } catch (error) {
        console.error('❌ Error uploading edited documents:', error);
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                success: false,
                error: 'File too large. Maximum file size is 50MB.' 
            });
        }
        
        res.status(500).json({ error: 'Failed to upload edited documents' });
    }
});

// Verify payment for editing service
router.post('/application/:email/verify-payment', async (req, res) => {
    try {
        const { email } = req.params;
        const { transactionId, serviceType, amount, notes } = req.body;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            if (!application.payments) {
                application.payments = [];
            }
            
            const paymentRecord = {
                transactionId: transactionId,
                serviceType: serviceType,
                amount: amount,
                verifiedAt: new Date(),
                verifiedBy: 'Admin',
                notes: notes || '',
                status: 'verified'
            };
            
            application.payments.push(paymentRecord);
            application.paymentStatus = 'paid';
            application.lastPaymentAt = new Date();
            
            if (serviceType === 'editing') {
                application.editingStatus = 'payment_verified';
                application.status = 'editing_paid';
                
                if (!application.comments) {
                    application.comments = [];
                }
                application.comments.push({
                    text: `✅ Payment verified: $${amount} for editing service. Transaction ID: ${transactionId}`,
                    timestamp: new Date(),
                    admin: 'Admin',
                    type: 'system'
                });
            }
            
            application.updatedAt = new Date();
            await application.save();
            
            return res.json({ 
                success: true, 
                message: 'Payment verified successfully',
                paymentRecord: paymentRecord,
                paymentStatus: application.paymentStatus,
                editingStatus: application.editingStatus
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            if (!metadata.payments) {
                metadata.payments = [];
            }
            
            const paymentRecord = {
                transactionId: transactionId,
                serviceType: serviceType,
                amount: amount,
                verifiedAt: new Date().toISOString(),
                verifiedBy: 'Admin',
                notes: notes || '',
                status: 'verified'
            };
            
            metadata.payments.push(paymentRecord);
            metadata.paymentStatus = 'paid';
            metadata.lastPaymentAt = new Date().toISOString();
            
            if (serviceType === 'editing') {
                metadata.editingStatus = 'payment_verified';
                metadata.status = 'editing_paid';
                
                if (!metadata.comments) {
                    metadata.comments = [];
                }
                metadata.comments.push({
                    text: `✅ Payment verified: $${amount} for editing service. Transaction ID: ${transactionId}`,
                    timestamp: new Date().toISOString(),
                    admin: 'Admin'
                });
            }
            
            metadata.updatedAt = new Date().toISOString();
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            res.json({ 
                success: true, 
                message: 'Payment verified successfully',
                paymentRecord: paymentRecord,
                paymentStatus: metadata.paymentStatus,
                editingStatus: metadata.editingStatus
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error verifying payment:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// Get payment history for an application
router.get('/application/:email/payments', async (req, res) => {
    try {
        const { email } = req.params;
        
        // Try MongoDB first
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            return res.json({ 
                success: true, 
                payments: application.payments || [],
                paymentStatus: application.paymentStatus || 'pending',
                editingStatus: application.editingStatus || 'not_requested'
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            res.json({ 
                success: true, 
                payments: metadata.payments || [],
                paymentStatus: metadata.paymentStatus || 'pending',
                editingStatus: metadata.editingStatus || 'not_requested'
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Mark editing as completed
router.post('/application/:email/complete-editing', async (req, res) => {
    try {
        const { email } = req.params;
        const { notes } = req.body;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            application.editingStatus = 'completed';
            application.status = 'editing_completed';
            application.editingCompletedAt = new Date();
            
            if (!application.comments) {
                application.comments = [];
            }
            application.comments.push({
                text: `✅ Editing completed: ${notes || 'Documents have been professionally edited.'}`,
                timestamp: new Date(),
                admin: 'Admin',
                type: 'system'
            });
            
            application.updatedAt = new Date();
            await application.save();
            
            return res.json({ 
                success: true, 
                message: 'Editing marked as completed',
                status: application.status,
                editingStatus: application.editingStatus
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            metadata.editingStatus = 'completed';
            metadata.status = 'editing_completed';
            metadata.editingCompletedAt = new Date().toISOString();
            
            if (!metadata.comments) {
                metadata.comments = [];
            }
            metadata.comments.push({
                text: `✅ Editing completed: ${notes || 'Documents have been professionally edited.'}`,
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });
            
            metadata.updatedAt = new Date().toISOString();
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            res.json({ 
                success: true, 
                message: 'Editing marked as completed',
                status: metadata.status,
                editingStatus: metadata.editingStatus
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error completing editing:', error);
        res.status(500).json({ error: 'Failed to complete editing' });
    }
});

// ============================================
// APPLICATION STATUS ENDPOINTS
// ============================================

// Update application status
router.post('/application/:email/status', async (req, res) => {
    try {
        const { email } = req.params;
        const { status, notes } = req.body;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            const validStatuses = ['received', 'review', 'documents-approved', 'changes-required', 
                                  'reupload-requested', 'processed', 'editing_pending', 
                                  'editing_in_progress', 'editing_completed', 'editing_paid'];
            
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }

            const oldStatus = application.status;
            application.status = status;
            application.updatedAt = new Date();
            
            if (notes) {
                if (!application.comments) application.comments = [];
                application.comments.push({
                    text: notes,
                    timestamp: new Date(),
                    admin: 'Admin',
                    type: 'system'
                });
            }

            if (status === 'documents-approved') {
                const requiredDocs = ['passport', 'photo', 'cv', 'qualifications'];
                const allApproved = requiredDocs.every(doc => 
                    application.documentStatus?.get(doc) === 'approved'
                );
                
                if (!allApproved) {
                    return res.status(400).json({ 
                        error: 'Cannot mark as approved - some required documents are not approved yet' 
                    });
                }

                if (application.reuploadRequests && application.reuploadRequests.length > 0) {
                    application.reuploadRequests.forEach(request => {
                        if (request.status === 'pending') {
                            request.status = 'completed';
                            request.completedAt = new Date();
                        }
                    });
                }
            }

            await application.save();
            
            return res.json({ 
                success: true, 
                message: 'Status updated successfully',
                newStatus: status,
                oldStatus: oldStatus,
                updatedAt: application.updatedAt
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            const validStatuses = ['received', 'review', 'documents-approved', 'changes-required', 
                                  'reupload-requested', 'processed', 'editing_pending', 
                                  'editing_in_progress', 'editing_completed', 'editing_paid'];
            
            if (!validStatuses.includes(status)) {
                return res.status(400).json({ error: 'Invalid status' });
            }

            metadata.status = status;
            metadata.updatedAt = new Date().toISOString();
            
            if (notes) {
                if (!metadata.comments) metadata.comments = [];
                metadata.comments.push({
                    text: notes,
                    timestamp: new Date().toISOString(),
                    admin: 'Admin'
                });
            }

            if (status === 'documents-approved') {
                const requiredDocs = ['passport', 'photo', 'cv', 'qualifications'];
                const reviews = metadata.documentReviews || {};
                const allApproved = requiredDocs.every(doc => 
                    reviews[doc]?.status === 'approved'
                );
                
                if (!allApproved) {
                    return res.status(400).json({ 
                        error: 'Cannot mark as approved - some required documents are not approved yet' 
                    });
                }

                if (metadata.reuploadRequests && metadata.reuploadRequests.length > 0) {
                    metadata.reuploadRequests.forEach(request => {
                        if (request.status === 'pending') {
                            request.status = 'completed';
                            request.completedAt = new Date().toISOString();
                        }
                    });
                }
            }

            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            res.json({ 
                success: true, 
                message: 'Status updated successfully',
                newStatus: status,
                updatedAt: metadata.updatedAt
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error updating status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ============================================
// DOCUMENT REVIEW ENDPOINTS
// ============================================

// Review individual document
router.post('/application/:email/document/review', async (req, res) => {
    try {
        const { email } = req.params;
        const { documentType, status, comments } = req.body;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            if (!application.documentReviews) application.documentReviews = new Map();
            if (!application.documentStatus) application.documentStatus = new Map();
            if (!application.documentRejectionCount) application.documentRejectionCount = new Map();
            if (!application.comments) application.comments = [];
            
            if (status === 'rejected') {
                const currentCount = application.documentRejectionCount.get(documentType) || 0;
                application.documentRejectionCount.set(documentType, currentCount + 1);
            }
            
            application.documentReviews.set(documentType, {
                status: status,
                comments: comments || '',
                reviewedAt: new Date(),
                reviewedBy: 'Admin',
                rejectionCount: application.documentRejectionCount.get(documentType) || 0
            });

            // Also update document status for client view
            application.documentStatus.set(documentType, status);

            const requiredDocs = ['passport', 'photo', 'cv', 'qualifications'];
            const reviews = application.documentReviews;
            
            const hasRejections = Array.from(reviews.values()).some(
                review => review.status === 'rejected'
            );
            
            if (hasRejections) {
                application.status = 'changes-required';
                
                const documentsNeedingReupload = Array.from(reviews.keys()).filter(
                    doc => reviews.get(doc)?.status === 'rejected'
                );
                
                if (!application.reuploadRequests) {
                    application.reuploadRequests = [];
                }
                
                if (documentsNeedingReupload.length > 0) {
                    const hasPendingRequest = application.reuploadRequests.some(
                        req => req.status === 'pending' && 
                        JSON.stringify(req.documents.sort()) === JSON.stringify(documentsNeedingReupload.sort())
                    );
                    
                    if (!hasPendingRequest) {
                        application.reuploadRequests.push({
                            documents: documentsNeedingReupload,
                            message: comments || 'Please update the following documents',
                            requestedAt: new Date(),
                            status: 'pending',
                            rejectionCount: documentsNeedingReupload.map(d => ({
                                document: d,
                                count: application.documentRejectionCount.get(d) || 1
                            }))
                        });
                    }
                }
            } else {
                const allRequiredApproved = requiredDocs.every(doc => 
                    reviews.get(doc)?.status === 'approved'
                );
                
                const optionalDocs = ['coverLetter', 'experience'];
                const optionalReviewed = optionalDocs.every(doc => {
                    const hasDoc = application.uploadedFiles && application.uploadedFiles[doc];
                    return !hasDoc || (hasDoc && reviews.get(doc)?.status === 'approved');
                });
                
                if (allRequiredApproved && optionalReviewed) {
                    application.status = 'documents-approved';
                    
                    if (application.reuploadRequests && application.reuploadRequests.length > 0) {
                        application.reuploadRequests.forEach(request => {
                            if (request.status === 'pending') {
                                request.status = 'completed';
                                request.completedAt = new Date();
                            }
                        });
                    }
                } else if (application.status !== 'changes-required') {
                    application.status = 'review';
                }
            }

            if (application.reuploadRequests && application.reuploadRequests.length > 0) {
                application.reuploadRequests = application.reuploadRequests.filter(request => {
                    if (request.status === 'pending') {
                        const stillNeeded = request.documents.some(doc => 
                            application.documentReviews.get(doc)?.status === 'rejected'
                        );
                        return stillNeeded;
                    }
                    return true;
                });
            }

            application.updatedAt = new Date();
            await application.save();
            
            const rejectedDocs = Array.from(application.documentReviews.keys()).filter(
                doc => application.documentReviews.get(doc)?.status === 'rejected'
            );
            
            return res.json({ 
                success: true, 
                message: 'Document review updated successfully',
                documentStatus: application.documentReviews.get(documentType),
                overallStatus: application.status,
                documentsNeedingReupload: rejectedDocs,
                allRejectedDocs: rejectedDocs,
                rejectionCounts: Object.fromEntries(application.documentRejectionCount)
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            if (!metadata.documentReviews) {
                metadata.documentReviews = {};
            }
            
            if (!metadata.documentRejectionCount) {
                metadata.documentRejectionCount = {};
            }
            
            if (status === 'rejected') {
                metadata.documentRejectionCount[documentType] = 
                    (metadata.documentRejectionCount[documentType] || 0) + 1;
            }
            
            metadata.documentReviews[documentType] = {
                status: status,
                comments: comments || '',
                reviewedAt: new Date().toISOString(),
                reviewedBy: 'Admin',
                rejectionCount: metadata.documentRejectionCount[documentType] || 0
            };

            const requiredDocs = ['passport', 'photo', 'cv', 'qualifications'];
            const reviews = metadata.documentReviews;
            
            const hasRejections = Object.values(reviews).some(
                review => review.status === 'rejected'
            );
            
            if (hasRejections) {
                metadata.status = 'changes-required';
                
                const documentsNeedingReupload = Object.keys(reviews).filter(
                    doc => reviews[doc]?.status === 'rejected'
                );
                
                if (!metadata.reuploadRequests) {
                    metadata.reuploadRequests = [];
                }
                
                if (documentsNeedingReupload.length > 0) {
                    const hasPendingRequest = metadata.reuploadRequests.some(
                        req => req.status === 'pending' && 
                        JSON.stringify(req.documents.sort()) === JSON.stringify(documentsNeedingReupload.sort())
                    );
                    
                    if (!hasPendingRequest) {
                        metadata.reuploadRequests.push({
                            documents: documentsNeedingReupload,
                            message: comments || 'Please update the following documents',
                            requestedAt: new Date().toISOString(),
                            status: 'pending',
                            rejectionCount: documentsNeedingReupload.map(d => ({
                                document: d,
                                count: metadata.documentRejectionCount[d] || 1
                            }))
                        });
                    }
                }
            } else {
                const allRequiredApproved = requiredDocs.every(doc => 
                    reviews[doc]?.status === 'approved'
                );
                
                const optionalDocs = ['coverLetter', 'experience'];
                const optionalReviewed = optionalDocs.every(doc => {
                    const hasDoc = metadata.uploadedFiles && metadata.uploadedFiles[doc];
                    return !hasDoc || (hasDoc && reviews[doc]?.status === 'approved');
                });
                
                if (allRequiredApproved && optionalReviewed) {
                    metadata.status = 'documents-approved';
                    
                    if (metadata.reuploadRequests && metadata.reuploadRequests.length > 0) {
                        metadata.reuploadRequests.forEach(request => {
                            if (request.status === 'pending') {
                                request.status = 'completed';
                                request.completedAt = new Date().toISOString();
                            }
                        });
                    }
                } else if (metadata.status !== 'changes-required') {
                    metadata.status = 'review';
                }
            }

            if (metadata.reuploadRequests && metadata.reuploadRequests.length > 0) {
                metadata.reuploadRequests = metadata.reuploadRequests.filter(request => {
                    if (request.status === 'pending') {
                        const stillNeeded = request.documents.some(doc => 
                            metadata.documentReviews[doc]?.status === 'rejected'
                        );
                        return stillNeeded;
                    }
                    return true;
                });
            }

            metadata.updatedAt = new Date().toISOString();
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            const rejectedDocs = Object.keys(metadata.documentReviews).filter(
                doc => metadata.documentReviews[doc]?.status === 'rejected'
            );
            
            res.json({ 
                success: true, 
                message: 'Document review updated successfully',
                documentStatus: metadata.documentReviews[documentType],
                overallStatus: metadata.status,
                documentsNeedingReupload: rejectedDocs,
                allRejectedDocs: rejectedDocs,
                rejectionCounts: metadata.documentRejectionCount
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error reviewing document:', error);
        res.status(500).json({ error: 'Failed to update document review' });
    }
});

// Add comment to application
router.post('/application/:email/comment', async (req, res) => {
    try {
        const { email } = req.params;
        const { comment } = req.body;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            if (!application.comments) {
                application.comments = [];
            }
            
            application.comments.push({
                text: comment,
                timestamp: new Date(),
                admin: 'Admin',
                type: 'admin'
            });

            application.updatedAt = new Date();
            await application.save();
            
            return res.json({ success: true, message: 'Comment added successfully' });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            if (!metadata.comments) {
                metadata.comments = [];
            }
            
            metadata.comments.push({
                text: comment,
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });

            metadata.updatedAt = new Date().toISOString();
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            res.json({ success: true, message: 'Comment added successfully' });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error adding comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// Request re-upload for specific documents
router.post('/application/:email/request-reupload', async (req, res) => {
    try {
        const { email } = req.params;
        const { documents, message } = req.body;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            const rejectedDocs = documents.filter(doc => 
                application.documentStatus?.get(doc) === 'rejected'
            );
            
            if (rejectedDocs.length === 0) {
                return res.status(400).json({ 
                    error: 'No rejected documents selected for re-upload' 
                });
            }
            
            if (!application.reuploadRequests) {
                application.reuploadRequests = [];
            }
            
            const existingRequest = application.reuploadRequests.find(
                r => r.status === 'pending' && 
                JSON.stringify(r.documents.sort()) === JSON.stringify(rejectedDocs.sort())
            );
            
            if (!existingRequest) {
                application.reuploadRequests.push({
                    documents: rejectedDocs,
                    message: message,
                    requestedAt: new Date(),
                    status: 'pending'
                });
            }
            
            application.status = 'reupload-requested';
            application.updatedAt = new Date();
            
            await application.save();
            
            return res.json({ 
                success: true, 
                message: 'Re-upload requested successfully for rejected documents',
                requestId: application.reuploadRequests.length - 1,
                documentsRequested: rejectedDocs
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            const rejectedDocs = documents.filter(doc => 
                metadata.documentReviews?.[doc]?.status === 'rejected'
            );
            
            if (rejectedDocs.length === 0) {
                return res.status(400).json({ 
                    error: 'No rejected documents selected for re-upload' 
                });
            }
            
            if (!metadata.reuploadRequests) {
                metadata.reuploadRequests = [];
            }
            
            const existingRequest = metadata.reuploadRequests.find(
                r => r.status === 'pending' && 
                JSON.stringify(r.documents.sort()) === JSON.stringify(rejectedDocs.sort())
            );
            
            if (!existingRequest) {
                metadata.reuploadRequests.push({
                    documents: rejectedDocs,
                    message: message,
                    requestedAt: new Date().toISOString(),
                    status: 'pending'
                });
            }
            
            metadata.status = 'reupload-requested';
            metadata.updatedAt = new Date().toISOString();
            
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            res.json({ 
                success: true, 
                message: 'Re-upload requested successfully for rejected documents',
                requestId: metadata.reuploadRequests.length - 1,
                documentsRequested: rejectedDocs
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error requesting re-upload:', error);
        res.status(500).json({ error: 'Failed to request re-upload' });
    }
});

// Get applications needing review
router.get('/applications/pending-review', async (req, res) => {
    try {
        // Try MongoDB first
        const applications = await Application.find({ 
            mode: 'application',
            status: { $in: ['received', 'reupload-requested', 'changes-required'] }
        })
        .sort({ createdAt: -1 })
        .maxTimeMS(5000);
        
        if (applications.length > 0) {
            const pendingReviews = applications.map(app => ({
                email: app.personalInfo?.email,
                personalInfo: app.personalInfo,
                status: app.status,
                createdAt: app.createdAt,
                uploadCount: app.uploadCount
            }));
            
            return res.json({ success: true, applications: pendingReviews });
        }
        
        // Fallback to file system
        const uploadsDir = path.join(__dirname, '../uploads');
        
        if (!fs.existsSync(uploadsDir)) {
            return res.json({ success: true, applications: [] });
        }
        
        const clients = fs.readdirSync(uploadsDir).filter(file => {
            const filePath = path.join(uploadsDir, file);
            return fs.statSync(filePath).isDirectory();
        });

        const pendingReviews = [];

        clients.forEach(client => {
            const metadataPath = path.join(uploadsDir, client, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                
                const needsReview = metadata.status === 'received' || 
                                    metadata.status === 'reupload-requested' ||
                                    metadata.status === 'changes-required';
                
                if (needsReview) {
                    pendingReviews.push({
                        email: client,
                        ...metadata,
                        folder: client
                    });
                }
            }
        });

        res.json({ success: true, applications: pendingReviews });
    } catch (error) {
        console.error('❌ Error fetching pending reviews:', error);
        res.status(500).json({ error: 'Failed to fetch pending reviews' });
    }
});

// Get document review status
router.get('/application/:email/document-reviews', async (req, res) => {
    try {
        const { email } = req.params;
        
        // Try MongoDB first
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            // Convert Maps to objects
            const documentReviews = {};
            if (application.documentReviews) {
                for (const [key, value] of application.documentReviews.entries()) {
                    documentReviews[key] = value;
                }
            }
            
            const rejectedDocs = Object.keys(documentReviews).filter(
                doc => documentReviews[doc]?.status === 'rejected'
            );
            
            // Get files from disk
            const clientFolder = path.join(__dirname, '../uploads', email);
            let files = [];
            if (fs.existsSync(clientFolder)) {
                files = fs.readdirSync(clientFolder)
                    .filter(file => file !== 'metadata.json' && !file.startsWith('.'))
                    .map(file => ({
                        name: file,
                        path: `/api/admin/files/${email}/${file}`,
                        size: fs.statSync(path.join(clientFolder, file)).size
                    }));
            }
            
            return res.json({ 
                success: true, 
                documentReviews: documentReviews,
                overallStatus: application.status,
                rejectedDocs: rejectedDocs,
                reuploadRequests: (application.reuploadRequests || []).filter(r => r.status === 'pending'),
                paymentStatus: application.paymentStatus || 'pending',
                payments: application.payments || [],
                editingStatus: application.editingStatus || 'not_requested',
                editedFiles: application.editedFiles || {},
                jobOffer: application.jobOffer || null,
                contract: application.contract || null,
                jobPreferences: application.jobPreferences || {
                    preferredCountry: 'Not specified',
                    preferredJob: 'Not specified',
                    additionalInfo: ''
                },
                files: files
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            const rejectedDocs = Object.keys(metadata.documentReviews || {}).filter(
                doc => metadata.documentReviews[doc]?.status === 'rejected'
            );
            
            // Get files from disk
            let files = [];
            if (fs.existsSync(clientFolder)) {
                files = fs.readdirSync(clientFolder)
                    .filter(file => file !== 'metadata.json' && !file.startsWith('.'))
                    .map(file => ({
                        name: file,
                        path: `/api/admin/files/${email}/${file}`,
                        size: fs.statSync(path.join(clientFolder, file)).size
                    }));
            }
            
            res.json({ 
                success: true, 
                documentReviews: metadata.documentReviews || {},
                overallStatus: metadata.status,
                rejectedDocs: rejectedDocs,
                reuploadRequests: (metadata.reuploadRequests || []).filter(r => r.status === 'pending'),
                paymentStatus: metadata.paymentStatus || 'pending',
                payments: metadata.payments || [],
                editingStatus: metadata.editingStatus || 'not_requested',
                editedFiles: metadata.editedFiles || {},
                jobOffer: metadata.jobOffer || null,
                contract: metadata.contract || null,
                jobPreferences: metadata.jobPreferences || {
                    preferredCountry: 'Not specified',
                    preferredJob: 'Not specified',
                    additionalInfo: ''
                },
                files: files
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error fetching document reviews:', error);
        res.status(500).json({ error: 'Failed to fetch document reviews' });
    }
});

// Update job preferences
router.post('/application/:email/job-preferences', async (req, res) => {
    try {
        const { email } = req.params;
        const { preferredCountry, preferredJob, additionalInfo } = req.body;
        
        // Try MongoDB first
        let application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (application) {
            if (!application.jobPreferences) {
                application.jobPreferences = {};
            }
            
            if (preferredCountry) application.jobPreferences.preferredCountry = preferredCountry;
            if (preferredJob) application.jobPreferences.preferredJob = preferredJob;
            if (additionalInfo !== undefined) application.jobPreferences.additionalInfo = additionalInfo;
            
            application.updatedAt = new Date();
            
            if (!application.comments) application.comments = [];
            application.comments.push({
                text: `✏️ Job preferences updated by admin: ${preferredCountry || ''} ${preferredJob || ''}`.trim(),
                timestamp: new Date(),
                admin: 'Admin',
                type: 'system'
            });
            
            await application.save();
            
            return res.json({ 
                success: true, 
                message: 'Job preferences updated successfully',
                jobPreferences: application.jobPreferences
            });
        }
        
        // Fallback to file system
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            if (!metadata.jobPreferences) {
                metadata.jobPreferences = {};
            }
            
            if (preferredCountry) metadata.jobPreferences.preferredCountry = preferredCountry;
            if (preferredJob) metadata.jobPreferences.preferredJob = preferredJob;
            if (additionalInfo !== undefined) metadata.jobPreferences.additionalInfo = additionalInfo;
            
            metadata.updatedAt = new Date().toISOString();
            
            if (!metadata.comments) metadata.comments = [];
            metadata.comments.push({
                text: `✏️ Job preferences updated by admin: ${preferredCountry || ''} ${preferredJob || ''}`.trim(),
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });
            
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            res.json({ 
                success: true, 
                message: 'Job preferences updated successfully',
                jobPreferences: metadata.jobPreferences
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('❌ Error updating job preferences:', error);
        res.status(500).json({ error: 'Failed to update job preferences' });
    }
});

// ============================================
// FILTER APPLICATIONS BY JOB PREFERENCES
// ============================================

router.get('/applications/filter', async (req, res) => {
    try {
        const { country, job } = req.query;
        
        // Build filter query
        const filter = { mode: 'application' };
        if (country) filter['jobPreferences.preferredCountry'] = country;
        if (job) filter['jobPreferences.preferredJob'] = job;
        
        // Try MongoDB first
        const mongoApplications = await Application.find(filter)
            .sort({ createdAt: -1 })
            .maxTimeMS(5000);
        
        if (mongoApplications.length > 0) {
            const formattedApps = mongoApplications.map(app => ({
                email: app.personalInfo?.email,
                personalInfo: app.personalInfo,
                jobPreferences: app.jobPreferences,
                status: app.status,
                createdAt: app.createdAt
            }));
            
            return res.json({ success: true, applications: formattedApps });
        }
        
        // Fallback to file system
        const uploadsDir = path.join(__dirname, '../uploads');
        
        if (!fs.existsSync(uploadsDir)) {
            return res.json({ success: true, applications: [] });
        }
        
        const clients = fs.readdirSync(uploadsDir).filter(file => {
            const filePath = path.join(uploadsDir, file);
            return fs.statSync(filePath).isDirectory();
        });

        const fileApplications = [];

        clients.forEach(client => {
            const metadataPath = path.join(uploadsDir, client, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                
                // Apply filters if provided
                let include = true;
                
                if (country && metadata.jobPreferences?.preferredCountry !== country) {
                    include = false;
                }
                
                if (job && metadata.jobPreferences?.preferredJob !== job) {
                    include = false;
                }
                
                if (include) {
                    fileApplications.push({
                        email: client,
                        ...metadata,
                        folder: client
                    });
                }
            }
        });

        fileApplications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({ success: true, applications: fileApplications });
    } catch (error) {
        console.error('❌ Error filtering applications:', error);
        res.status(500).json({ error: 'Failed to filter applications' });
    }
});

module.exports = router;