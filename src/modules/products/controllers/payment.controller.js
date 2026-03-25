import EcommerceCartItem from "../models/EcommerceCart.js";
import Purchase from "../models/Purchase.js";
import axios from "axios";
const sendEmail = require("../../../utils/sendEmail.js");
import { trackCustomerActivity } from "../../../utils/trackCustomerActivity.js";

              


// ─────────────────────────────────────────────────
// Helper — Order Confirmation Email HTML
// ─────────────────────────────────────────────────
const buildOrderEmailHTML = ({ customerName, orderId, items, totalPrice, deliveryAddress, paymentMethod }) => {

  const itemRows = items?.map(item => `
    <tr>
      <td style="padding:14px 18px;border-bottom:1px solid #f1f5f9;">
        <div style="font-weight:600;color:#1e1b4b;font-size:14px;margin-bottom:2px;">
          ${item.productId?.name || "Product"}
        </div>
        ${item.productColorId?.colourName
          ? `<div style="font-size:12px;color:#94a3b8;">🎨 ${item.productColorId.colourName}</div>`
          : ""}
      </td>
      <td style="padding:14px 18px;border-bottom:1px solid #f1f5f9;text-align:center;">
        <span style="background:#f1f5f9;color:#64748b;font-size:13px;font-weight:600;
                     padding:4px 12px;border-radius:99px;">
          x${item.quantity}
        </span>
      </td>
      <td style="padding:14px 18px;border-bottom:1px solid #f1f5f9;text-align:right;
                 font-weight:700;color:#4f46e5;font-size:14px;">
        AED ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
      </td>
    </tr>
  `).join("") || `
    <tr>
      <td colspan="3" style="padding:16px;color:#94a3b8;text-align:center;font-size:13px;">
        No items found
      </td>
    </tr>`;

  const addressBlock = deliveryAddress ? `
    <tr>
      <td style="padding:0 40px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:#f8faff;border:1.5px solid #e0e7ff;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:14px 20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);">
              <p style="margin:0;color:#ffffff;font-size:11px;font-weight:700;
                        letter-spacing:0.1em;text-transform:uppercase;">
                📍 Delivery Address
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 20px;">
              <p style="color:#1e1b4b;font-size:14px;line-height:1.8;margin:0;font-weight:500;">
                ${deliveryAddress.fullName || ""}
              </p>
              <p style="color:#64748b;font-size:13px;line-height:1.8;margin:4px 0 0;">
                ${deliveryAddress.addressLine || ""}<br/>
                ${deliveryAddress.city || ""}, ${deliveryAddress.emirate || ""}<br/>
                ${deliveryAddress.country || "UAE"}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  ` : "";

  const paymentBadge = {
    cod:    { label: "💵 Cash on Delivery", bg: "#fefce8", color: "#a16207", border: "#fde68a" },
    tabby:  { label: "🟢 Tabby — Pay Later", bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
    tamara: { label: "⚫ Tamara — Pay in 3", bg: "#f8fafc", color: "#1e293b", border: "#e2e8f0" },
    online: { label: "💳 Online Payment",    bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  }[paymentMethod] || { label: "💳 Online Payment", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Order Confirmed — Xoto</title>
</head>
<body style="margin:0;padding:0;background:#eef2ff;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ff;padding:48px 16px;">
  <tr><td align="center">

  <table width="600" cellpadding="0" cellspacing="0"
    style="background:#ffffff;border-radius:24px;overflow:hidden;
           box-shadow:0 8px 40px rgba(99,102,241,0.13);">

    <!-- ── HEADER ── -->
    <tr>
      <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
                 padding:36px 40px;text-align:center;">
        <img
          src="https://xotostaging.s3.me-central-1.amazonaws.com/properties/1774009493065-logonew2%20%281%29.png"
          alt="Xoto" width="120"
          style="display:block;margin:0 auto 14px;filter:brightness(0) invert(1);"
        />
        <p style="color:rgba(255,255,255,0.85);margin:0;font-size:12px;
                  letter-spacing:2px;text-transform:uppercase;font-weight:600;">
          Order Confirmation
        </p>
      </td>
    </tr>

    <!-- ── SUCCESS BADGE ── -->
    <tr>
      <td style="padding:36px 40px 0;text-align:center;">
        <div style="display:inline-block;background:linear-gradient(135deg,#ede9fe,#dbeafe);
                    border-radius:50%;width:72px;height:72px;line-height:72px;
                    text-align:center;margin-bottom:20px;">
          <span style="font-size:32px;">✅</span>
        </div>
        <h1 style="color:#1e1b4b;margin:0 0 10px;font-size:26px;font-weight:800;line-height:1.2;">
          Your Order is Confirmed!
        </h1>
        <p style="color:#64748b;font-size:14px;line-height:1.8;margin:0;">
          Hi <strong style="color:#4f46e5;">${customerName || "there"}</strong>,
          thank you for shopping with <strong style="color:#6366f1;">Xoto</strong>.<br/>
          We're preparing your order right away.
        </p>
      </td>
    </tr>

    <!-- ── ORDER META STRIP ── -->
    <tr>
      <td style="padding:28px 40px 0;">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="background:linear-gradient(135deg,#f5f3ff,#eef2ff);
                 border:1.5px solid #c7d2fe;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:18px 22px;border-right:1px solid #ddd6fe;">
              <p style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.1em;margin:0 0 6px;">Order ID</p>
              <p style="font-size:17px;font-weight:800;color:#4f46e5;margin:0;
                        letter-spacing:0.04em;font-family:monospace;">
                #${orderId}
              </p>
            </td>
            <td style="padding:18px 22px;border-right:1px solid #ddd6fe;">
              <p style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.1em;margin:0 0 6px;">Payment</p>
              <span style="background:${paymentBadge.bg};border:1px solid ${paymentBadge.border};
                           color:${paymentBadge.color};font-size:12px;font-weight:700;
                           padding:4px 12px;border-radius:99px;display:inline-block;">
                ${paymentBadge.label}
              </span>
            </td>
            <td style="padding:18px 22px;">
              <p style="font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.1em;margin:0 0 6px;">Date</p>
              <p style="font-size:13px;font-weight:600;color:#1e1b4b;margin:0;">
                ${new Date().toLocaleDateString("en-AE", { day:"numeric", month:"short", year:"numeric" })}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- ── ITEMS TABLE ── -->
    <tr>
      <td style="padding:28px 40px 0;">
        <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;
                  letter-spacing:0.1em;margin:0 0 12px;">Order Items</p>
        <table width="100%" cellpadding="0" cellspacing="0"
          style="border:1.5px solid #e8eaf6;border-radius:14px;overflow:hidden;">
          <thead>
            <tr style="background:#fafbff;">
              <th style="padding:11px 18px;text-align:left;font-size:11px;color:#94a3b8;
                         font-weight:700;text-transform:uppercase;letter-spacing:0.07em;">
                Product
              </th>
              <th style="padding:11px 18px;text-align:center;font-size:11px;color:#94a3b8;
                         font-weight:700;text-transform:uppercase;letter-spacing:0.07em;">
                Qty
              </th>
              <th style="padding:11px 18px;text-align:right;font-size:11px;color:#94a3b8;
                         font-weight:700;text-transform:uppercase;letter-spacing:0.07em;">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
          <tfoot>
            <tr style="background:linear-gradient(135deg,#f5f3ff,#eef2ff);">
              <td colspan="2" style="padding:16px 18px;font-weight:700;color:#1e1b4b;font-size:14px;">
                Grand Total
              </td>
              <td style="padding:16px 18px;text-align:right;font-weight:800;
                         color:#4f46e5;font-size:20px;">
                AED ${Number(totalPrice).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </td>
    </tr>

    <!-- ── DELIVERY ADDRESS ── -->
    ${addressBlock}

    <!-- ── DIVIDER ── -->
    <tr>
      <td style="padding:32px 40px 0;">
        <div style="height:1px;background:linear-gradient(90deg,transparent,#e0e7ff,transparent);"></div>
      </td>
    </tr>

    <!-- ── SUPPORT NOTE ── -->
    <tr>
      <td style="padding:24px 40px 0;text-align:center;">
        <p style="color:#94a3b8;font-size:13px;line-height:1.7;margin:0;">
          Questions about your order? We're here to help.<br/>
          <a href="mailto:support@xoto.ae"
             style="color:#6366f1;font-weight:600;text-decoration:none;">
            support@xoto.ae
          </a>
        </p>
      </td>
    </tr>

    <!-- ── CTA BUTTON ── -->
    <tr>
      <td style="padding:24px 40px 36px;text-align:center;">
        <a href="${process.env.CLIENT_URL || "https://xoto.ae"}/ecommerce/b2c"
           style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                  color:#ffffff;text-decoration:none;padding:14px 40px;
                  border-radius:50px;font-size:15px;font-weight:700;
                  letter-spacing:0.03em;
                  box-shadow:0 6px 24px rgba(99,102,241,0.35);">
          Continue Shopping →
        </a>
      </td>
    </tr>

    <!-- ── FOOTER ── -->
    <tr>
      <td style="background:linear-gradient(135deg,#f5f3ff,#eef2ff);
                 padding:24px 40px;text-align:center;border-top:1px solid #e0e4f5;">
        <p style="color:#6366f1;font-size:13px;font-weight:700;margin:0 0 6px;">
          xoto.ae
        </p>
        <p style="color:#94a3b8;font-size:11px;margin:0;">
          © ${new Date().getFullYear()} Xoto · All rights reserved · Dubai, UAE
        </p>
        <p style="color:#c7d2fe;font-size:11px;margin:8px 0 0;">
          Powered by AI. Inspired by you.
        </p>
      </td>
    </tr>

  </table>

  <!-- Bottom spacing -->
  <tr><td style="height:32px;"></td></tr>

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

