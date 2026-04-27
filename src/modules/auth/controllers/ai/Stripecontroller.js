const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ 1. Customer Model Import 
const Customer = require('../../models/user/customer.model'); 

// ==========================================
// 🛒 1. CREATE CHECKOUT SESSION
// ==========================================
exports.createCheckoutSession = async (req, res) => {
  try {
    const { userId } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription', 
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      // Saving userId in metadata for the webhook
      metadata: { userId }, 
      
      // 🔥 CHANGED HERE: Redirecting directly to the AI Planner landscape page
      success_url: `${process.env.FRONTEND_URL}/aiPlanner/landscape?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/aiPlanner/landscape?payment=cancelled`,
    });

    res.json({ url: session.url });

  } catch (err) {
    console.error("🔴 STRIPE SESSION ERROR:", err.message);
    res.status(500).json({ error: 'Failed to create session' });
  }
};

// ==========================================
// 🎧 2. STRIPE WEBHOOK HANDLER
// ==========================================
exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  // 1. Verify Signature
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log(`❌ Webhook Signature Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 2. Handle Successful Payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;

    // 🕵️ DEBUGGING LOGS (Now in English)
    console.log("-----------------------------------------");
    console.log("🔍 Received userId from Stripe:", userId);
    console.log("-----------------------------------------");

    if (!userId) {
      console.log("❌ ERROR: Stripe did not send a userId! (Check createCheckoutSession metadata)");
      return res.json({ received: true });
    }

    // 3. Make Customer Premium in Database
    try {
      const updatedUser = await Customer.findByIdAndUpdate(
        userId,
        { isPremium: true },
        { new: true } // Returns the updated document
      );

      if (updatedUser) {
        console.log(`✅ SUCCESS! Customer (${updatedUser.email}) is now Premium!`);
      } else {
        console.log(`❌ ERROR: No Customer found in database with ID (${userId})!`);
      }
    } catch (err) {
      console.log("❌ Database Update Error:", err.message);
    }
  }

  // Acknowledge receipt of the event
  res.json({ received: true });
};