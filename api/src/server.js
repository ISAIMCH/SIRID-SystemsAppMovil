const app = require('./app');
const env = require('./config/env');
const connectDatabase = require('./config/database');
const mongoose = require('mongoose');

async function startServer() {
  await connectDatabase();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`GymGo API escuchando en el puerto ${env.PORT}.`);
  });

  async function shutdown(signal) {
    console.log(`Señal ${signal} recibida; cerrando el servidor.`);
    server.close(async () => {
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