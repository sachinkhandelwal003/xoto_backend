const InventoryService = require("../../../services/inventory.service");
console.log("🔥 WHICH FILE RUNNING:", __filename);

/* ADD STOCK */
exports.addStock = async (req, res) => {
  try {
    const { productId, qty } = req.body;

    const data = await InventoryService.addStock(productId, qty);

    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/* GET INVENTORY */
exports.getInventory = async (req, res) => {
  try {
    const { productId } = req.params;

    const data = await Inventory.findOne({ product: productId });

    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};