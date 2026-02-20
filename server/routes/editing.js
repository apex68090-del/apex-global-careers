const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

// Private folder - NOT in public directory
const PRIVATE_UPLOAD_PATH = path.join(__dirname, '../private/editing-uploads');

// Ensure private uploads directory exists
if (!fs.existsSync(PRIVATE_UPLOAD_PATH)) {
    fs.mkdirSync(PRIVATE_UPLOAD_PATH, { recursive: true });
    console.log('✅ Created private uploads directory at:', PRIVATE_UPLOAD_PATH);
}

// Store download tokens (one-time use, expires)
const downloadTokens = new Map();

// Clean up expired tokens every hour
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of downloadTokens.entries()) {
        if (now > data.expiresAt) {
            downloadTokens.delete(token);
            console.log(`🧹 Expired token cleaned up: ${token}`);
        }
    }
}, 60 * 60 * 1000);

// Configure multer - ALL files go to private folder
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const email = req.params.email || req.body.email || 'temp';
        const userFolder = path.join(PRIVATE_UPLOAD_PATH, email);
        if (!fs.existsSync(userFolder)) {
            fs.mkdirSync(userFolder, { recursive: true });
        }
        cb(null, userFolder);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        let prefix = '';
        
        if (file.fieldname === 'cv') prefix = 'original_cv_';
        else if (file.fieldname === 'cover') prefix = 'original_cover_';
        else if (file.fieldname === 'edited_cv') prefix = 'final_cv_';
        else if (file.fieldname === 'edited_cover') prefix = 'final_cover_';
        
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const filename = `${prefix}${timestamp}_${sanitizedName}`;
        cb(null, filename);
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

// Submit editing request
router.post('/request', upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'cover', maxCount: 1 }
]), async (req, res) => {
    try {
        const { fullName, email, phone, serviceType, instructions, amount } = req.body;
        
        console.log('📝 Editing request received for:', email);
        
        const userFolder = path.join(PRIVATE_UPLOAD_PATH, email);
        const metadataPath = path.join(userFolder, 'editing-metadata.json');

        if (fs.existsSync(metadataPath)) {
            return res.status(400).json({ error: 'An editing request already exists for this email' });
        }

        const editingMetadata = {
            personalInfo: { fullName, email, phone },
            serviceType,
            amount: parseFloat(amount),
            instructions: instructions || '',
            originalFiles: {},
            editedFiles: {},
            status: 'pending',
            paymentStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            comments: []
        };

        if (req.files) {
            if (req.files.cv) {
                editingMetadata.originalFiles.cv = {
                    filename: req.files.cv[0].filename,
                    originalName: req.files.cv[0].originalname,
                    path: req.files.cv[0].path,
                    size: req.files.cv[0].size,
                    uploadedAt: new Date().toISOString()
                };
                console.log('✅ CV uploaded:', req.files.cv[0].originalname);
            }
            if (req.files.cover) {
                editingMetadata.originalFiles.cover = {
                    filename: req.files.cover[0].filename,
                    originalName: req.files.cover[0].originalname,
                    path: req.files.cover[0].path,
                    size: req.files.cover[0].size,
                    uploadedAt: new Date().toISOString()
                };
                console.log('✅ Cover Letter uploaded:', req.files.cover[0].originalname);
            }
        }

        fs.writeFileSync(metadataPath, JSON.stringify(editingMetadata, null, 2));
        console.log('✅ Editing metadata saved to:', metadataPath);

        res.json({ 
            success: true, 
            message: 'Editing request submitted successfully',
            email,
            status: 'pending'
        });

    } catch (error) {
        console.error('❌ Editing request error:', error);
        res.status(500).json({ error: 'Failed to submit editing request' });
    }
});

// ==================== CLIENT ENDPOINTS ====================

// Client status - NO file paths, only status
router.get('/status/:email', (req, res) => {
    try {
        const { email } = req.params;
        const metadataPath = path.join(PRIVATE_UPLOAD_PATH, email, 'editing-metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            const status = {
                personalInfo: metadata.personalInfo,
                serviceType: metadata.serviceType,
                amount: metadata.amount,
                status: metadata.status,
                paymentStatus: metadata.paymentStatus,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
                comments: metadata.comments,
                hasFiles: {
                    cv: !!(metadata.editedFiles?.cv?.final),
                    cover: !!(metadata.editedFiles?.cover?.final)
                },
                // Show if transaction is pending
                transactionPending: !!metadata.pendingTransaction
            };

            res.json({ success: true, status });
        } else {
            res.status(404).json({ error: 'Editing request not found' });
        }
    } catch (error) {
        console.error('Error checking client status:', error);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// Client submits transaction ID (client does this)
router.post('/submit-payment/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { transactionId } = req.body;
        
        if (!transactionId) {
            return res.status(400).json({ error: 'Transaction ID is required' });
        }
        
        const userFolder = path.join(PRIVATE_UPLOAD_PATH, email);
        const metadataPath = path.join(userFolder, 'editing-metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Editing request not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        // Store the transaction ID for admin verification
        metadata.pendingTransaction = {
            id: transactionId,
            submittedAt: new Date().toISOString()
        };

        metadata.comments.push({
            text: `💰 Payment submitted: Transaction ID: ${transactionId} (pending admin verification)`,
            timestamp: new Date().toISOString(),
            user: 'Client'
        });

        metadata.updatedAt = new Date().toISOString();
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        res.json({ 
            success: true, 
            message: 'Payment information submitted. Awaiting admin verification.'
        });

    } catch (error) {
        console.error('Error submitting payment:', error);
        res.status(500).json({ error: 'Failed to submit payment' });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// Admin status - FULL data
router.get('/admin/status/:email', (req, res) => {
    try {
        const { email } = req.params;
        const metadataPath = path.join(PRIVATE_UPLOAD_PATH, email, 'editing-metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            const userFolder = path.join(PRIVATE_UPLOAD_PATH, email);
            let files = [];
            try {
                files = fs.readdirSync(userFolder).filter(file => 
                    file !== 'editing-metadata.json'
                ).map(file => ({
                    name: file,
                    path: `/api/editing/files/${email}/${file}`,
                    size: fs.statSync(path.join(userFolder, file)).size
                }));
            } catch (e) {
                console.log('Could not read files folder');
            }

            const status = {
                personalInfo: metadata.personalInfo,
                serviceType: metadata.serviceType,
                amount: metadata.amount,
                instructions: metadata.instructions,
                status: metadata.status,
                paymentStatus: metadata.paymentStatus,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
                comments: metadata.comments,
                originalFiles: metadata.originalFiles || {},
                editedFiles: metadata.editedFiles || {},
                files: files,
                pendingTransaction: metadata.pendingTransaction || null,
                paymentDetails: metadata.paymentDetails || null
            };

            res.json({ success: true, status });
        } else {
            res.status(404).json({ error: 'Editing request not found' });
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        res.status(500).json({ error: 'Failed to check admin status' });
    }
});

// Admin uploads edited files
router.post('/upload-edited/:email', upload.fields([
    { name: 'edited_cv', maxCount: 1 },
    { name: 'edited_cover', maxCount: 1 }
]), async (req, res) => {
    try {
        const { email } = req.params;
        const metadataPath = path.join(PRIVATE_UPLOAD_PATH, email, 'editing-metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Editing request not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (!metadata.editedFiles) metadata.editedFiles = {};

        if (req.files?.edited_cv) {
            const file = req.files.edited_cv[0];
            metadata.editedFiles.cv = { final: {
                filename: file.filename,
                originalName: file.originalname,
                path: file.path,
                size: file.size,
                uploadedAt: new Date().toISOString()
            }};
            metadata.comments.push({
                text: `✅ Edited CV uploaded: ${file.originalname}`,
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });
        }

        if (req.files?.edited_cover) {
            const file = req.files.edited_cover[0];
            metadata.editedFiles.cover = { final: {
                filename: file.filename,
                originalName: file.originalname,
                path: file.path,
                size: file.size,
                uploadedAt: new Date().toISOString()
            }};
            metadata.comments.push({
                text: `✅ Edited Cover Letter uploaded: ${file.originalname}`,
                timestamp: new Date().toISOString(),
                admin: 'Admin'
            });
        }

        const serviceType = metadata.serviceType;
        let allUploaded = true;
        if (serviceType === 'cv' || serviceType === 'both') {
            if (!metadata.editedFiles.cv?.final) allUploaded = false;
        }
        if (serviceType === 'cover' || serviceType === 'both') {
            if (!metadata.editedFiles.cover?.final) allUploaded = false;
        }

        metadata.status = allUploaded ? 'editing_completed' : 'editing_in_progress';
        metadata.updatedAt = new Date().toISOString();
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        res.json({ success: true, status: metadata.status });
    } catch (error) {
        console.error('❌ Error uploading edited documents:', error);
        res.status(500).json({ error: 'Failed to upload edited documents' });
    }
});

// ADMIN verifies payment (admin does this)
router.post('/verify-payment/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { transactionId, amount } = req.body;
        
        const metadataPath = path.join(PRIVATE_UPLOAD_PATH, email, 'editing-metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Editing request not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        metadata.paymentStatus = 'paid';
        metadata.status = 'editing_paid';
        metadata.paymentDetails = {
            transactionId: transactionId || metadata.pendingTransaction?.id,
            amount,
            verifiedAt: new Date().toISOString()
        };

        metadata.comments.push({
            text: `✅ Payment verified by admin: $${amount}. Transaction ID: ${transactionId || metadata.pendingTransaction?.id}`,
            timestamp: new Date().toISOString(),
            admin: 'Admin'
        });

        // Clear pending transaction
        delete metadata.pendingTransaction;

        metadata.updatedAt = new Date().toISOString();
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        res.json({ 
            success: true, 
            message: 'Payment verified successfully',
            status: 'editing_paid'
        });

    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// Generate download token (only after payment)
router.post('/generate-download-token/:email', (req, res) => {
    try {
        const { email } = req.params;
        const metadataPath = path.join(PRIVATE_UPLOAD_PATH, email, 'editing-metadata.json');

        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Editing request not found' });
        }

        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        if (metadata.paymentStatus !== 'paid') {
            return res.status(403).json({ error: 'Payment not verified' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 60 * 60 * 1000;

        downloadTokens.set(token, {
            email,
            expiresAt,
            used: false,
            files: {
                cv: metadata.editedFiles?.cv?.final?.path,
                cover: metadata.editedFiles?.cover?.final?.path
            }
        });

        res.json({ success: true, token, expiresIn: '1 hour' });
    } catch (error) {
        console.error('❌ Error generating token:', error);
        res.status(500).json({ error: 'Failed to generate download token' });
    }
});

// Secure download
router.get('/download/:token/:type', (req, res) => {
    try {
        const { token, type } = req.params;
        const tokenData = downloadTokens.get(token);
        if (!tokenData || tokenData.used || Date.now() > tokenData.expiresAt) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        const filePath = tokenData.files[type];
        if (!filePath || !fs.existsSync(filePath)) {
            downloadTokens.delete(token);
            return res.status(404).json({ error: 'File not found' });
        }

        tokenData.used = true;
        downloadTokens.delete(token);

        const filename = path.basename(filePath);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(filePath);
    } catch (error) {
        console.error('❌ Error downloading file:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Admin view files
router.get('/files/:email/:filename', (req, res) => {
    try {
        const { email, filename } = req.params;
        const filePath = path.join(PRIVATE_UPLOAD_PATH, email, filename);
        
        const resolvedPath = path.resolve(filePath);
        const uploadsDir = path.resolve(PRIVATE_UPLOAD_PATH);
        if (!resolvedPath.startsWith(uploadsDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filename).toLowerCase();
            const contentTypes = {
                '.pdf': 'application/pdf',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png'
            };
            res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
            res.setHeader('Content-Disposition', 'inline');
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        console.error('❌ Error serving file:', error);
        res.status(500).json({ error: 'Failed to retrieve file' });
    }
});

// Get all editing requests for admin
router.get('/admin/all', (req, res) => {
    try {
        const requests = [];
        if (!fs.existsSync(PRIVATE_UPLOAD_PATH)) {
            return res.json({ success: true, requests: [] });
        }

        const users = fs.readdirSync(PRIVATE_UPLOAD_PATH).filter(file => {
            const filePath = path.join(PRIVATE_UPLOAD_PATH, file);
            return fs.statSync(filePath).isDirectory();
        });

        users.forEach(email => {
            const metadataPath = path.join(PRIVATE_UPLOAD_PATH, email, 'editing-metadata.json');
            if (fs.existsSync(metadataPath)) {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                requests.push({ email, ...metadata });
            }
        });

        res.json({ success: true, requests });
    } catch (error) {
        console.error('Error fetching editing requests:', error);
        res.status(500).json({ error: 'Failed to fetch editing requests' });
    }
});

module.exports = router;