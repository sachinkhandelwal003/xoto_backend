require('dotenv').config();
const express  = require('express');
const helmet   = require('helmet');
const morgan   = require('morgan');
const createError = require('http-errors');
const cors     = require('cors');
const connectDB = require('./src/config/database');
const path     = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'https://xoto.ae',
    'https://www.xoto.ae',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads',     express.static(path.join(__dirname, 'uploads')));

app.get('/api/', (req, res) => {
  res.json({ message: 'Xoto API is LIVE!', status: 'success' });
});

app.use('/api/', require('./src/app'));

app.use((req, res, next) => next(createError.NotFound()));
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: { status: err.status || 500, message: err.message }
  });
});

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