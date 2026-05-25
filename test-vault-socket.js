/**
 * VAULT REAL-TIME NOTIFICATION — TERMINAL TEST
 *
 * Usage:
 *   Terminal 1: npm run dev
 *   Terminal 2: node test-vault-socket.js
 *
 * Simulates a vault admin (roleCode 18) connecting and listening.
 * Roles that receive vault notifications: 18=Admin, 21=Partner, 22=VaultAgent, 23=Ops, 26=Advisor
 *
 * Trigger a notification by calling:
 *   POST /api/vault/lead/create   → fires LEAD_CREATED
 *   POST /api/vault/proposals/create → fires PROPOSAL_CREATED
 */

const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';
const ROLE_CODE  = process.env.ROLE_CODE  || '18'; // 18=Admin by default

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║     XOTO VAULT — Real-Time Notification Terminal Test    ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`  Server   : ${SERVER_URL}`);
console.log(`  RoleCode : ${ROLE_CODE}  (18=Admin 21=Partner 22=Agent 23=Ops 26=Advisor)`);
console.log(`  Room     : vault:notifications`);
console.log('');

const socket = io(SERVER_URL, {
  transports: ['websocket'],
  reconnectionAttempts: 5,
});

socket.on('connect', () => {
  console.log(`✅  Connected  →  socket: ${socket.id}`);
  socket.emit('vault:join', { roleCode: ROLE_CODE });
  console.log(`🔐  Sent vault:join  { roleCode: '${ROLE_CODE}' }`);
});

socket.on('vault:joined', (data) => {
  console.log(`✅  Joined room: ${data.room}`);
  console.log('');
  console.log('⏳  Waiting for vault notifications...');
  console.log('   Trigger one: POST /api/vault/lead/create  or  POST /api/vault/proposals/create');
  console.log('');
});

socket.on('vault:notification', (n) => {
  const time = new Date(n.createdAt).toLocaleTimeString();
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│         📬  VAULT NOTIFICATION RECEIVED                 │');
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│  Event   : ${n.eventType}`);
  console.log(`│  Title   : ${n.title}`);
  console.log(`│  Message : ${n.message}`);
  console.log(`│  Entity  : ${n.entityModel}  →  ${n.entityId}`);
  console.log(`│  By      : ${n.createdByName}  [${n.createdByRole}]`);
  console.log(`│  Time    : ${time}`);
  console.log('└─────────────────────────────────────────────────────────┘');
  console.log('');
});

socket.on('connect_error', (err) => {
  console.error(`❌  Cannot connect to ${SERVER_URL}: ${err.message}`);
  console.log('   Make sure the server is running first.');
});

socket.on('disconnect', (reason) => {
  console.log(`⚠️   Disconnected: ${reason}`);
});

process.on('SIGINT', () => {
  console.log('\n👋  Closing...');
  socket.disconnect();
  process.exit(0);
});
