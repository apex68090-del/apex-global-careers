const nodemailer = require('nodemailer');

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'apex68090@gmail.com', // Your email that sends updates
        pass: process.env.EMAIL_APP_PASSWORD // Use app password from environment
    }
});

// Base URL for links
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Send email notification for various application events
 */
class EmailService {
    
    /**
     * Send application received confirmation
     */
    static async sendApplicationReceived(application) {
        const { personalInfo, applicationId, jobPreferences } = application;
        const email = personalInfo.email;
        const name = personalInfo.fullName;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `✅ Application Received - ${applicationId}`,
            html: this.getApplicationReceivedTemplate(application)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Application received email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Send under review notification
     */
    static async sendUnderReview(application) {
        const { personalInfo, applicationId } = application;
        const email = personalInfo.email;
        const name = personalInfo.fullName;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `🔍 Application Under Review - ${applicationId}`,
            html: this.getUnderReviewTemplate(application)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Under review email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Send documents approved notification
     */
    static async sendDocumentsApproved(application) {
        const { personalInfo, applicationId } = application;
        const email = personalInfo.email;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `✅ Documents Approved - ${applicationId}`,
            html: this.getDocumentsApprovedTemplate(application)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Documents approved email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Send re-upload request notification
     */
    static async sendReuploadRequested(application, comments, rejectedDocs) {
        const { personalInfo, applicationId } = application;
        const email = personalInfo.email;
        const name = personalInfo.fullName;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `⚠️ Action Required: Document Re-upload - ${applicationId}`,
            html: this.getReuploadRequestedTemplate(application, comments, rejectedDocs)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Re-upload request email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Send changes required notification
     */
    static async sendChangesRequired(application, comments, rejectedDocs) {
        const { personalInfo, applicationId } = application;
        const email = personalInfo.email;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `📝 Changes Required - ${applicationId}`,
            html: this.getChangesRequiredTemplate(application, comments, rejectedDocs)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Changes required email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Send application processed notification (ready for job offer/contract)
     */
    static async sendApplicationProcessed(application) {
        const { personalInfo, applicationId } = application;
        const email = personalInfo.email;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `🎉 Application Processed - Next Steps - ${applicationId}`,
            html: this.getApplicationProcessedTemplate(application)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Application processed email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Send job offer uploaded notification
     */
    static async sendJobOfferUploaded(application) {
        const { personalInfo, applicationId } = application;
        const email = personalInfo.email;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `📄 Job Offer Letter Ready - ${applicationId}`,
            html: this.getJobOfferTemplate(application)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Job offer email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    /**
     * Send contract uploaded notification
     */
    static async sendContractUploaded(application) {
        const { personalInfo, applicationId } = application;
        const email = personalInfo.email;
        
        const mailOptions = {
            from: '"Apex Global Careers" <apex68090@gmail.com>',
            to: email,
            subject: `📝 Employment Contract Ready - ${applicationId}`,
            html: this.getContractTemplate(application)
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📧 Contract email sent to ${email}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Email send failed:', error);
            return { success: false, error };
        }
    }

    // ========== EMAIL TEMPLATES ==========

    static getApplicationReceivedTemplate(app) {
        const { personalInfo, applicationId, jobPreferences } = app;
        const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; color: white; }
                .header h1 { margin: 0; font-size: 28px; }
                .header p { margin: 10px 0 0; opacity: 0.9; }
                .content { padding: 30px; background: white; }
                .application-id { background: #f0f4ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 5px; }
                .application-id strong { color: #667eea; font-size: 20px; letter-spacing: 1px; }
                .info-box { background: #f8f9fa; border-radius: 10px; padding: 20px; margin: 20px 0; }
                .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
                .info-row:last-child { border-bottom: none; }
                .info-label { font-weight: 600; width: 120px; color: #2c3e50; }
                .info-value { color: #34495e; }
                .button { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; margin: 20px 0; }
                .button:hover { opacity: 0.9; }
                .footer { padding: 20px; text-align: center; background: #f0f0f0; color: #7f8c8d; font-size: 14px; }
                .footer a { color: #667eea; text-decoration: none; }
                .timeline { display: flex; justify-content: space-between; margin: 30px 0; }
                .timeline-step { text-align: center; flex: 1; }
                .timeline-dot { width: 40px; height: 40px; background: #e0e0e0; border-radius: 50%; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; }
                .timeline-step.active .timeline-dot { background: #27ae60; }
                .timeline-step.completed .timeline-dot { background: #27ae60; }
                .timeline-label { font-size: 12px; color: #7f8c8d; }
                .whatsapp-btn { display: inline-block; background: #25D366; color: white; text-decoration: none; padding: 10px 20px; border-radius: 50px; margin-left: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🌍 Apex Global Careers</h1>
                    <p>Application Received</p>
                </div>
                <div class="content">
                    <h2>Hello ${personalInfo.fullName},</h2>
                    <p>Thank you for submitting your application to Apex Global Careers. We have successfully received your documents and will begin processing them shortly.</p>
                    
                    <div class="application-id">
                        <strong>📋 Application ID: ${applicationId}</strong>
                    </div>
                    
                    <div class="info-box">
                        <h3 style="margin-top: 0;">📝 Application Summary</h3>
                        <div class="info-row">
                            <span class="info-label">Full Name:</span>
                            <span class="info-value">${personalInfo.fullName}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Email:</span>
                            <span class="info-value">${personalInfo.email}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Phone:</span>
                            <span class="info-value">${personalInfo.phone}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Country:</span>
                            <span class="info-value">${personalInfo.country}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Visa Type:</span>
                            <span class="info-value">${personalInfo.visaType}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Preferred Job:</span>
                            <span class="info-value">${jobPreferences?.preferredJob || 'Not specified'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Preferred Country:</span>
                            <span class="info-value">${jobPreferences?.preferredCountry || 'Not specified'}</span>
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="${trackLink}" class="button">🔍 Track Your Application</a>
                        <a href="https://wa.me/254736895385" class="whatsapp-btn">📱 WhatsApp Support</a>
                    </div>
                    
                    <div class="timeline">
                        <div class="timeline-step active">
                            <div class="timeline-dot">1</div>
                            <div class="timeline-label">Received</div>
                        </div>
                        <div class="timeline-step">
                            <div class="timeline-dot">2</div>
                            <div class="timeline-label">Review</div>
                        </div>
                        <div class="timeline-step">
                            <div class="timeline-dot">3</div>
                            <div class="timeline-label">Approved</div>
                        </div>
                        <div class="timeline-step">
                            <div class="timeline-dot">4</div>
                            <div class="timeline-label">Processed</div>
                        </div>
                    </div>
                    
                    <p><strong>⏱️ What happens next?</strong></p>
                    <ul style="color: #34495e;">
                        <li>Our team will review your documents within 24-48 hours</li>
                        <li>You'll receive an email when your status changes</li>
                        <li>Check your status anytime using the link above</li>
                    </ul>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers. All rights reserved.</p>
                    <p>Need help? Contact us on <a href="https://wa.me/254736895385">WhatsApp</a> or <a href="mailto:support@apexglobalcareers.com">Email</a></p>
                    <p style="font-size: 12px;">This is an automated message, please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    static getUnderReviewTemplate(app) {
        const { personalInfo, applicationId } = app;
        const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #3498db, #2980b9); padding: 30px; text-align: center; color: white; }
                .content { padding: 30px; background: white; }
                .button { display: inline-block; background: #3498db; color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; }
                .footer { padding: 20px; text-align: center; background: #f0f0f0; color: #7f8c8d; }
                .application-id { background: #e8f4fd; border-left: 4px solid #3498db; padding: 15px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔍 Application Under Review</h1>
                </div>
                <div class="content">
                    <h2>Hello ${personalInfo.fullName},</h2>
                    <p>Your application <strong>${applicationId}</strong> is now being reviewed by our team.</p>
                    
                    <div class="application-id">
                        <strong>Status: Under Review</strong>
                    </div>
                    
                    <p>We are carefully checking your documents. This process typically takes 24-48 hours.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${trackLink}" class="button">📊 Check Progress</a>
                    </div>
                    
                    <p>You'll receive another update once your documents have been reviewed.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    static getDocumentsApprovedTemplate(app) {
        const { personalInfo, applicationId } = app;
        const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #27ae60, #229954); padding: 30px; text-align: center; color: white; }
                .content { padding: 30px; background: white; }
                .button { display: inline-block; background: #27ae60; color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; }
                .success-badge { background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Documents Approved!</h1>
                </div>
                <div class="content">
                    <h2>Great news ${personalInfo.fullName}!</h2>
                    <p>All your documents have been approved for application <strong>${applicationId}</strong>.</p>
                    
                    <div class="success-badge">
                        ✓ All documents verified and accepted
                    </div>
                    
                    <p>Your application will now move to the next stage. We'll contact you soon with further updates.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${trackLink}" class="button">📊 View Progress</a>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    static getReuploadRequestedTemplate(app, comments, rejectedDocs) {
        const { personalInfo, applicationId } = app;
        const trackLink = `${BASE_URL}/reupload?email=${encodeURIComponent(personalInfo.email)}`;
        const progressLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        const docsList = rejectedDocs ? rejectedDocs.map(doc => {
            const docNames = {
                'passport': 'Passport',
                'photo': 'Passport Photo',
                'cv': 'CV/Resume',
                'coverLetter': 'Cover Letter',
                'qualifications': 'Qualifications',
                'experience': 'Experience Letters'
            };
            return `<li>📄 ${docNames[doc] || doc}</li>`;
        }).join('') : '<li>Some documents need attention</li>';
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #e74c3c, #c0392b); padding: 30px; text-align: center; color: white; }
                .content { padding: 30px; background: white; }
                .button { display: inline-block; background: #e74c3c; color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; margin: 5px; }
                .warning-box { background: #fff3cd; border-left: 4px solid #e74c3c; padding: 20px; margin: 20px 0; border-radius: 5px; }
                .doc-list { background: #f8f9fa; padding: 15px; border-radius: 8px; }
                .comment-box { background: #f0f0f0; padding: 15px; border-radius: 8px; font-style: italic; margin: 15px 0; }
                .whatsapp-btn { background: #25D366; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚠️ Action Required: Document Re-upload</h1>
                </div>
                <div class="content">
                    <h2>Hello ${personalInfo.fullName},</h2>
                    <p>We need your attention for application <strong>${applicationId}</strong>.</p>
                    
                    <div class="warning-box">
                        <h3 style="margin-top: 0; color: #e74c3c;">📋 Documents Requiring Re-upload:</h3>
                        <ul class="doc-list">
                            ${docsList}
                        </ul>
                    </div>
                    
                    ${comments ? `
                    <div class="comment-box">
                        <strong>📝 Admin Comment:</strong>
                        <p>${comments}</p>
                    </div>
                    ` : ''}
                    
                    <p><strong>Please upload new versions of these documents.</strong> Make sure they meet the requirements.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${trackLink}" class="button">📤 Re-upload Documents</a>
                        <a href="${progressLink}" class="button whatsapp-btn">📊 Check Status</a>
                    </div>
                    
                    <p>If you need assistance, our support team is ready to help.</p>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    static getChangesRequiredTemplate(app, comments, rejectedDocs) {
        const { personalInfo, applicationId } = app;
        const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        const docsList = rejectedDocs ? rejectedDocs.map(doc => {
            const docNames = {
                'passport': 'Passport',
                'photo': 'Passport Photo',
                'cv': 'CV/Resume',
                'coverLetter': 'Cover Letter',
                'qualifications': 'Qualifications',
                'experience': 'Experience Letters'
            };
            return `<li>📄 ${docNames[doc] || doc}</li>`;
        }).join('') : '';
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #f39c12, #e67e22); padding: 30px; text-align: center; color: white; }
                .content { padding: 30px; background: white; }
                .button { display: inline-block; background: #f39c12; color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; }
                .changes-box { background: #fff3cd; border-left: 4px solid #f39c12; padding: 20px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📝 Changes Required</h1>
                </div>
                <div class="content">
                    <h2>Hello ${personalInfo.fullName},</h2>
                    <p>Some documents in your application <strong>${applicationId}</strong> need modifications.</p>
                    
                    <div class="changes-box">
                        <h3 style="margin-top: 0;">Documents to update:</h3>
                        <ul>
                            ${docsList}
                        </ul>
                        ${comments ? `<p><strong>Note:</strong> ${comments}</p>` : ''}
                    </div>
                    
                    <p>Please update these documents and re-upload them.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${trackLink}" class="button">📊 View Details</a>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    static getApplicationProcessedTemplate(app) {
        const { personalInfo, applicationId } = app;
        const nextStepsLink = `${BASE_URL}/next-steps.html?email=${encodeURIComponent(personalInfo.email)}`;
        const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #9b59b6, #8e44ad); padding: 30px; text-align: center; color: white; }
                .content { padding: 30px; background: white; }
                .button { display: inline-block; background: #9b59b6; color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; margin: 5px; }
                .next-btn { background: #27ae60; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Application Processed!</h1>
                </div>
                <div class="content">
                    <h2>Congratulations ${personalInfo.fullName}!</h2>
                    <p>Your application <strong>${applicationId}</strong> has been successfully processed.</p>
                    
                    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #27ae60;">✅ Next Steps</h3>
                        <p>Please proceed to upload your signed documents:</p>
                        <ul>
                            <li>Job Offer Letter</li>
                            <li>Employment Contract</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${nextStepsLink}" class="button next-btn">📄 Upload Documents</a>
                        <a href="${trackLink}" class="button">📊 Track Progress</a>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    static getJobOfferTemplate(app) {
        const { personalInfo, applicationId } = app;
        const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #3498db, #2980b9); padding: 30px; text-align: center; color: white; }
                .content { padding: 30px; background: white; }
                .button { display: inline-block; background: #3498db; color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📄 Job Offer Letter Ready</h1>
                </div>
                <div class="content">
                    <h2>Hello ${personalInfo.fullName},</h2>
                    <p>Your job offer letter for application <strong>${applicationId}</strong> has been uploaded.</p>
                    
                    <p>Please log in to your dashboard to view and sign the document.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${trackLink}" class="button">📊 View Documents</a>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    static getContractTemplate(app) {
        const { personalInfo, applicationId } = app;
        const trackLink = `${BASE_URL}/progress?email=${encodeURIComponent(personalInfo.email)}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Inter', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 20px auto; background: #f9f9f9; border-radius: 15px; overflow: hidden; }
                .header { background: linear-gradient(135deg, #9b59b6, #8e44ad); padding: 30px; text-align: center; color: white; }
                .content { padding: 30px; background: white; }
                .button { display: inline-block; background: #9b59b6; color: white; text-decoration: none; padding: 12px 30px; border-radius: 50px; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📝 Employment Contract Ready</h1>
                </div>
                <div class="content">
                    <h2>Hello ${personalInfo.fullName},</h2>
                    <p>Your employment contract for application <strong>${applicationId}</strong> has been uploaded.</p>
                    
                    <p>Please log in to your dashboard to view and sign the contract.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${trackLink}" class="button">📊 View Documents</a>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2024 Apex Global Careers</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
}

module.exports = EmailService;