const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

// Admin login
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Get all applications
router.get('/applications', (req, res) => {
    try {
        const uploadsDir = path.join(__dirname, '../uploads');
        
        if (!fs.existsSync(uploadsDir)) {
            return res.json({ success: true, applications: [] });
        }
        
        const clients = fs.readdirSync(uploadsDir).filter(file => {
            const filePath = path.join(uploadsDir, file);
            return fs.statSync(filePath).isDirectory();
        });

        const applications = [];

        clients.forEach(client => {
            const metadataPath = path.join(uploadsDir, client, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                applications.push({
                    email: client,
                    ...metadata,
                    folder: client
                });
            }
        });

        applications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({ success: true, applications });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Get single application details
router.get('/application/:email', (req, res) => {
    try {
        const { email } = req.params;
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            const files = fs.readdirSync(clientFolder).filter(file => 
                file !== 'metadata.json' && !file.startsWith('.')
            );

            res.json({ 
                success: true, 
                application: {
                    ...metadata,
                    files: files.map(file => ({
                        name: file,
                        path: `/api/admin/files/${email}/${file}`,
                        size: fs.statSync(path.join(clientFolder, file)).size
                    }))
                }
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({ error: 'Failed to fetch application' });
    }
});

// Download/View file
router.get('/files/:email/:filename', (req, res) => {
    try {
        const { email, filename } = req.params;
        const filePath = path.join(__dirname, '../uploads', email, filename);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve file' });
    }
});

// ============================================
// JOB OFFER AND CONTRACT UPLOAD ENDPOINTS
// ============================================

// Upload job offer letter (from client)
router.post('/upload-job-offer/:email', upload.single('jobOffer'), (req, res) => {
    try {
        const { email } = req.params;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

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
        console.error('Error uploading job offer:', error);
        res.status(500).json({ error: 'Failed to upload job offer' });
    }
});

// Upload contract (from client)
router.post('/upload-contract/:email', upload.single('contract'), (req, res) => {
    try {
        const { email } = req.params;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

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
        console.error('Error uploading contract:', error);
        res.status(500).json({ error: 'Failed to upload contract' });
    }
});

// Get uploaded documents status (job offer and contract)
router.get('/documents/:email', (req, res) => {
    try {
        const { email } = req.params;
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
        console.error('Error fetching documents:', error);
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
        console.error('Error uploading edited documents:', error);
        res.status(500).json({ error: 'Failed to upload edited documents' });
    }
});

// Verify payment for editing service
router.post('/application/:email/verify-payment', (req, res) => {
    try {
        const { email } = req.params;
        const { transactionId, serviceType, amount, notes } = req.body;
        
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
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Failed to verify payment' });
    }
});

// Get payment history for an application
router.get('/application/:email/payments', (req, res) => {
    try {
        const { email } = req.params;
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
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Mark editing as completed
router.post('/application/:email/complete-editing', (req, res) => {
    try {
        const { email } = req.params;
        const { notes } = req.body;
        
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
        console.error('Error completing editing:', error);
        res.status(500).json({ error: 'Failed to complete editing' });
    }
});

// ============================================
// APPLICATION STATUS ENDPOINTS
// ============================================

// Update application status
router.post('/application/:email/status', (req, res) => {
    try {
        const { email } = req.params;
        const { status, notes } = req.body;
        
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
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ============================================
// DOCUMENT REVIEW ENDPOINTS
// ============================================

// Review individual document
router.post('/application/:email/document/review', (req, res) => {
    try {
        const { email } = req.params;
        const { documentType, status, comments } = req.body;
        
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
        console.error('Error reviewing document:', error);
        res.status(500).json({ error: 'Failed to update document review' });
    }
});

// Add comment to application
router.post('/application/:email/comment', (req, res) => {
    try {
        const { email } = req.params;
        const { comment } = req.body;
        
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
        console.error('Error adding comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// Request re-upload for specific documents
router.post('/application/:email/request-reupload', (req, res) => {
    try {
        const { email } = req.params;
        const { documents, message } = req.body;
        
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
        console.error('Error requesting re-upload:', error);
        res.status(500).json({ error: 'Failed to request re-upload' });
    }
});

// Get applications needing review
router.get('/applications/pending-review', (req, res) => {
    try {
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
        console.error('Error fetching pending reviews:', error);
        res.status(500).json({ error: 'Failed to fetch pending reviews' });
    }
});

// Get document review status
router.get('/application/:email/document-reviews', (req, res) => {
    try {
        const { email } = req.params;
        const clientFolder = path.join(__dirname, '../uploads', email);
        const metadataPath = path.join(clientFolder, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            
            const rejectedDocs = Object.keys(metadata.documentReviews || {}).filter(
                doc => metadata.documentReviews[doc]?.status === 'rejected'
            );
            
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
                contract: metadata.contract || null
            });
        } else {
            res.status(404).json({ error: 'Application not found' });
        }
    } catch (error) {
        console.error('Error fetching document reviews:', error);
        res.status(500).json({ error: 'Failed to fetch document reviews' });
    }
});

module.exports = router;