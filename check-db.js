require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // Find vault advisor
  const VaultAdvisor = require('./src/modules/vault/models/XotoAdvisor');
  const advisors = await VaultAdvisor.find({}).limit(3).lean();
  console.log('\n=== VAULT ADVISORS ===');
  advisors.forEach(a => console.log('email:', a.email, '| name:', a.name?.first_name, a.name?.last_name));

  // Find vault admin (AllUsers with role code 18)
  const AllUsers = require('./src/modules/auth/models/user/user.model');
  const { Role } = require('./src/modules/auth/models/role/role.model');
  const adminRole = await Role.findOne({ code: '18' }).lean();
  console.log('\n=== ADMIN ROLE ===', adminRole?._id, adminRole?.code, adminRole?.name);

  if (adminRole) {
    const admins = await AllUsers.find({ role: adminRole._id }).limit(3).lean();
    console.log('\n=== ADMIN USERS ===');
    admins.forEach(a => console.log('email:', a.email, '| type:', a.type));
  }

  // Check what vault leads are Qualified
  const VaultLead = require('./src/modules/vault/models/VaultLead');
  const qualifiedLeads = await VaultLead.find({ currentStatus: 'Qualified', isDeleted: false }).limit(3).lean();
  console.log('\n=== QUALIFIED LEADS ===', qualifiedLeads.length);
  qualifiedLeads.forEach(l => console.log('id:', l._id, '| name:', l.customerInfo?.firstName, l.customerInfo?.lastName, '| status:', l.currentStatus));

  await mongoose.disconnect();
}

main().catch(console.error);
