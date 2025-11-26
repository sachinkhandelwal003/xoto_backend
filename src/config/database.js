const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      autoIndex: false, // ✅ add this here
      // You can also add other options if needed:
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });

    logger.info('MongoDB Connected...');

    // Verify connection
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connected to DB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error(`Mongoose connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected');
    });

  } catch (err) {
    logger.error(`MongoDB Connection Error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
