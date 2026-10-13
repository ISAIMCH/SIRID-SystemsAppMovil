const mongoose = require('mongoose');

const catalogProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  imageUrl: { type: String, trim: true, default: '' },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('CatalogProduct', catalogProductSchema);
