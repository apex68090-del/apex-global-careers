const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('📧 Email Service Initialized');
console.log('📧 From:', process.env.EMAIL_USER);
console.log('📧 Host:', process.env.EMAIL_HOST);
console.log('📧 Port:', process.env.EMAIL_PORT);

// Configure Zoho SMTP with your App Password
const transporter = nodemailer.createTransport({
    host: 'smtppro.zoho.com',
    port: 587,
    secure: false,
    auth: {
        user: 'info@apex-global-careers.onrender.com',
        pass: '8R9cvxxDssLU'
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verify connection
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ SMTP Error:', error.message);
    } else {
        console.log('✅ SMTP Ready - Connected to Zoho Mail');
    }
});

// ✅ FIXED: Base URL should be the root domain, NOT including /progress
const BASE_URL = process.env.BASE_URL || 'https://apex-global-careers.onrender.com';

console.log('📧 Email links will point to:', BASE_URL);

// Send email function
async function sendEmail(to, subject, html) {
    const mailOptions = {
        from: `"Apex Global Careers" <info@apex-global-careers.onrender.com>`,
        to: to,
        subject: subject,
        html: html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Email sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Email failed:`, error.message);
        return { success: false, error: error.message };
    }
}

// Application Received Email
async function sendApplicationReceived(application) {
    const { personalInfo, applicationId, jobPreferences } = application;
    // ✅ This will now create correct URL: https://apex-global-careers.onrender.com/progress?email=...
    const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Application Received</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; background: #f5f7fa; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 40px 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; }
                .content { padding: 40px 30px; }
                .app-id { background: #f0f4ff; padding: 20px; text-align: center; border-radius: 12px; margin: 25px 0; border-left: 4px solid #667eea; }
                .app-id strong { color: #667eea; font-size: 22px; font-family: monospace; }
                .info-card { background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 25px 0; }
                .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #e0e0e0; }
                .info-row:last-child { border-bottom: none; }
                .info-label { font-weight: 600; width: 140px; color: #2c3e50; }
                .info-value { color: #34495e; }
                .button { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; margin: 20px 0; }
                .whatsapp-btn { background: #25D366; margin-left: 10px; }
                .footer { padding: 25px; text-align: center; background: #f8f9fa; color: #7f8c8d; font-size: 12px; border-top: 1px solid #e0e0e0; }
                @media (max-width: 600px) {
                    .info-row { flex-direction: column; }
                    .info-label { width: 100%; margin-bottom: 5px; }
                    .button { display: block; margin: 10px 0; }
                    .whatsapp-btn { margin-left: 0; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🌍 Apex Global Careers</h1>
                    <p>Your International Career Partner</p>
                </div>
                <div class="content">
                    <h2>Dear ${personalInfo.fullName},</h2>
                    <p>Thank you for choosing Apex Global Careers. We have successfully received your visa application.</p>
                    
                    <div class="app-id">
                        <strong>📋 ${applicationId}</strong>
                    </div>
                    
                    <div class="info-card">
                        <h3 style="margin-top: 0;">📝 Application Summary</h3>
                        <div class="info-row"><span class="info-label">Full Name:</span><span class="info-value">${personalInfo.fullName}</span></div>
                        <div class="info-row"><span class="info-label">Email:</span><span class="info-value">${personalInfo.email}</span></div>
                        <div class="info-row"><span class="info-label">Phone:</span><span class="info-value">${personalInfo.phone}</span></div>
                        <div class="info-row"><span class="info-label">Country:</span><span class="info-value">${personalInfo.country}</span></div>
                        <div class="info-row"><span class="info-label">Visa Type:</span><span class="info-value">${personalInfo.visaType}</span></div>
                        <div class="info-row"><span class="info-label">Preferred Job:</span><span class="info-value">${jobPreferences?.preferredJob || 'Not specified'}</span></div>
                        <div class="info-row"><span class="info-label">Preferred Country:</span><span class="info-value">${jobPreferences?.preferredCountry || 'Not specified'}</span></div>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="${trackLink}" class="button">🔍 Track Your Application</a>
                        <a href="https://wa.me/254736895385" class="button whatsapp-btn">📱 WhatsApp Support</a>
                    </div>
                    
                    <p><strong>⏱️ What happens next?</strong></p>
                    <ul>
                        <li>✅ Our team will review your documents within 24-48 hours</li>
                        <li>📧 You'll receive email notifications when your status changes</li>
                        <li>🔍 Track your application anytime using the button above</li>
                    </ul>
                </div>
                <div class="footer">
                    <p>&copy; 2025 Apex Global Careers. All rights reserved.</p>
                    <p>📍 Nairobi, Kenya | 📞 +254 736 895385 | ✉️ info@apex-global-careers.onrender.com</p>
                </div>
            </div>
        </body>
        </html>
    `;
    
    return sendEmail(personalInfo.email, `✅ Application Received - ${applicationId}`, html);
}

// Under Review Email
async function sendUnderReview(application) {
    const { personalInfo, applicationId } = application;
    const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
    
    const html = `
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #3498db, #2980b9); padding: 30px; text-align: center; color: white;">
                <h1>🔍 Application Under Review</h1>
            </div>
            <div style="padding: 30px;">
                <h2>Hello ${personalInfo.fullName},</h2>
                <p>Your application <strong>${applicationId}</strong> is now being reviewed.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${trackLink}" style="background: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px;">📊 Check Progress</a>
                </div>
            </div>
        </div>
    `;
    
    return sendEmail(personalInfo.email, `🔍 Under Review - ${applicationId}`, html);
}

// Documents Approved Email
async function sendDocumentsApproved(application) {
    const { personalInfo, applicationId } = application;
    const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
    
    const html = `
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #27ae60, #229954); padding: 30px; text-align: center; color: white;">
                <h1>✅ Documents Approved!</h1>
            </div>
            <div style="padding: 30px;">
                <h2>Great news ${personalInfo.fullName}!</h2>
                <div style="background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    ✓ All documents approved for ${applicationId}
                </div>
                <div style="text-align: center;">
                    <a href="${trackLink}" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px;">📊 View Progress</a>
                </div>
            </div>
        </div>
    `;
    
    return sendEmail(personalInfo.email, `✅ Documents Approved - ${applicationId}`, html);
}

// Re-upload Request Email
async function sendReuploadRequested(application, message, documents) {
    const { personalInfo, applicationId } = application;
    const reuploadLink = `${BASE_URL}/reupload?email=${encodeURIComponent(personalInfo.email)}`;
    
    const docNames = {
        passport: 'Passport', photo: 'Passport Photo', cv: 'CV/Resume',
        coverLetter: 'Cover Letter', qualifications: 'Qualifications', experience: 'Experience Letters'
    };
    
    const docsList = documents ? documents.map(d => `• ${docNames[d] || d}`).join('<br>') : '• Please check your dashboard';
    
    const html = `
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); padding: 30px; text-align: center; color: white;">
                <h1>⚠️ Document Re-upload Required</h1>
            </div>
            <div style="padding: 30px;">
                <h2>Hello ${personalInfo.fullName},</h2>
                <div style="background: #fff3cd; border-left: 4px solid #e74c3c; padding: 20px; margin: 20px 0;">
                    <h3>📋 Documents Requiring Re-upload:</h3>
                    <div style="margin: 10px 0;">${docsList}</div>
                    ${message ? `<p><strong>📝 Note:</strong> ${message}</p>` : ''}
                </div>
                <div style="text-align: center;">
                    <a href="${reuploadLink}" style="background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px;">📤 Re-upload Now</a>
                </div>
            </div>
        </div>
    `;
    
    return sendEmail(personalInfo.email, `⚠️ Action Required - ${applicationId}`, html);
}

// Application Processed Email
async function sendApplicationProcessed(application) {
    const { personalInfo, applicationId } = application;
    const nextStepsLink = `${BASE_URL}/next-steps.html?email=${encodeURIComponent(personalInfo.email)}`;
    
    const html = `
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #9b59b6, #8e44ad); padding: 30px; text-align: center; color: white;">
                <h1>🎉 Application Processed!</h1>
            </div>
            <div style="padding: 30px;">
                <h2>Congratulations ${personalInfo.fullName}!</h2>
                <p>Your application <strong>${applicationId}</strong> has been successfully processed.</p>
                <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3>✅ Next Steps</h3>
                    <p>Please upload your signed documents:</p>
                    <ul><li>📄 Job Offer Letter</li><li>📝 Employment Contract</li></ul>
                </div>
                <div style="text-align: center;">
                    <a href="${nextStepsLink}" style="background: #27ae60; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px;">📄 Upload Documents</a>
                </div>
            </div>
        </div>
    `;
    
    return sendEmail(personalInfo.email, `🎉 Application Processed - ${applicationId}`, html);
}

// Job Offer Uploaded Email
async function sendJobOfferUploaded(application) {
    const { personalInfo, applicationId } = application;
    const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
    
    const html = `
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #3498db, #2980b9); padding: 30px; text-align: center; color: white;">
                <h1>📄 Job Offer Letter Ready</h1>
            </div>
            <div style="padding: 30px;">
                <h2>Hello ${personalInfo.fullName},</h2>
                <p>Your job offer letter for application <strong>${applicationId}</strong> has been uploaded.</p>
                <div style="text-align: center;">
                    <a href="${trackLink}" style="background: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px;">📊 View Documents</a>
                </div>
            </div>
        </div>
    `;
    
    return sendEmail(personalInfo.email, `📄 Job Offer Ready - ${applicationId}`, html);
}

// Contract Uploaded Email
async function sendContractUploaded(application) {
    const { personalInfo, applicationId } = application;
    const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
    
    const html = `
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #9b59b6, #8e44ad); padding: 30px; text-align: center; color: white;">
                <h1>📝 Employment Contract Ready</h1>
            </div>
            <div style="padding: 30px;">
                <h2>Hello ${personalInfo.fullName},</h2>
                <p>Your employment contract for application <strong>${applicationId}</strong> has been uploaded.</p>
                <div style="text-align: center;">
                    <a href="${trackLink}" style="background: #9b59b6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 50px;">📊 View Documents</a>
                </div>
            </div>
        </div>
    `;
    
    return sendEmail(personalInfo.email, `📝 Contract Ready - ${applicationId}`, html);
}

// Export all functions
module.exports = {
    sendApplicationReceived,
    sendUnderReview,
    sendDocumentsApproved,
    sendReuploadRequested,
    sendApplicationProcessed,
    sendJobOfferUploaded,
    sendContractUploaded
};