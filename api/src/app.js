const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const env = require('./config/env');
const authRoutes = require('./routes/auth.routes');
const routineRoutes = require('./routes/routine.routes');
const accessRoutes = require('./routes/access.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const billingRoutes = require('./routes/billing.routes');
const paymentRoutes = require('./routes/payment.routes');
const workoutRoutes = require('./routes/workout.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const maintenanceRoutes = require('./routes/maintenance.routes');
const storeRoutes = require('./routes/store.routes');
const { clientRouter: storeOrderClientRoutes, adminRouter: storeOrderAdminRoutes } = require('./routes/store-order.routes');
const promotionRoutes = require('./routes/promotion.routes');
const productRoutes = require('./routes/product.routes');
const planRoutes = require('./routes/plan.routes');
const routineTemplateRoutes = require('./routes/routine-template.routes');
const muscleGroupRoutes = require('./routes/muscle-group.routes');
const exerciseDictionaryRoutes = require('./routes/exercise-dictionary.routes');
const exerciseRoutes = require('./routes/exercise.routes');
const userRoutes = require('./routes/user.routes');
const documentRoutes = require('./routes/document.routes');
const gymRoutes = require('./routes/gym.routes');
const accessDeviceRoutes = require('./routes/access-device.routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();
app.set('trust proxy', 1);
const allowedOrigins = env.CORS_ORIGINS.split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean);
app.set('allowedOrigins', allowedOrigins);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const error = new Error('Origen no permitido por CORS.');
    error.statusCode = 403;
    return callback(error);
  },
}));
// Rate limits run before body parsing so rejected requests are never read.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth/bootstrap-admin', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false }));
// Join codes are short, so guessing them is rate limited like the login.
app.use('/api/gyms/join', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
// Only routes that accept base64 images (up to 4 MB) get a larger body limit.
app.use(['/api/store', '/api/inventory', '/api/products', '/api/promotions', '/api/equipment'], express.json({ limit: '6mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.use('/api/uploads', documentRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/routines', routineRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/store/orders', storeOrderClientRoutes);
app.use('/api/sales', storeOrderAdminRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/products', productRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/routine-templates', routineTemplateRoutes);
app.use('/api/muscle-groups', muscleGroupRoutes);
app.use('/api/dictionary', exerciseDictionaryRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/users', userRoutes);
app.use('/api/gyms', gymRoutes);
app.use('/api/access-devices', accessDeviceRoutes);
app.use('/api', accessRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;