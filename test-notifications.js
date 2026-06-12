import connectDB from './src/config/database.js';
import { emitGridNotification } from './src/modules/Grid/Notification/gridnotificationservice.js';
import { io as Client } from 'socket.io-client';
import mongoose from 'mongoose';

async function runTest() {
  console.log('Connecting to database...');
  await connectDB();

  // Connect to local Socket.io server
  console.log('Connecting to local Socket.io server on port 5000...');
  const socket = Client('http://localhost:5000', {
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('Client socket connected successfully.');

    // 1. Join room
    console.log('Emitting grid:join...');
    socket.emit('grid:join', { roleSlug: 'admin', userId: '60c72b2f9b1d8e2354c7a6e1' });
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error. Make sure your server is running (npm run dev) in another terminal:', err.message);
    mongoose.connection.close();
    process.exit(1);
  });

  socket.on('grid:joined', async (data) => {
    console.log('Joined grid room successfully:', data);

    // 2. Trigger notification
    console.log('Triggering grid notification from service...');
    await emitGridNotification({
      eventType: 'TEST_EVENT',
      title: 'Hello Grid!',
      message: 'This is a test notification for Grid.',
      recipientRole: 'admin'
    });
  });

  socket.on('grid:notification', (payload) => {
    console.log('\n==================================================');
    console.log('🎉 SUCCESS! Received grid:notification payload:');
    console.log(payload);
    console.log('==================================================\n');
    
    // Clean up
    socket.disconnect();
    mongoose.connection.close();
    process.exit(0);
  });

  // Timeout fallback
  setTimeout(() => {
    console.error('Test timed out. Please ensure the backend server is running on port 5000.');
    socket.disconnect();
    mongoose.connection.close();
    process.exit(1);
  }, 10000);
}

runTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
