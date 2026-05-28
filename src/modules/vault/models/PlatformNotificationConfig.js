import mongoose from 'mongoose';

const platformNotificationConfigSchema = new mongoose.Schema(
  {
    persona: {
      type: String,
      enum: ['admin', 'partner', 'referral_partner', 'partner_affiliated_agent', 'ops', 'advisor'],
      required: true,
      unique: true,
    },
    // Map of eventType -> boolean (enabled/disabled)
    preferences: {
      type: Map,
      of: Boolean,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'xoto_platform_notification_configs',
  }
);

const PlatformNotificationConfig = mongoose.models.PlatformNotificationConfig || mongoose.model('PlatformNotificationConfig', platformNotificationConfigSchema);
export default PlatformNotificationConfig;
