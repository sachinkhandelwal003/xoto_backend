import mongoose from 'mongoose';

const gridNotificationSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
    },
    title:         { type: String, required: true },
    message:       { type: String, required: true },
    entityId:      { type: mongoose.Schema.Types.ObjectId, default: null },
    entityModel:   { type: String, default: null },
    recipientId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    recipientModel:{ type: String, default: null }, // 'Admin' | 'Partner' | 'Agent' | 'MortgageOps' | 'XotoAdvisor'
    recipientRole: { type: String, default: null }, // 'admin' | 'partner' | 'referral_partner' | 'partner_affiliated_agent' | 'ops' | 'advisor'
    createdByName: { type: String, default: 'System' },
    createdByRole: { type: String, default: 'System' },
    isRead:        { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'xoto_gridnotifications',  // ← Grid-specific collection
  }
);

// Indexes for performance
gridNotificationSchema.index({ recipientId: 1, isRead: 1 });
gridNotificationSchema.index({ recipientRole: 1, recipientId: 1 });
gridNotificationSchema.index({ createdAt: -1 });

const GridNotification =
  mongoose.models.GridNotification ||
  mongoose.model('GridNotification', gridNotificationSchema);

export default GridNotification;