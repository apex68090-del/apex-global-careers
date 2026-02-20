const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  size: Number,
  uploadNumber: Number,
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const documentReviewSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  comments: String,
  reviewedAt: Date,
  reviewedBy: String,
  rejectionCount: { type: Number, default: 0 }
}, { _id: false });

const commentSchema = new mongoose.Schema({
  text: String,
  timestamp: { type: Date, default: Date.now },
  admin: String,
  user: { type: String, default: 'Admin' }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  transactionId: String,
  amount: Number,
  serviceType: String,
  verifiedAt: Date,
  verifiedBy: String,
  notes: String,
  status: { type: String, default: 'verified' }
}, { _id: false });

const reuploadRequestSchema = new mongoose.Schema({
  documents: [String],
  message: String,
  requestedAt: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' },
  completedAt: Date,
  rejectionCount: [{
    document: String,
    count: Number
  }]
}, { _id: false });

const jobOfferFileSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  size: Number
}, { _id: false });

const jobOfferSchema = new mongoose.Schema({
  file: jobOfferFileSchema,
  status: { type: String, default: 'pending' },
  uploadedAt: Date,
  reviewedAt: Date
}, { _id: false });

const contractSchema = new mongoose.Schema({
  file: jobOfferFileSchema,
  status: { type: String, default: 'pending' },
  uploadedAt: Date,
  reviewedAt: Date
}, { _id: false });

const uploadHistorySchema = new mongoose.Schema({
  timestamp: Date,
  files: [String]
}, { _id: false });

const editedFileSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  size: Number,
  path: String,
  uploadedAt: Date
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  personalInfo: {
    fullName: String,
    email: { type: String, required: true, unique: true },
    phone: String,
    age: Number,
    gender: String,
    maritalStatus: String,
    country: String,
    visaType: String
  },
  
  status: { 
    type: String, 
    enum: ['received', 'review', 'documents-approved', 'changes-required', 'reupload-requested', 'processed', 
           'pending', 'editing_in_progress', 'editing_completed', 'editing_paid'],
    default: 'received' 
  },
  
  uploadCount: { type: Number, default: 1 },
  maxUploadsReached: { type: Boolean, default: false },
  
  uploadedFiles: {
    passport: [fileSchema],
    photo: [fileSchema],
    cv: [fileSchema],
    coverLetter: [fileSchema],
    qualifications: [fileSchema],
    experience: [fileSchema],
    documents: [fileSchema]
  },
  
  documentReviews: {
    type: Map,
    of: documentReviewSchema,
    default: {}
  },
  
  documentRejectionCount: {
    type: Map,
    of: Number,
    default: {}
  },
  
  comments: [commentSchema],
  reuploadRequests: [reuploadRequestSchema],
  
  jobOffer: jobOfferSchema,
  contract: contractSchema,
  
  uploadHistory: [uploadHistorySchema],
  
  mode: { type: String, enum: ['application', 'editing'], default: 'application' },
  serviceType: String,
  amount: Number,
  instructions: String,
  paymentStatus: { type: String, default: 'pending' },
  payments: [paymentSchema],
  lastPaymentAt: Date,
  
  editedFiles: {
    cv: editedFileSchema,
    cover: editedFileSchema
  },
  
  originalFiles: {
    cv: fileSchema,
    cover: fileSchema
  },
  
  timestamp: { type: Date, default: Date.now },
  lastUploadAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  editingCompletedAt: Date
}, {
  timestamps: true
});

applicationSchema.index({ 'personalInfo.email': 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ createdAt: -1 });
applicationSchema.index({ mode: 1 });

module.exports = mongoose.model('Application', applicationSchema);