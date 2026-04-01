require('dotenv').config();
const emailService = require('./utils/emailService');

async function testEmail() {
    console.log('📧 Testing Email Configuration...\n');
    
    const testApp = {
        personalInfo: {
            fullName: 'Test User',
            email: 'your-email@gmail.com', // Replace with your email
            phone: '+254712345678',
            country: 'Kenya',
            visaType: 'Work Visa'
        },
        applicationId: 'AGC-TEST-001',
        jobPreferences: {
            preferredJob: 'Software Developer',
            preferredCountry: 'Canada'
        }
    };
    
    const result = await emailService.sendApplicationReceived(testApp);
    
    if (result.success) {
        console.log('\n✅ Test email sent successfully!');
        console.log('   Check your inbox for the test email');
    } else {
        console.log('\n❌ Test failed:', result.error);
    }
}

testEmail();