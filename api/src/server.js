const http = require('node:http');
const { Server } = require('socket.io');
const app = require('./app');
const env = require('./config/env');
const connectDatabase = require('./config/database');
const mongoose = require('mongoose');
const { resolveUserFromToken } = require('./middlewares/auth.middleware');
const { loadDefaultTenant } = require('./utils/tenant');

const httpServer = http.createServer(app);
const allowedOrigins = app.get('allowedOrigins') ?? [];
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origen no permitido por CORS.'));
    },
    methods: ['GET', 'POST'],
  },
});

// Every socket must carry a valid JWT; events are delivered per user and per role rooms.
io.use(async (socket, next) => {
  try {
    const user = await resolveUserFromToken(socket.handshake.auth?.token);
    socket.data.user = { id: user.id, role: user.role };
    next();
  } catch (error) {
    next(new Error(error.statusCode === 401 ? error.message : 'No fue posible autenticar la conexión.'));
  }
});

io.on('connection', (socket) => {
  const { id, role } = socket.data.user;
  socket.join([`user:${id}`, `role:${role}`]);
});

app.set('io', io);

async function startServer() {
  await connectDatabase();
  await loadDefaultTenant();
  httpServer.listen(env.PORT, '0.0.0.0', () => {
    console.log(`GymGo API escuchando en el puerto ${env.PORT}.`);
  });

  async function shutdown(signal) {
    console.log(`Señal ${signal} recibida; cerrando el servidor.`);
    io.close();
    httpServer.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  console.error('No fue posible iniciar GymGo API:', error);
  process.exit(1);
});