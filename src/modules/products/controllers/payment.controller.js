import EcommerceCartItem from "../models/EcommerceCart.js";
import Purchase from "../models/Purchase.js";
import axios from "axios";
const sendEmail = require("../../../utils/sendEmail.js");               


// ─────────────────────────────────────────────────
// Helper — Order Confirmation Email HTML
// ─────────────────────────────────────────────────
const buildOrderEmailHTML = ({ customerName, orderId, items, totalPrice, deliveryAddress, paymentMethod }) => {

  const itemRows = items?.map(item => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <div style="font-weight:600;color:#1e1b4b;font-size:14px;">
          ${item.productId?.name || "Product"}
        </div>
        ${item.productColorId?.colourName 
          ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">Color: ${item.productColorId.colourName}</div>` 
          : ""}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:center;color:#64748b;font-size:14px;">
        x${item.quantity}
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#4f46e5;font-size:14px;">
        AED ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
      </td>
    </tr>
  `).join("") || "<tr><td colspan='3' style='padding:12px;color:#94a3b8;text-align:center;'>No items</td></tr>";

  const addressBlock = deliveryAddress ? `
    <div style="background:#f5f3ff;border:1.5px solid #c7d2fe;border-radius:12px;padding:16px 20px;margin-top:8px;">
      <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px;">
        📍 Delivery Address
      </p>
      <p style="color:#1e1b4b;font-size:14px;line-height:1.7;margin:0;">
        ${deliveryAddress.fullName || ""}<br/>
        ${deliveryAddress.addressLine || ""}<br/>
        ${deliveryAddress.city || ""}, ${deliveryAddress.emirate || ""}<br/>
        ${deliveryAddress.country || "UAE"}
      </p>
    </div>
  ` : "";

  const paymentBadge = {
    cod:    { label: "💵 Cash on Delivery", bg: "#fefce8", color: "#a16207", border: "#fde68a" },
    tabby:  { label: "🟢 Tabby — Pay Later", bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    tamara: { label: "⚫ Tamara — Pay in 3", bg: "#f8fafc", color: "#1e293b", border: "#e2e8f0" },
    online: { label: "💳 Online Payment",    bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  }[paymentMethod] || { label: "Online Payment", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:40px 0;">
  <tr><td align="center">
  <table width="580" cellpadding="0" cellspacing="0"
    style="background:#ffffff;border-radius:20px;overflow:hidden;
           box-shadow:0 4px 24px rgba(99,102,241,0.12);">

    <!-- Header -->
    <tr>
      <td style="padding:32px 40px;text-align:center;border-bottom:3px solid #6366f1;
                 background:linear-gradient(135deg,#eef2ff 0%,#f5f3ff 100%);">
        <img
          src="https://xotostaging.s3.me-central-1.amazonaws.com/properties/1774009493065-logonew2%20%281%29.png"
          alt="Xoto" width="130"
          style="display:block;margin:0 auto 10px;"
        />
        <p style="color:#6366f1;margin:0;font-size:12px;letter-spacing:1.5px;
                  text-transform:uppercase;font-weight:700;">
          Order Confirmation
        </p>
      </td>
    </tr>

    <!-- Body -->
    <tr><td style="padding:36px 40px;">

      <!-- Check icon + heading -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:linear-gradient(135deg,#ede9fe,#dbeafe);
                    border-radius:50%;width:68px;height:68px;line-height:68px;text-align:center;">
          <span style="font-size:30px;">✅</span>
        </div>
      </div>

      <h2 style="color:#1e1b4b;margin:0 0 8px;font-size:24px;text-align:center;font-weight:700;">
        Your Order is Confirmed! 🎉
      </h2>
      <p style="color:#64748b;text-align:center;font-size:14px;line-height:1.7;margin:0 0 28px;">
        Hi <strong>${customerName || "there"}</strong>, thank you for shopping with <strong style="color:#6366f1;">Xoto</strong>.<br/>
        We're preparing your order and will keep you updated.
      </p>

      <!-- Order ID chip -->
      <div style="background:linear-gradient(135deg,#f5f3ff,#eef2ff);border:1.5px solid #c7d2fe;
                  border-radius:12px;padding:14px 20px;display:flex;
                  justify-content:space-between;margin-bottom:24px;">
        <div>
          <p style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.08em;margin:0 0 4px;">Order ID</p>
          <p style="font-size:16px;font-weight:800;color:#4f46e5;margin:0;letter-spacing:0.04em;">
            ${orderId}
          </p>
        </div>
        <div>
          <p style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;
                    letter-spacing:0.08em;margin:0 0 4px;">Payment</p>
          <span style="background:${paymentBadge.bg};border:1px solid ${paymentBadge.border};
                        color:${paymentBadge.color};font-size:12px;font-weight:600;
                        padding:4px 12px;border-radius:99px;display:inline-block;">
            ${paymentBadge.label}
          </span>
        </div>
      </div>

      <!-- Items table -->
      <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;
                letter-spacing:0.08em;margin:0 0 10px;">Order Items</p>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="border:1.5px solid #e8eaf6;border-radius:12px;overflow:hidden;margin-bottom:24px;">
        <thead>
          <tr style="background:#fafbff;">
            <th style="padding:10px 16px;text-align:left;font-size:11px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:700;">Product</th>
            <th style="padding:10px 16px;text-align:center;font-size:11px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:700;">Qty</th>
            <th style="padding:10px 16px;text-align:right;font-size:11px;color:#94a3b8;
                       text-transform:uppercase;letter-spacing:0.07em;font-weight:700;">Total</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="background:linear-gradient(135deg,#f5f3ff,#eef2ff);">
            <td colspan="2" style="padding:14px 16px;font-weight:700;color:#1e1b4b;font-size:14px;">
              Grand Total
            </td>
            <td style="padding:14px 16px;text-align:right;font-weight:800;
                       color:#4f46e5;font-size:18px;">
              AED ${Number(totalPrice).toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Address -->
      ${addressBlock}

      <!-- Info chips -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr>
          <td style="text-align:center;padding:0 6px;">
            <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:12px 8px;">
              <div style="font-size:20px;margin-bottom:4px;">🚚</div>
              <p style="font-size:11px;font-weight:700;color:#15803d;margin:0;">Free Delivery</p>
            </div>
          </td>
          <td style="text-align:center;padding:0 6px;">
            <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:12px 8px;">
              <div style="font-size:20px;margin-bottom:4px;">🔄</div>
              <p style="font-size:11px;font-weight:700;color:#1d4ed8;margin:0;">Easy Returns</p>
            </div>
          </td>
          <td style="text-align:center;padding:0 6px;">
            <div style="background:#fdf4ff;border:1.5px solid #e9d5ff;border-radius:12px;padding:12px 8px;">
              <div style="font-size:20px;margin-bottom:4px;">🛡️</div>
              <p style="font-size:11px;font-weight:700;color:#7e22ce;margin:0;">Secure Order</p>
            </div>
          </td>
        </tr>
      </table>

    </td></tr>

    <!-- Footer -->
    <tr>
      <td style="background:linear-gradient(135deg,#eef2ff,#f5f3ff);
                 padding:24px 40px;text-align:center;border-top:1px solid #e0e4f5;">
        <p style="color:#6366f1;font-size:13px;font-weight:700;margin:0 0 4px;">xoto.ae</p>
        <p style="color:#94a3b8;font-size:11px;margin:0;">
          © ${new Date().getFullYear()} Xoto · All rights reserved · Dubai, UAE
        </p>
        <p style="color:#c7d2fe;font-size:11px;margin:8px 0 0;">
          Powered by AI. Inspired by you.
        </p>
      </td>
    </tr>

  </table>
  </td></tr>
  </table>
</body>
</html>`;
};

// ─────────────────────────────────────────────────
// Helper — Cart fetch karo
// ─────────────────────────────────────────────────
const getCartItems = async (customerId) => {
  return await EcommerceCartItem.find({
    customerId,
    converted_to_deal: false,
  }).populate("productId productColorId customerId"); 
};

// ─────────────────────────────────────────────────
// Helper — Cart ko purchased mark karo
// ─────────────────────────────────────────────────
const markCartPurchased = async (cartItems) => {
  await Promise.all(
    cartItems.map((item) =>
      EcommerceCartItem.findByIdAndUpdate(item._id, {
        converted_to_deal: true,
      })
    )
  );
};

// ─────────────────────────────────────────────────
// POST /products/cart/cod
// Cash on Delivery
// ─────────────────────────────────────────────────
export const cashOnDelivery = async (req, res) => {
  try {
    const { customerId } = req.query;
    const { address } = req.body;

    if (!customerId || !address) {
      return res.status(400).json({
        success: false,
        message: "customerId and address are required.",
      });
    }

    // Address validation
    const required = ["fullName", "email", "phone", "addressLine", "city", "emirate"];
    for (let field of required) {
      if (!address[field]?.trim()) {
        return res.status(400).json({
          success: false,
          message: `${field} is required in address.`,
        });
      }
    }

    // Cart items fetch karo
    const cartItems = await getCartItems(customerId);

    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items in cart.",
      });
    }

    // Total calculate karo
    const total_price = cartItems.reduce(
      (acc, item) => acc + Number(item.price) * Number(item.quantity || 1),
      0
    );

    // Purchase create karo
    const purchase = await Purchase.create({
      EcommerceCartitems: cartItems.map((i) => i._id),
      customer_id: customerId,
      total_price,
      status: "pending", // COD mein pending rahega jab tak deliver na ho
      payment_method: "cod",
      delivery_address: address,
      payment_id: null,
    });

    // Cart items mark as purchased
await markCartPurchased(cartItems);


    // ✅ EMAIL BHEJO
    try {
      await sendEmail({
        to: address.email,
        subject: `Order Confirmed — ${purchase._id.toString().slice(-7).toUpperCase()} | Xoto`,
        html: buildOrderEmailHTML({
          customerName: address.fullName,
          orderId: purchase._id.toString().slice(-7).toUpperCase(),
          items: cartItems,
          totalPrice: total_price,
          deliveryAddress: address,
          paymentMethod: "cod",
        }),
      });
    } catch (emailErr) {
      console.error("COD email failed:", emailErr.message); // order cancel mat karo
      console.error("❌ EMAIL FULL ERROR:", emailErr);
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully! Pay on delivery.",
      data: {
        orderId: purchase._id,
        total: total_price,
        paymentMethod: "Cash on Delivery",
        status: "pending",
      },
    });

  } catch (err) {
    console.error("COD Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────
// POST /products/cart/tabby-session
// Tabby — Create Checkout Session
// ─────────────────────────────────────────────────
export const createTabbySession = async (req, res) => {
  try {
    const { customerId, address, amount, currency, items, buyer } = req.body;

    if (!customerId || !address || !amount) {
      return res.status(400).json({
        success: false,
        message: "customerId, address and amount are required.",
      });
    }

    const payload = {
      payment: {
        amount: amount.toFixed(2),
        currency: currency || "AED",
        description: "xoto.ae Order",
        buyer: {
          phone: buyer.phone,
          email: buyer.email,
          name: buyer.name,
        },
        shipping_address: {
          city: address.city,
          address: address.addressLine,
          zip: address.zipCode || "00000",
        },
        order: {
          tax_amount: "0.00",
          shipping_amount: "0.00",
          discount_amount: "0.00",
          updated_at: new Date().toISOString(),
          reference_id: `xoto_${Date.now()}`,
          items: items.map((item) => ({
            title: item.title,
            description: item.title,
            quantity: item.quantity,
            unit_price: item.unit_price.toFixed(2),
            discount_amount: "0.00",
            reference_id: item.title,
            image_url: "",
            product_url: `${process.env.CLIENT_URL}/ecommerce`,
            category: item.category || "General",
          })),
        },
        buyer_history: {
          registered_since: new Date().toISOString(),
          loyalty_level: 0,
        },
        order_history: [],
      },
      lang: "en",
      merchant_code: process.env.TABBY_MERCHANT_CODE,
      merchant_urls: {
        success: `${process.env.CLIENT_URL}/ecommerce/payment/success?method=tabby&customerId=${customerId}`,
        cancel: `${process.env.CLIENT_URL}/ecommerce/cart`,
        failure: `${process.env.CLIENT_URL}/ecommerce/payment/failed`,
      },
    };

    const response = await axios.post(
      "https://api.tabby.ai/api/v2/checkout",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const checkoutUrl = response.data?.configuration?.available_products
      ?.installments?.[0]?.web_url;

    if (!checkoutUrl) {
      return res.status(400).json({
        success: false,
        message: "Tabby checkout URL not available.",
        details: response.data,
      });
    }

    return res.status(200).json({
      success: true,
      checkout_url: checkoutUrl,
      session_id: response.data?.id,
    });

  } catch (err) {
    console.error("Tabby Error:", err.response?.data || err);
    return res.status(500).json({
      success: false,
      message: "Tabby session creation failed.",
      error: err.response?.data || err.message,
    });
  }
};

// ─────────────────────────────────────────────────
// POST /products/cart/tamara-session
// Tamara — Create Checkout Session
// ─────────────────────────────────────────────────
export const createTamaraSession = async (req, res) => {
  try {
    const { customerId, address, amount, currency, items, consumer, shipping_address } = req.body;

    if (!customerId || !address || !amount) {
      return res.status(400).json({
        success: false,
        message: "customerId, address and amount are required.",
      });
    }

    const payload = {
      order_reference_id: `xoto_${Date.now()}`,
      total_amount: {
        amount: amount.toFixed(2),
        currency: currency || "AED",
      },
      description: "xoto.ae Order",
      country_code: "AE",
      payment_type: "PAY_BY_INSTALMENTS",
      instalments: 3,
      items: items.map((item) => ({
        reference_id: `item_${Date.now()}`,
        type: item.type || "Physical",
        name: item.name,
        sku: item.name,
        quantity: item.quantity,
        unit_price: {
          amount: item.unit_price.toFixed(2),
          currency: currency || "AED",
        },
        discount_amount: { amount: "0.00", currency: currency || "AED" },
        total_amount: {
          amount: (item.unit_price * item.quantity).toFixed(2),
          currency: currency || "AED",
        },
      })),
      consumer: {
        first_name: consumer.first_name,
        last_name: consumer.last_name || "",
        phone_number: consumer.phone_number,
        email: consumer.email,
      },
      billing_address: {
        first_name: consumer.first_name,
        last_name: consumer.last_name || "",
        line1: address.addressLine,
        city: address.city,
        country_code: "AE",
      },
      shipping_address: {
        first_name: consumer.first_name,
        last_name: consumer.last_name || "",
        line1: address.addressLine,
        city: address.city,
        country_code: "AE",
      },
      merchant_url: {
        success: `${process.env.CLIENT_URL}/ecommerce/payment/success?method=tamara&customerId=${customerId}`,
        failure: `${process.env.CLIENT_URL}/ecommerce/payment/failed`,
        cancel: `${process.env.CLIENT_URL}/ecommerce/cart`,
        notification: `${process.env.CLIENT_URL}/api/products/cart/tamara-webhook`,
      },
    };

    const response = await axios.post(
      `${process.env.TAMARA_API_URL}/checkout`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.TAMARA_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    const checkoutUrl = response.data?.checkout_url;

    if (!checkoutUrl) {
      return res.status(400).json({
        success: false,
        message: "Tamara checkout URL not available.",
        details: response.data,
      });
    }

    return res.status(200).json({
      success: true,
      checkout_url: checkoutUrl,
      order_id: response.data?.order_id,
    });

  } catch (err) {
    console.error("Tamara Error:", err.response?.data || err);
    return res.status(500).json({
      success: false,
      message: "Tamara session creation failed.",
      error: err.response?.data || err.message,
    });
  }
};

// ─────────────────────────────────────────────────
// GET /products/cart/payment/success
// Payment success ke baad cart clear karo
// ─────────────────────────────────────────────────
export const paymentSuccess = async (req, res) => {
  try {
    const { customerId, method } = req.query;
    if (!customerId) { /* ... */ }

    const cartItems = await getCartItems(customerId);
    if (cartItems.length === 0) {
      return res.status(200).json({ success: true, message: "Order already processed." });
    }

    const total_price = cartItems.reduce(
      (acc, item) => acc + Number(item.price) * Number(item.quantity || 1), 0
    );

    const purchase = await Purchase.create({
      EcommerceCartitems: cartItems.map((i) => i._id),
      customer_id: customerId,
      total_price,
      status: "paid",
      payment_method: method || "online",
      payment_id: `${method}_${Date.now()}`,
    });

    await markCartPurchased(cartItems);

    // ✅ Customer email fetch karo aur mail bhejo
    try {
      // Cart item se customer info milegi populate ke baad
      const firstItem = cartItems[0];
      const customerEmail =
        firstItem?.customerId?.email ||        // agar customerId populated hai
        purchase?.delivery_address?.email ||   // COD address se
        null;

      if (customerEmail) {
        await sendEmail({
          to: customerEmail,
          subject: `Payment Confirmed — ${purchase._id.toString().slice(-7).toUpperCase()} | Xoto`,
          html: buildOrderEmailHTML({
            customerName: firstItem?.customerId?.name || "Customer",
            orderId: purchase._id.toString().slice(-7).toUpperCase(),
            items: cartItems,
            totalPrice: total_price,
            deliveryAddress: null,
            paymentMethod: method || "online",
          }),
        });
      }
    } catch (emailErr) {
      console.error("Payment success email failed:", emailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Payment successful! Order confirmed.",
    });

  } catch (err) {
    console.error("Payment Success Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

