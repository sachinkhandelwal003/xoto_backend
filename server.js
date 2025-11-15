require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const createError = require('http-errors');
const cors = require('cors');
const connectDB = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// === CORS FOR PRODUCTION + DEV ===
// === CORS CONFIG - FIXED & BULLETPROOF ===
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'https://kotiboxglobaltech.online',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// === SECURITY & LOGGING ===
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === API ROOT WELCOME (MUST BE FIRST) ===
app.get('/api/', (req, res) => {
  res.json({
    message: 'Xoto API is LIVE!',
    status: 'success',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    docs: 'https://kotiboxglobaltech.online/api/docs',
    endpoints: [
      '/api/users',
      '/api/auth/login',
      '/api/products'
    ]
  });
});

// === MAIN API ROUTES ===
app.use('/api/', require('./src/app'));

// === 404 HANDLER (MUST BE AFTER ALL ROUTES) ===
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
      console.log(`MongoDB connected: ${process.env.MONGO_URI}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();