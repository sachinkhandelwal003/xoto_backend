import mongoose from 'mongoose';

const vaultNotificationSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        // Lead events
        'LEAD_CREATED',
        'LEAD_CREATED_WEBSITE',
        'LEAD_CREATED_PARTNER',
        'LEAD_CREATED_ADMIN',
        'LEAD_STATUS_UPDATED',
        'LEAD_ASSIGNED',
        // Proposal events
        'PROPOSAL_CREATED',
        // Case events
        'CASE_CREATED',
        'CASE_SUBMITTED',
        'CASE_PICKED_UP',
        'CASE_ASSIGNED_TO_OPS',
        'CASE_STATUS_UPDATED',
        // Commission events
        'COMMISSION_CREATED',
        'COMMISSION_CONFIRMED',
        'COMMISSION_PAID',
        // Partner & other
        'PARTNER_CREATED',
        'BANK_CREATED',
        'BANK_PRODUCT_CREATED',
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
