const mongoose = require('mongoose');
const tenantPlugin = require('./plugins/tenant.plugin');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
}, { _id: false });

const storeOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
  items: { type: [orderItemSchema], required: true, validate: (items) => items.length > 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  promotionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion', default: null },
  discountApplied: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending', index: true },
  paymentMethod: { type: String, trim: true, maxlength: 40 },
  reference: { type: String, trim: true, maxlength: 120 },
  pickupPin: { type: String, trim: true, uppercase: true, minlength: 4, maxlength: 4 },
}, { timestamps: true });

storeOrderSchema.index({ gymId: 1, createdAt: -1 });
// Reception redeems by PIN, so it must be unique among pending orders.
storeOrderSchema.index({ pickupPin: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'pickupPin_pending_unique' });

storeOrderSchema.plugin(tenantPlugin, { gym: true });

module.exports = mongoose.model('StoreOrder', storeOrderSchema);