const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = {
      hostname: 'localhost', port: 5000, path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    };
    const req = http.request(opts, res => {
      let s = '';
      res.on('data', d => s += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Step 1: Login as admin to get a token
  console.log('\n=== STEP 1: LOGIN ===');
  const login = await post('/api/auth/login', {
    email: process.env.TEST_EMAIL || 'admin@xoto.ae',
    password: process.env.TEST_PASS || 'Admin@123'
  });
  console.log('Login status:', login.status);

  if (!login.body?.data?.token && !login.body?.token) {
    console.log('Login failed:', JSON.stringify(login.body, null, 2));
    return;
  }

  const token = login.body?.data?.token || login.body?.token;
  console.log('Token obtained:', token.substring(0, 30) + '...');
  console.log('User role:', login.body?.data?.user?.role || login.body?.user?.role);

  // Step 2: Get qualified leads
  console.log('\n=== STEP 2: GET QUALIFIED LEADS ===');
  const leadsRes = await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 5000,
      path: '/api/vault/lead/admin/all?status=Qualified&page=1&limit=5',
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
    const req = http.request(opts, res => {
      let s = ''; res.on('data', d => s += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s) }));
    });
    req.on('error', reject);
    req.end();
  });
  console.log('Leads status:', leadsRes.status);
  const leads = leadsRes.body?.data || [];
  console.log('Qualified leads count:', leads.length);
  if (leads.length === 0) {
    console.log('No qualified leads found!');
    return;
  }

  const lead = leads[0];
  const leadId = lead._id;
  console.log('Using lead:', leadId, '| name:', lead.customerInfo?.firstName, lead.customerInfo?.lastName);
  console.log('Lead status:', lead.currentStatus);

  // Step 3: Try creating a case
  console.log('\n=== STEP 3: CREATE CASE ===');
  const ref = `XOTO-APP-${Date.now()}`;
  const caseRes = await post('/api/vault/cases', {
    sourceLeadId: leadId,
    caseReference: ref,
    clientInfo: {
      firstName:           lead.customerInfo?.firstName || 'Test',
      lastName:            lead.customerInfo?.lastName  || 'User',
      fullName:            `${lead.customerInfo?.firstName || 'Test'} ${lead.customerInfo?.lastName || 'User'}`,
      email:               lead.customerInfo?.email      || null,
      phone:               lead.customerInfo?.mobileNumber || null,
      mobile:              lead.customerInfo?.mobileNumber || null,
      nationality:         lead.customerInfo?.nationality || null,
      residencyStatus:     lead.customerInfo?.residencyStatus || null,
      employmentStatus:    lead.customerInfo?.employmentStatus || null,
      monthlySalary:       lead.customerInfo?.monthlySalary || 0,
      existingLiabilities: lead.customerInfo?.existingLiabilities || 0,
      mortgageTerm:        25,
      feeFinancingRequired: false,
    },
    propertyInfo: {
      propertyValue:   lead.propertyDetails?.propertyValue || 1500000,
      loanAmount:      lead.propertyDetails?.loanAmountRequired || 1200000,
      downPayment:     lead.propertyDetails?.downPaymentAmount || 300000,
      propertyType:    lead.propertyDetails?.propertyType || null,
      transactionType: lead.propertyDetails?.transactionType || null,
      propertyAddress: { area: '', city: 'Dubai' }
    },
    loanInfo: { tenureYears: 25 },
    applicationSubType: 'standard',
    internalNotes: [],
    customerNotes: [],
    currentStatus: 'Draft',
  }, token);

  console.log('Create case status:', caseRes.status);
  console.log('Response:', JSON.stringify(caseRes.body, null, 2));
}

main().catch(err => console.error('FATAL:', err.message));
