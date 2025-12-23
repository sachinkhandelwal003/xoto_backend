require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const createError = require('http-errors');
const cors = require('cors');
const connectDB = require('./src/config/database');
const path = require('path');


const app = express();
const PORT = process.env.PORT || 5000;

// === CORS FOR PRODUCTION + DEV ===
app.use(cors({
  origin: [
    'https://kotiboxglobaltech.online',
    'http://localhost:5173'
  ],
  credentials: true
}));

// === SECURITY & LOGGING ===
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 1. WELCOME ROUTE (MUST BE BEFORE /api/ routes)
app.get('/api/', (req, res) => {
  res.json({
    message: 'Xoto API is LIVE!',
    status: 'success',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: ['/api/users', '/api/auth/login']
  });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// 2. MAIN API ROUTES
app.use('/api/', require('./src/app'));

// === 404 HANDLER (MUST BE AFTER ALL ROUTES) ===// === 404 HANDLER (MUST BE AFTER ALL ROUTES) ===
app.use((req, res, next) => {
  next(createError.NotFound());
});

// === ERROR HANDLER (MUST BE LAST) ===
app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.json({
    error: {
      status: err.status || 500,
      message: err.message,
    },
  });
});

// === START SERVER AFTER DB CONNECTION ===
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`MongoDB connected: ${process.env.MONGODB_URI}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();

