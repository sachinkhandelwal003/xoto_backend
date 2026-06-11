import mongoose from 'mongoose';

const systemAnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'warning', 'error', 'success'], default: 'info' },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    createdByName: { type: String, default: 'System' },
    expiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'xoto_system_announcements',
  }
);

const SystemAnnouncement = mongoose.models.SystemAnnouncement || mongoose.model('SystemAnnouncement', systemAnnouncementSchema);
export default SystemAnnouncement;
