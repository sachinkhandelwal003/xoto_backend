// const { Schema, model } = require('mongoose');

// /* Counter */
// const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
// const Counter = model('Counter', counterSchema);

// /* Image */
// const imageSchema = new Schema({
//   url: { type: String, required: true },
//   is_primary: { type: Boolean, default: false },
//   verified: { type: Boolean, default: false },
//   reason: String,
//   suggestion: String,
//   uploaded_at: { type: Date, default: Date.now }
// },{ _id:true });

// /* Color Variant */
// const colorVariantSchema = new Schema({
//   color_name: { type: String, required: true },
//   color_code: String,
//   images: {
//     type: [imageSchema],
//     validate: [v => v.length <= 5, 'Max 5 images per color']
//   }
// });

// /* Product */
// const productSchema = new Schema({
//   vendor: { type: Schema.Types.ObjectId, ref: 'VendorB2C', required: true },

//   name: { type: String, required: true },
//   description: String,
//   short_description: String,
//   product_code: { type: String, unique: true },

//   category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
//   brand: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
//   material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },

//   attributes: [{ type: Schema.Types.ObjectId, ref: 'Attribute' }],
//   tags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],

//   pricing: {
//     cost_price: { type: Number, required: true },   // vendor
//     base_price: { type: Number, required: true },   // vendor
//     mrp: Number,                                    // admin
//     sale_price: Number,                             // admin
//     final_price: Number,
//     margin: Number,
//     currency: { type: Schema.Types.ObjectId, ref: 'Currency', required: true },

//     discount: {
//       type: { type: String, enum: ['percentage','fixed'] },
//       value: Number,
//       approved: { type: Boolean, default: false },
//       approved_by: { type: Schema.Types.ObjectId, ref: 'User' }
//     },

//     tax: {
//       tax_id: { type: Schema.Types.ObjectId, ref: 'Tax' },
//       rate: Number
//     }
//   },

// color_variants: {
//   type: [colorVariantSchema],
//   default: []
// }
// ,

//   verification_status: {
//     status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
//     verified_by: { type: Schema.Types.ObjectId, ref: 'User' },
//     rejection_reason: String,
//     suggestion: String,
//     verified_at: Date
//   }

// },{ timestamps:true });

// /* Auto product code */
// productSchema.pre('save', async function(next){
//   if (!this.product_code) {
//     const c = await Counter.findByIdAndUpdate(
//       { _id:'product_code' },
//       { $inc:{ seq:1 } },
//       { new:true, upsert:true }
//     );
//     this.product_code = `PRD${String(c.seq).padStart(5,'0')}`;
//   }
//   next();
// });

// /* Pricing calculation */
// productSchema.pre('save', function(next){
//   const p = this.pricing;
//   if (!p) return next();

//   p.margin = Math.max((p.base_price || 0) - (p.cost_price || 0), 0);

//   let price = p.sale_price || p.base_price;

//   if (p.discount?.approved) {
//     price = p.discount.type === 'percentage'
//       ? price - (price * p.discount.value / 100)
//       : price - p.discount.value;
//   }

//   if (p.tax?.rate) {
//     price += price * p.tax.rate / 100;
//   }

//   p.final_price = Math.max(price, 0);
//   next();
// });

// module.exports = model('ProductB2C', productSchema);
