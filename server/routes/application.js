const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Application = require('../models/Application');
const mongoose = require('mongoose');

console.log('✅ Application router loaded with MongoDB');

// ============================================
// CONNECTION CHECK MIDDLEWARE
// ============================================
router.use(async (req, res, next) => {
    // Skip connection check for file serving and test endpoints
    if (req.path.includes('/files/') || req.path === '/test' || req.path === '/connection-status') {
        return next();
    }
    
    // Check MongoDB connection state
    const state = mongoose.connection.readyState;
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    if (state !== 1) {
        console.error(`❌ MongoDB ${states[state] || 'unknown'} for request: ${req.path}`);
        
        // Try to reconnect
        try {
            if (state === 0) {
                console.log('🔄 Attempting to reconnect to MongoDB...');
                await mongoose.connect(process.env.MONGODB_URI);
                console.log('✅ MongoDB reconnected successfully');
            }
        } catch (connError) {
            console.error('❌ MongoDB reconnection failed:', connError.message);
            return res.status(503).json({ 
                success: false, 
                error: 'Database connection unavailable. Please try again.',
                details: 'MongoDB connection timeout'
            });
        }
    }
    next();
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const email = req.body.email || 'temp';
        const clientFolder = path.join(__dirname, '../uploads', email);
        if (!fs.existsSync(clientFolder)) {
            fs.mkdirSync(clientFolder, { recursive: true });
        }
        cb(null, clientFolder);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        let prefix = '';
        if (file.fieldname === 'passport') prefix = 'passport_';
        else if (file.fieldname === 'photo') prefix = 'photo_';
        else if (file.fieldname === 'cv') prefix = 'cv_';
        else if (file.fieldname === 'coverLetter') prefix = 'coverLetter_';
        else if (file.fieldname === 'qualifications') prefix = 'qualifications_';
        else if (file.fieldname === 'experience') prefix = 'experience_';
        else if (file.fieldname === 'documents') prefix = 'doc_';
        else if (file.fieldname === 'jobOffer') prefix = 'job_offer_';
        else if (file.fieldname === 'contract') prefix = 'contract_';
        
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `${prefix}${timestamp}_${sanitizedName}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
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

// ============================================
// CONNECTION STATUS ENDPOINT
// ============================================
router.get('/connection-status', (req, res) => {
    const state = mongoose.connection.readyState;
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    res.json({
        success: true,
        mongodb: {
            state: states[state] || 'unknown',
            readyState: state,
            host: mongoose.connection.host || 'unknown',
            name: mongoose.connection.name || 'unknown'
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================
// TEST ENDPOINT
// ============================================
router.get('/test', (req, res) => {
    const state = mongoose.connection.readyState;
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    res.json({ 
        success: true, 
        message: 'Application API is working with MongoDB',
        mongodb: {
            state: states[state] || 'unknown',
            readyState: state
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================
// INITIAL APPLICATION UPLOAD - MONGODB VERSION
// ============================================

router.post('/upload', upload.fields([
    { name: 'passport', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'cv', maxCount: 1 },
    { name: 'coverLetter', maxCount: 1 },
    { name: 'qualifications', maxCount: 5 },
    { name: 'experience', maxCount: 5 },
    { name: 'documents', maxCount: 5 }
]), async (req, res) => {
    try {
        const { 
            fullName, email, phone, age, gender, maritalStatus, country, visaType,
            // NEW: Job preferences fields
            preferredCountry, preferredJob, additionalInfo
        } = req.body;
        
        console.log('📝 New application received for:', email);
        
        // Validate required fields
        if (!fullName || !email || !phone || !age || !gender || !maritalStatus || !country || !visaType) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields. Please provide all personal information.' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid email format' 
            });
        }

        // IMPORTANT: Reject if someone tries to use this endpoint for editing
        if (req.body.mode === 'editing') {
            return res.status(400).json({ 
                success: false,
                error: 'Editing requests should use /api/editing/request endpoint',
                correctEndpoint: '/api/editing/request'
            });
        }
        
        // Check if application already exists in MongoDB with timeout
        let existingApplication = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        let isReupload = false;
        let uploadCount = 1;
        
        if (existingApplication) {
            // Make sure this is not an editing request
            if (existingApplication.mode === 'editing') {
                return res.status(400).json({ 
                    success: false,
                    error: 'This email is registered for editing service, not visa application',
                    correctEndpoint: '/api/editing',
                    message: 'Please check your editing status at /editing page'
                });
            }
            
            isReupload = true;
            uploadCount = (existingApplication.uploadCount || 0) + 1;
            
            // Check if max uploads reached (3 times)
            if (uploadCount > 3) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Maximum upload attempts (3) reached. Please contact admin for assistance.',
                    code: 'MAX_UPLOADS_REACHED'
                });
            }
            
            // ✅ FIXED: For re-uploads, we don't require job preferences validation
            // Skip job preferences validation for existing applications
            console.log(`🔄 Re-upload detected for ${email}, skipping job preferences validation`);
        } else {
            // NEW APPLICATION: Validate job preferences
            if (!preferredCountry || !preferredJob) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Please select your preferred country and job' 
                });
            }
        }

        // Create upload directory for files
        const clientFolder = path.join(__dirname, '../uploads', email);
        await fs.promises.mkdir(clientFolder, { recursive: true });

        // Check if any files were uploaded
        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'No files uploaded. Please upload at least one document.' 
            });
        }

        // Prepare uploaded files data for MongoDB
        const uploadedFiles = {};
        const uploadHistoryEntry = {
            timestamp: new Date(),
            files: []
        };

        if (req.files) {
            const documentFields = ['passport', 'photo', 'cv', 'coverLetter', 'qualifications', 'experience', 'documents'];
            documentFields.forEach(key => {
                if (req.files[key]) {
                    uploadedFiles[key] = req.files[key].map(file => ({
                        filename: file.filename,
                        originalName: file.originalname,
                        size: file.size,
                        path: file.path,
                        uploadNumber: uploadCount,
                        uploadedAt: new Date(),
                        status: 'pending',
                        reviewComments: null
                    }));
                    uploadHistoryEntry.files.push(key);
                }
            });
        }

        if (!existingApplication) {
            // Create new application in MongoDB with all required fields including job preferences
            const newApplication = new Application({
                personalInfo: { 
                    fullName, 
                    email, 
                    phone, 
                    age: parseInt(age), 
                    gender, 
                    maritalStatus, 
                    country, 
                    visaType 
                },
                // NEW: Job preferences
                jobPreferences: {
                    preferredCountry,
                    preferredJob,
                    additionalInfo: additionalInfo || ''
                },
                uploadedFiles,
                status: 'received',
                uploadCount: uploadCount,
                uploadHistory: [uploadHistoryEntry],
                mode: 'application',
                createdAt: new Date(),
                updatedAt: new Date(),
                documentReviews: new Map(),
                documentStatus: new Map(),
                documentRejectionCount: new Map(),
                comments: [],
                reuploadRequests: []
            });

            await newApplication.save();
            console.log(`✅ New application saved to MongoDB for: ${email} (Upload #${uploadCount})`);
            console.log(`✅ Job preferences: ${preferredCountry} - ${preferredJob}`);
        } else {
            // Update existing application in MongoDB
            existingApplication.uploadedFiles = {
                ...existingApplication.uploadedFiles,
                ...uploadedFiles
            };
            existingApplication.uploadCount = uploadCount;
            existingApplication.uploadHistory.push(uploadHistoryEntry);
            existingApplication.lastUploadAt = new Date();
            existingApplication.updatedAt = new Date();
            
            // ✅ FIXED: Only update job preferences if they were provided in the re-upload form
            // This allows re-uploads without requiring job preferences
            if (preferredCountry || preferredJob || additionalInfo) {
                // Create jobPreferences object if it doesn't exist
                if (!existingApplication.jobPreferences) {
                    existingApplication.jobPreferences = {};
                }
                
                // Only update fields that were provided
                if (preferredCountry) {
                    existingApplication.jobPreferences.preferredCountry = preferredCountry;
                }
                if (preferredJob) {
                    existingApplication.jobPreferences.preferredJob = preferredJob;
                }
                if (additionalInfo !== undefined) {
                    existingApplication.jobPreferences.additionalInfo = additionalInfo;
                }
                
                console.log(`✅ Updated job preferences for re-upload: ${email}`);
            } else {
                console.log(`ℹ️ No job preferences provided for re-upload, keeping existing values`);
            }
            
            // Reset status to received on reupload
            existingApplication.status = 'received';
            
            await existingApplication.save();
            console.log(`✅ Re-upload saved to MongoDB for: ${email} (Upload #${uploadCount})`);
        }

        res.json({ 
            success: true, 
            message: isReupload ? 'Documents re-uploaded successfully' : 'Application submitted successfully',
            applicationId: email,
            uploadCount: uploadCount,
            maxUploadsReached: uploadCount >= 3,
            remainingUploads: 3 - uploadCount,
            status: 'received'
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        
        // Check for MongoDB timeout error
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.',
                details: 'MongoDB operation timed out'
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload documents. Please try again.' 
        });
    }
});

// ============================================
// APPLICATION STATUS ENDPOINT - FOR CLIENT
// ============================================

router.get('/status/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        console.log(`📊 Checking status for: ${email}`);
        
        if (!email) {
            return res.status(400).json({ 
                success: false,
                error: 'Email is required' 
            });
        }
        
        // Add timeout to query
        const application = await Application.findOne({ 'personalInfo.email': email })
            .maxTimeMS(5000);
        
        if (!application) {
            console.log(`❌ No application found for: ${email}`);
            return res.status(404).json({ 
                success: false,
                error: 'Application not found',
                message: 'No visa application found for this email address'
            });
        }
        
        // If this is actually an editing request, redirect them
        if (application.mode === 'editing') {
            return res.json({ 
                success: false, 
                error: 'This is an editing service request',
                redirect: '/editing',
                message: 'Please check your editing status at the Editing Service page'
            });
        }
        
        // Calculate upload information
        const uploadInfo = {
            currentUploadCount: application.uploadCount || 1,
            maxUploads: 3,
            remainingUploads: 3 - (application.uploadCount || 1),
            maxUploadsReached: (application.uploadCount || 1) >= 3,
            uploadHistory: application.uploadHistory || []
        };
        
        // Convert documentStatus Map to object for client
        const documentStatus = {};
        if (application.documentStatus) {
            for (const [key, value] of application.documentStatus.entries()) {
                documentStatus[key] = value;
            }
        }
        
        // Get document reviews
        const documentReviews = {};
        if (application.documentReviews) {
            for (const [key, value] of application.documentReviews.entries()) {
                documentReviews[key] = value;
            }
        }
        
        // Count documents by status
        const documentCounts = {
            total: Object.keys(application.uploadedFiles || {}).length,
            approved: 0,
            rejected: 0,
            pending: 0
        };
        
        // Count based on documentStatus
        Object.values(documentStatus).forEach(status => {
            if (status === 'approved') documentCounts.approved++;
            else if (status === 'rejected') documentCounts.rejected++;
            else documentCounts.pending++;
        });
        
        console.log(`✅ Status found for: ${email} - Status: ${application.status}`);
        
        // Filter comments to remove system messages for client view
        const clientComments = (application.comments || []).filter(
            comment => comment.type === 'admin' // Only show admin comments, hide system messages
        );
        
        res.json({ 
            success: true, 
            status: {
                personalInfo: application.personalInfo,
                // NEW: Include job preferences in status response
                jobPreferences: application.jobPreferences || {
                    preferredCountry: 'Not specified',
                    preferredJob: 'Not specified',
                    additionalInfo: ''
                },
                applicationStatus: application.status,
                uploadInfo,
                documentCounts,
                documentStatus: documentStatus,
                documentReviews: documentReviews,
                documentRejectionCount: application.documentRejectionCount ? 
                    Object.fromEntries(application.documentRejectionCount) : {},
                hasReuploadRequests: (application.reuploadRequests || []).length > 0,
                reuploadRequests: application.reuploadRequests || [],
                comments: clientComments, // Send filtered comments to client
                timestamp: application.createdAt,
                lastUpdated: application.updatedAt,
                jobOffer: application.jobOffer || null,
                contract: application.contract || null,
                uploadedFiles: application.uploadedFiles || {}
            }
        });
        
    } catch (error) {
        console.error('❌ Error checking status:', error);
        
        // Check for MongoDB timeout error
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.',
                details: 'MongoDB operation timed out'
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to check application status',
            details: error.message 
        });
    }
});

// ============================================
// DOCUMENT REVIEW ENDPOINT
// ============================================

router.post('/admin/application/:email/document/review', async (req, res) => {
    try {
        const { email } = req.params;
        const { documentType, status, comments } = req.body;
        
        console.log(`📝 Document review for ${email}: ${documentType} = ${status}`);
        
        // Find the application with timeout
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Initialize Maps if they don't exist
        if (!application.documentReviews) application.documentReviews = new Map();
        if (!application.documentStatus) application.documentStatus = new Map();
        if (!application.documentRejectionCount) application.documentRejectionCount = new Map();
        if (!application.comments) application.comments = [];
        
        // Update document review (admin view)
        application.documentReviews.set(documentType, {
            status: status,
            comments: comments || null,
            reviewedAt: new Date(),
            reviewedBy: req.headers['x-admin-user'] || 'admin'
        });
        
        // Update document status (client view)
        application.documentStatus.set(documentType, status);
        
        // Also update in uploadedFiles array
        if (application.uploadedFiles && application.uploadedFiles[documentType]) {
            if (Array.isArray(application.uploadedFiles[documentType])) {
                application.uploadedFiles[documentType].forEach(file => {
                    file.status = status;
                    file.reviewComments = comments;
                    file.reviewedAt = new Date();
                });
            }
        }
        
        // Update rejection count if rejected
        if (status === 'rejected') {
            const currentCount = application.documentRejectionCount.get(documentType) || 0;
            application.documentRejectionCount.set(documentType, currentCount + 1);
            
            application.comments.push({
                text: `❌ Document ${documentType} rejected: ${comments || 'No reason provided'} (Attempt ${currentCount + 1}/3)`,
                timestamp: new Date(),
                user: 'Admin',
                type: 'system'
            });
        } else if (status === 'approved') {
            application.comments.push({
                text: `✅ Document ${documentType} approved`,
                timestamp: new Date(),
                user: 'Admin',
                type: 'system'
            });
        }
        
        // Check if all documents are approved
        const requiredDocs = ['passport', 'photo', 'cv', 'coverLetter', 'qualifications', 'experience'];
        let allApproved = true;
        let allRejected = true;
        
        for (const doc of requiredDocs) {
            const docStatus = application.documentStatus.get(doc);
            if (docStatus !== 'approved') {
                allApproved = false;
            }
            if (docStatus !== 'rejected') {
                allRejected = false;
            }
        }
        
        // If all documents are approved, auto-update application status
        if (allApproved && application.status !== 'documents-approved') {
            application.status = 'documents-approved';
            application.comments.push({
                text: '✅ All documents approved - Application ready for processing',
                timestamp: new Date(),
                user: 'System',
                type: 'system'
            });
        }
        
        // If any document is rejected, update status to changes-required
        if (!allApproved && !allRejected) {
            const hasRejections = Array.from(application.documentStatus.values()).includes('rejected');
            if (hasRejections && application.status !== 'changes-required') {
                application.status = 'changes-required';
                application.comments.push({
                    text: '⚠️ Changes required - Some documents need revision',
                    timestamp: new Date(),
                    user: 'System',
                    type: 'system'
                });
            }
        }
        
        application.updatedAt = new Date();
        await application.save();
        
        console.log(`✅ Document ${documentType} ${status} for ${email}`);
        
        // Convert Maps to objects for response
        const documentStatusObj = {};
        for (const [key, value] of application.documentStatus.entries()) {
            documentStatusObj[key] = value;
        }
        
        res.json({ 
            success: true, 
            message: `Document ${status} successfully`,
            documentStatus: documentStatusObj[documentType],
            allDocumentsApproved: allApproved,
            applicationStatus: application.status
        });
        
    } catch (error) {
        console.error('❌ Document review error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to update document status' });
    }
});

// ============================================
// SYNC DOCUMENT STATUSES
// ============================================

router.post('/admin/application/:email/sync-document-statuses', async (req, res) => {
    try {
        const { email } = req.params;
        
        console.log(`🔄 Syncing document statuses for: ${email}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Initialize Maps if needed
        if (!application.documentReviews) application.documentReviews = new Map();
        if (!application.documentStatus) application.documentStatus = new Map();
        if (!application.comments) application.comments = [];
        
        let syncCount = 0;
        
        // Sync documentReviews to documentStatus
        for (const [docType, review] of application.documentReviews.entries()) {
            if (review && review.status) {
                const oldStatus = application.documentStatus.get(docType);
                const newStatus = review.status;
                
                // Only update if different
                if (oldStatus !== newStatus) {
                    application.documentStatus.set(docType, newStatus);
                    syncCount++;
                    
                    // Also update in uploadedFiles
                    if (application.uploadedFiles && application.uploadedFiles[docType]) {
                        if (Array.isArray(application.uploadedFiles[docType])) {
                            application.uploadedFiles[docType].forEach(file => {
                                file.status = newStatus;
                                file.reviewComments = review.comments;
                            });
                        }
                    }
                }
            }
        }
        
        if (syncCount > 0) {
            application.comments.push({
                text: `🔄 Synced ${syncCount} document statuses`,
                timestamp: new Date(),
                user: 'System',
                type: 'system'
            });
        }
        
        application.updatedAt = new Date();
        await application.save();
        
        // Convert Maps to objects for response
        const documentStatusObj = {};
        for (const [key, value] of application.documentStatus.entries()) {
            documentStatusObj[key] = value;
        }
        
        console.log(`✅ Synced ${syncCount} document statuses for ${email}`);
        
        res.json({ 
            success: true, 
            message: `Document statuses synchronized (${syncCount} updated)`,
            documentStatus: documentStatusObj,
            syncCount
        });
        
    } catch (error) {
        console.error('❌ Sync error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to sync document statuses' });
    }
});

// ============================================
// GET APPLICATION FOR ADMIN
// ============================================

router.get('/admin/application/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        console.log(`📋 Fetching application for admin: ${email}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ 
                success: false,
                error: 'Application not found' 
            });
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
        
        console.log(`✅ Found application for admin: ${email}`);
        
        res.json({
            success: true,
            application: {
                personalInfo: application.personalInfo,
                // NEW: Include job preferences in admin view
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
                comments: application.comments, // Send all comments to admin
                reuploadRequests: application.reuploadRequests,
                createdAt: application.createdAt,
                updatedAt: application.updatedAt
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
// GET ALL APPLICATIONS FOR ADMIN
// ============================================

router.get('/admin/applications', async (req, res) => {
    try {
        console.log('📊 Fetching all applications for admin');
        
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
                // NEW: Include job preferences in admin list
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
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch applications' 
        });
    }
});

// ============================================
// UPDATE APPLICATION STATUS
// ============================================

router.post('/admin/application/:email/status', async (req, res) => {
    try {
        const { email } = req.params;
        const { status } = req.body;
        
        console.log(`📊 Updating status for ${email} to: ${status}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        const oldStatus = application.status;
        application.status = status;
        application.updatedAt = new Date();
        
        // Add status change comment
        if (!application.comments) application.comments = [];
        application.comments.push({
            text: `📊 Application status updated from "${oldStatus}" to "${status}"`,
            timestamp: new Date(),
            user: 'Admin',
            type: 'system'
        });
        
        await application.save();
        
        console.log(`✅ Status updated for ${email}: ${oldStatus} -> ${status}`);
        
        res.json({ 
            success: true, 
            message: 'Status updated successfully',
            status: application.status,
            oldStatus: oldStatus
        });
        
    } catch (error) {
        console.error('❌ Status update error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ============================================
// ADD COMMENT
// ============================================

router.post('/admin/application/:email/comment', async (req, res) => {
    try {
        const { email } = req.params;
        const { comment } = req.body;
        
        console.log(`💬 Adding comment for ${email}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        if (!application.comments) application.comments = [];
        
        application.comments.push({
            text: comment,
            timestamp: new Date(),
            user: 'Admin',
            type: 'admin' // Mark as admin comment
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        console.log(`✅ Comment added for ${email}`);
        
        res.json({ 
            success: true, 
            message: 'Comment added successfully'
        });
        
    } catch (error) {
        console.error('❌ Comment error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// ============================================
// REQUEST REUPLOAD
// ============================================

router.post('/admin/application/:email/request-reupload', async (req, res) => {
    try {
        const { email } = req.params;
        const { documents, message } = req.body;
        
        console.log(`📤 Requesting re-upload for ${email}:`, documents);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Update application status
        application.status = 'reupload-requested';
        
        // Store reupload request
        if (!application.reuploadRequests) application.reuploadRequests = [];
        application.reuploadRequests.push({
            documents: documents,
            message: message,
            requestedAt: new Date(),
            status: 'pending'
        });
        
        // Add comment
        if (!application.comments) application.comments = [];
        application.comments.push({
            text: `📤 Re-upload requested for: ${documents.join(', ')}. Message: ${message}`,
            timestamp: new Date(),
            user: 'Admin',
            type: 'system'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        console.log(`✅ Re-upload requested for ${email}`);
        
        res.json({ 
            success: true, 
            message: 'Re-upload requested successfully'
        });
        
    } catch (error) {
        console.error('❌ Reupload request error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to request re-upload' });
    }
});

// ============================================
// JOB OFFER AND CONTRACT UPLOAD ENDPOINTS
// ============================================

router.post('/upload-job-offer/:email', upload.single('jobOffer'), async (req, res) => {
    try {
        const { email } = req.params;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('✅ Job offer file received:', file.originalname);

        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

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

        res.json({ 
            success: true, 
            message: 'Job offer uploaded successfully',
            file: {
                filename: file.filename,
                originalName: file.originalname,
                url: `/api/application/files/${email}/${file.filename}`
            }
        });

    } catch (error) {
        console.error('❌ Error uploading job offer:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to upload job offer' });
    }
});

router.post('/upload-contract/:email', upload.single('contract'), async (req, res) => {
    try {
        const { email } = req.params;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('✅ Contract file received:', file.originalname);

        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

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

        res.json({ 
            success: true, 
            message: 'Contract uploaded successfully',
            file: {
                filename: file.filename,
                originalName: file.originalname,
                url: `/api/application/files/${email}/${file.filename}`
            }
        });

    } catch (error) {
        console.error('❌ Error uploading contract:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to upload contract' });
    }
});

// ============================================
// UPDATE JOB OFFER STATUS
// ============================================

router.post('/admin/application/:email/job-offer/status', async (req, res) => {
    try {
        const { email } = req.params;
        const { status } = req.body;
        
        console.log(`📄 Updating job offer status for ${email} to: ${status}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        if (!application.jobOffer) {
            return res.status(400).json({ error: 'No job offer found' });
        }
        
        const oldStatus = application.jobOffer.status;
        application.jobOffer.status = status;
        
        application.comments = application.comments || [];
        application.comments.push({
            text: `📄 Job offer status updated from "${oldStatus}" to "${status}"`,
            timestamp: new Date(),
            user: 'Admin',
            type: 'system'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        console.log(`✅ Job offer status updated for ${email}: ${oldStatus} -> ${status}`);
        
        res.json({ 
            success: true, 
            message: 'Job offer status updated',
            status: application.jobOffer.status
        });
        
    } catch (error) {
        console.error('❌ Job offer update error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to update job offer status' });
    }
});

// ============================================
// UPDATE CONTRACT STATUS
// ============================================

router.post('/admin/application/:email/contract/status', async (req, res) => {
    try {
        const { email } = req.params;
        const { status } = req.body;
        
        console.log(`📝 Updating contract status for ${email} to: ${status}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        if (!application.contract) {
            return res.status(400).json({ error: 'No contract found' });
        }
        
        const oldStatus = application.contract.status;
        application.contract.status = status;
        
        application.comments = application.comments || [];
        application.comments.push({
            text: `📝 Contract status updated from "${oldStatus}" to "${status}"`,
            timestamp: new Date(),
            user: 'Admin',
            type: 'system'
        });
        
        application.updatedAt = new Date();
        await application.save();
        
        console.log(`✅ Contract status updated for ${email}: ${oldStatus} -> ${status}`);
        
        res.json({ 
            success: true, 
            message: 'Contract status updated',
            status: application.contract.status
        });
        
    } catch (error) {
        console.error('❌ Contract update error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to update contract status' });
    }
});

// ============================================
// GET DOCUMENTS STATUS
// ============================================

router.get('/documents/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json({
            success: true,
            jobOffer: application.jobOffer ? {
                originalName: application.jobOffer.file.originalName,
                uploadedAt: application.jobOffer.uploadedAt,
                status: application.jobOffer.status,
                url: `/api/application/files/${email}/${application.jobOffer.file.filename}`
            } : null,
            contract: application.contract ? {
                originalName: application.contract.file.originalName,
                uploadedAt: application.contract.uploadedAt,
                status: application.contract.status,
                url: `/api/application/files/${email}/${application.contract.file.filename}`
            } : null
        });

    } catch (error) {
        console.error('Error fetching documents:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

// ============================================
// DELETE APPLICATION
// ============================================

router.delete('/admin/application/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        console.log(`🗑️ Deleting application for: ${email}`);
        
        const application = await Application.findOne({ 'personalInfo.email': email }).maxTimeMS(5000);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        // Delete uploaded files from disk
        const clientFolder = path.join(__dirname, '../uploads', email);
        if (fs.existsSync(clientFolder)) {
            fs.rmSync(clientFolder, { recursive: true, force: true });
        }
        
        // Delete from database
        await Application.deleteOne({ 'personalInfo.email': email });
        
        console.log(`✅ Application deleted for: ${email}`);
        
        res.json({ 
            success: true, 
            message: 'Application deleted successfully' 
        });
        
    } catch (error) {
        console.error('❌ Delete error:', error);
        
        if (error.name === 'MongooseError' && error.message.includes('timed out')) {
            return res.status(503).json({ 
                success: false,
                error: 'Database connection timeout. Please try again.'
            });
        }
        
        res.status(500).json({ error: 'Failed to delete application' });
    }
});

// ============================================
// DOCUMENT LISTING AND SERVING
// ============================================

router.get('/documents-list/:email', (req, res) => {
    try {
        const { email } = req.params;
        const clientFolder = path.join(__dirname, '../uploads', email);
        
        if (!fs.existsSync(clientFolder)) {
            return res.status(404).json({ error: 'Application not found' });
        }
        
        const files = fs.readdirSync(clientFolder)
            .filter(file => file !== 'metadata.json' && !file.startsWith('.'))
            .map(file => {
                const filePath = path.join(clientFolder, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    path: `/api/application/files/${email}/${file}`,
                    size: stats.size,
                    modified: stats.mtime,
                    type: file.split('_')[0]
                };
            });
        
        res.json({ 
            success: true, 
            documents: files 
        });
        
    } catch (error) {
        console.error('❌ Error fetching documents:', error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

router.get('/files/:email/:filename', (req, res) => {
    try {
        const { email, filename } = req.params;
        const filePath = path.join(__dirname, '../uploads', email, filename);
        
        const resolvedPath = path.resolve(filePath);
        const uploadsDir = path.resolve(__dirname, '../uploads');
        
        if (!resolvedPath.startsWith(uploadsDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('❌ Error serving file:', error);
        res.status(500).json({ error: 'Failed to retrieve file' });
    }
});

module.exports = router;