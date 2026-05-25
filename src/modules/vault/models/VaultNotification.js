import mongoose from 'mongoose';

const vaultNotificationSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        'LEAD_CREATED',
        'LEAD_STATUS_UPDATED',
        'PROPOSAL_CREATED',
        'CASE_CREATED',
        'PARTNER_CREATED',
        'BANK_CREATED',
        'BANK_PRODUCT_CREATED',
        'COMMISSION_UPDATED',
        'DOCUMENT_UPLOADED',
      ],
    },
    title:         { type: String, required: true },
    message:       { type: String, required: true },
    entityId:      { type: mongoose.Schema.Types.ObjectId, default: null },
    entityModel:   { type: String, default: null },
    createdByName: { type: String, default: 'System' },
    createdByRole: { type: String, default: 'System' },
    isRead:        { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'xoto_vaultnotifications',
  }
);

const VaultNotification = mongoose.model('VaultNotification', vaultNotificationSchema);
export default VaultNotification;
