require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/database');
const BankProduct = require('./src/modules/mortgages/models/BankProduct');

const run = async () => {
  await connectDB();
  console.log('Connected to DB. Fetching bank products...');
  const products = await BankProduct.find({}).lean();
  console.log(JSON.stringify(products, null, 2));
  await mongoose.disconnect();
  console.log('Disconnected.');
};

run().catch(console.error);
