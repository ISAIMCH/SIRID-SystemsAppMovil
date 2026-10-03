const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, enum: ['Suplementos', 'Ropa', 'Accesorios'], required: true, index: true },
  price: { type: Number, required: true, min: 0, max: 1000000 },
  image: { type: String, default: '' },
  stock: { type: Number, required: true, min: 0, max: 100000, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
