const mongoose = require('mongoose');

const editingSchema = new mongoose.Schema({
  personalInfo: {
    fullName: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, required: true }
  },
  serviceType: { 
    type: String, 
    required: true,
    enum: ['cv', 'cover', 'both']
  },
  amount: { type: Number, required: true },
  instructions: { type: String, default: '' },
  
  // File tracking
  originalFiles: {
    cv: {
      filename: String,
      originalName: String,
      path: String,
      size: Number,
      uploadedAt: Date
    },
    cover: {
      filename: String,
      originalName: String,
      path: String,
      size: Number,
      uploadedAt: Date
    }
  },
  
  editedFiles: {
    cv: {
      final: {
        filename: String,
        originalName: String,
        path: String,
        size: Number,
        uploadedAt: Date
      }
    },
    cover: {
      final: {
        filename: String,
        originalName: String,
        path: String,
        size: Number,
        uploadedAt: Date
      }
    }
  },
  
  // Status tracking
  status: { 
    type: String, 
    required: true,
    enum: ['pending', 'editing_in_progress', 'editing_completed', 'editing_paid'],
    default: 'pending'
  },
  
  paymentStatus: { 
    type: String, 
    required: true,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  
  // Payment tracking
  pendingTransaction: {
    id: String,
    paymentMethod: String,
    senderName: String,
    senderPhone: String,
    senderCountry: String,
    transactionReference: String,
    notes: String,
    amount: Number,
    submittedAt: Date
  },
  
  paymentDetails: {
    transactionId: String,
    amount: Number,
    verifiedAt: Date
  },
  
  // Communication
  comments: [{
    text: String,
    timestamp: { type: Date, default: Date.now },
    user: { type: String, enum: ['Client', 'Admin'] },
    type: { type: String, enum: ['system', 'admin', 'client'] }
  }]
  
}, {
  // This automatically adds createdAt and updatedAt fields
  timestamps: true
});

// Create indexes for faster queries
editingSchema.index({ 'personalInfo.email': 1 });
editingSchema.index({ status: 1 });
editingSchema.index({ createdAt: -1 });

// Make sure the model isn't compiled multiple times
module.exports = mongoose.models.Editing || mongoose.model('Editing', editingSchema);