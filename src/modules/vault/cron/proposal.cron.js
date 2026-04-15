const Proposal = require('../models/Proposal');

const runProposalExpiryJob = async () => {
  try {
    console.log("Running proposal expiry job...");

    await Proposal.updateMany(
      {
        expiresAt: { $lt: new Date() },
        status: { $nin: ['Accepted', 'Rejected'] }
      },
      {
        status: 'Expired'
      }
    );

    console.log("Expiry job completed");
  } catch (error) {
    console.error("Cron error:", error);
  }
};

module.exports = runProposalExpiryJob;