const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Application = require('../models/Application');

async function updatePrices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Update both/bundle to $30
    const bothResult = await Application.updateMany(
      { mode: 'editing', serviceType: 'both' },
      { $set: { amount: 30 } }
    );
    console.log(`✅ Updated ${bothResult.modifiedCount} bundle requests to $30`);

    // Update CV only to $20
    const cvResult = await Application.updateMany(
      { mode: 'editing', serviceType: 'cv' },
      { $set: { amount: 20 } }
    );
    console.log(`✅ Updated ${cvResult.modifiedCount} CV requests to $20`);

    // Update Cover Letter only to $20
    const coverResult = await Application.updateMany(
      { mode: 'editing', serviceType: 'cover' },
      { $set: { amount: 20 } }
    );
    console.log(`✅ Updated ${coverResult.modifiedCount} Cover Letter requests to $20`);

    console.log('\n📊 Price update completed!');

  } catch (error) {
    console.error('❌ Error updating prices:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

updatePrices();