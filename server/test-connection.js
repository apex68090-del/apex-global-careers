const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function testConnection() {
  console.log('🔌 Testing MongoDB connection...');
  console.log('URI:', process.env.MONGODB_URI.replace(/:[^:]*@/, ':****@'));
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ SUCCESS! Connected to MongoDB!');
    console.log('📊 Database:', mongoose.connection.name);
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Collections:', collections.map(c => c.name).join(', ') || 'none');
    
    await mongoose.disconnect();
    console.log('👋 Disconnected');
  } catch (error) {
    console.error('❌ ERROR:', error.message);
  }
}

testConnection();