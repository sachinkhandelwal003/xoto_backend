require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const helmet   = require('helmet');
const morgan   = require('morgan');
const createError = require('http-errors');
const cors     = require('cors');
const connectDB = require('./src/config/database');
const path     = require('path');
const Message  = require('./src/modules/chat/models/Message.model');
const { getRoomId } = require('./src/modules/chat/controllers/chat.controller');

const app    = express();
const server = http.createServer(app);

// ── Socket.io setup ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ['https://xoto.ae', 'http://localhost:5173'],
    credentials: true
  }
});

// Online users store — { userId: socketId }

const onlineUsers = {};

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // 1. Register
  socket.on('register', (userId) => {
    onlineUsers[userId] = socket.id;
    console.log(`Registered: ${userId} → ${socket.id}`);
  });

  // 2. Chat initiate
  socket.on('initiate_chat', ({ leadId, agentId, developerId, developerName }) => {
    const agentSocket = onlineUsers[agentId];
    if (agentSocket) {
      io.to(agentSocket).emit('chat_initiated', {
        leadId, developerId, developerName,
      });
    }
  });

  // 3. Send message
socket.on('send_message', async (data) => {
  try {
    const { leadId, senderId, senderType, senderName, receiverId, message } = data;

    console.log('send_message data:', data);

    if (!leadId || !senderId || !receiverId) {
      socket.emit('message_error', { error: 'Missing required fields' });
      return;
    }

    const room = getRoomId(senderId, receiverId, leadId);

    const saved = await Message.create({
      room,
      sender:     senderId,
      senderType,
      senderName: senderName || "Unknown",
      message,
      lead:       leadId,
    });

    console.log(':white_check_mark: Message saved:', saved._id);

    const payload = {
      _id:        saved._id,
      sender:     senderId,
      senderType,
      senderName: senderName || "Unknown",
      message,
      room,
      createdAt:  saved.createdAt,
    };

    // Send to receiver
    const receiverSocket = onlineUsers[receiverId];
    if (receiverSocket) {
      io.to(receiverSocket).emit('receive_message', payload);
    }

    // Send to sender
    socket.emit('receive_message', payload);

  } catch (err) {
    console.error('Message save error:', err);
    socket.emit('message_error', { error: err.message });
  }
});

  // 4. Disconnect
  socket.on('disconnect', () => {
    Object.keys(onlineUsers).forEach(uid => {
      if (onlineUsers[uid] === socket.id) {
        delete onlineUsers[uid];
      }
    });
  });
  // Approve hone pe agent ko notify karo
socket.on('approve_chat_request', ({ agentId, requestId, agentName }) => {
  const agentSocket = onlineUsers[agentId];
  if (agentSocket) {
    io.to(agentSocket).emit('chat_request_approved', {
      requestId,
      message: "Tumhari chat request approve ho gayi!",
    });
  }
});

// Reject hone pe agent ko notify karo
socket.on('reject_chat_request', ({ agentId, requestId, reason }) => {
  const agentSocket = onlineUsers[agentId];
  if (agentSocket) {
    io.to(agentSocket).emit('chat_request_rejected', {
      requestId,
      reason,
      message: "Tumhari chat request reject ho gayi.",
    });
  }
});



// Admin ne approve kiya — Agent AUR Developer dono ko notify karo
socket.on("approve_chat_request", ({ agentId, requestId, developerId }) => {
  // Agent ko notify karo
  const agentSocket = onlineUsers[agentId];
  if (agentSocket) {
    io.to(agentSocket).emit("chat_request_approved", { requestId });
  }

  // :white_check_mark: Developer ko bhi notify karo
  if (developerId) {
    const developerSocket = onlineUsers[developerId];
    if (developerSocket) {
      io.to(developerSocket).emit("chat_approved_for_developer", { requestId });
    }
  }
});

// Admin ne reject kiya — Agent ko notify karo
socket.on("reject_chat_request", ({ agentId, requestId, reason }) => {
  const agentSocket = onlineUsers[agentId];
  if (agentSocket) {
    io.to(agentSocket).emit("chat_request_rejected", { requestId, reason });
  }
});
});
//   ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: [
    'https://xoto.ae',
    'https://www.xoto.ae',   // :white_check_mark: ADD THIS (VERY IMPORTANT)
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // :white_check_mark: ADD
  allowedHeaders: ['Content-Type', 'Authorization'],   // :white_check_mark: ADD
  credentials: true
}));

// heloooooo
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
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

// ← IMPORTANT: app.listen → server.listen
const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`MongoDB connected`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

startServer();