require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/database');
const BankProduct = require('./src/modules/mortgages/models/BankProduct');

const run = async () => {
  await connectDB();
  console.log('Connected to DB. Fetching bank product 6a2c07a7da5736e55c89e413...');
  const product = await BankProduct.findById('6a2c07a7da5736e55c89e413');
  if (!product) {
    console.error('Product 6a2c07a7da5736e55c89e413 not found in database.');
    await mongoose.disconnect();
    return;
  }
  
  console.log('Original Product in DB:', {
    productName: product.productName,
    ltv: product.ltv,
    interestRate: product.interestRate,
    minimumFloorRate: product.minimumFloorRate,
    followOnRate: product.followOnRate
  });

  // Simulate frontend prefill normalization:
  let ltvVal = product.ltv;
  if (ltvVal && typeof ltvVal === 'object') {
    ltvVal = ltvVal.max != null ? String(ltvVal.max) : '';
  } else {
    ltvVal = String(ltvVal || '');
  }
  if (ltvVal.endsWith('%')) {
    ltvVal = ltvVal.slice(0, -1);
  }

  // Simulate editing (e.g. updating LTV to "85") and toggle switches:
  const updatedLtv = '85'; // Frontend saves it as string
  const isEiborLinked = true;
  const followOnValue = '1.75';
  const formattedFollowOn = isEiborLinked ? `EIBOR + ${followOnValue}%` : `${followOnValue}%`;

  // Apply updates to Mongoose document:
  product.ltv = updatedLtv;
  product.followOnRate = formattedFollowOn;
  product.interestRate = '3.99'; // ensure it is string
  product.minimumFloorRate = '2.99'; // ensure it is string

  console.log('Saving updated product...');
  await product.save();
  console.log('Product saved successfully! Re-fetching to verify...');

  const savedProduct = await BankProduct.findById('6a2c07a7da5736e55c89e413').lean();
  console.log('Saved Product in DB:', {
    productName: savedProduct.productName,
    ltv: savedProduct.ltv,
    interestRate: savedProduct.interestRate,
    minimumFloorRate: savedProduct.minimumFloorRate,
    followOnRate: savedProduct.followOnRate
  });

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch(console.error);
