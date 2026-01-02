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

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin"
    }
  })
);
// === SECURITY & LOGGING ===
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// === STATIC FILES (UPLOADS) ===
app.use(
  '/api/uploads',
  express.static(path.join(__dirname, 'uploads'))
);


// 1. WELCOME ROUTE
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

// === 404 HANDLER ===
app.use((req, res, next) => {
  next(createError.NotFound());
});

// === ERROR HANDLER ===
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: {
      status: err.status || 500,
      message: err.message,
    },
  });
});

// === START SERVER ===
const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`MongoDB connected`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();
