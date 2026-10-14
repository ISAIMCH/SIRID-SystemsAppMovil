const mongoose = require('mongoose');

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
  status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending', index: true },
  paymentMethod: { type: String, trim: true, maxlength: 40 },
  reference: { type: String, trim: true, maxlength: 120 },
}, { timestamps: true });

storeOrderSchema.index({ gymId: 1, createdAt: -1 });

module.exports = mongoose.model('StoreOrder', storeOrderSchema);