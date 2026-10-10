const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, enum: ['Suplementos', 'Ropa', 'Accesorios'], required: true },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  imageUrl: { type: String, default: '' },
  stock: { type: Number, required: true, min: 0, max: 100000, default: 0 },
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true },
}, { timestamps: true });

productSchema.index({ gymId: 1, category: 1 });

module.exports = mongoose.model('Product', productSchema);
