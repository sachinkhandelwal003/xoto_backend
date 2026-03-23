const express = require("express");
const router = express.Router();
const InventoryService = require("../../services/inventory.service");

router.get("/get-vendor-inventory", async (req, res) => {
  try {
    const { vendor_id, search } = req.query;

    // 🔸 Inventory + Product join (example)
    const data = await InventoryService.getVendorInventory(vendor_id, search);

    res.json({ data });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// 🔹 Add Stock
router.post("/add", async (req, res) => {
  try {
    const { productId, qty, sku } = req.body; // ✅ no warehouseId
    const data = await InventoryService.addStock(productId, qty, sku);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔹 Reserve
router.post("/reserve", async (req, res) => {
  try {
    const { productId, qty } = req.body;
    const data = await InventoryService.reserveStock(productId, qty);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔹 Confirm
router.post("/confirm", async (req, res) => {
  try {
    const { productId, qty } = req.body;
    const data = await InventoryService.confirmStock(productId, qty);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔹 Release
router.post("/release", async (req, res) => {
  try {
    const { productId, qty } = req.body;
    const data = await InventoryService.releaseStock(productId, qty);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;