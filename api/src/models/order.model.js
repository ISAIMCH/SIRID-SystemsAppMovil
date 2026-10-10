const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
  items: { type: [orderItemSchema], required: true, validate: (items) => items.length > 0 },
  totalPrice: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'paid', 'delivered'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);