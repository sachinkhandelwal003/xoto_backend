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
const Message  = require('./src/modules/chat/models/Message.model'); // ← ADD
const { getRoomId } = require('./src/modules/chat/controllers/chat.controller'); // ← ADD

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
      socket.emit('message_error', { error: 'Missing fields' });
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

    // console.log('✅ Message saved:', saved._id);
    // console.log('Online users:', onlineUsers);

    const payload = {
      _id:        saved._id,
      sender:     senderId,
      senderType,
      senderName: senderName || "Unknown",
      message,
      room,
      createdAt:  saved.createdAt,
    };

    const receiverSocket = onlineUsers[receiverId];
    // console.log('Receiver socket:', receiverSocket);

    if (receiverSocket) {
      io.to(receiverSocket).emit('receive_message', payload);
    }

    // ✅ Sender ko SIRF EK BAAR bhejo
    socket.emit('receive_message', payload);

  } catch (err) {
    // console.error('Message save error:', err);
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
});
// ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: ['https://xoto.ae', 'http://localhost:5173'],
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