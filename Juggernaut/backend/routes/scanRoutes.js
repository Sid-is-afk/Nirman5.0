const express = require('express');
const router = express.Router();
const User = require('../models/User');

// 1. SAVE SCAN TO PROFILE (POST /api/scans/save)
router.post('/save', async (req, res) => {
  const { userId, type, name, severity, confidence, image, resultData } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Add new scan to the beginning of the array
    user.scanHistory.unshift({
      scanType: type, // 'disease' or 'pest'
      name,
      severity,
      confidence,
      image,
      resultData
    });

    await user.save();
    res.json(user.scanHistory); // Return updated list
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error saving scan');
  }
});

// 2. GET HISTORY (GET /api/scans/history/:userId)
router.get('/history/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });
    
    // Return the full history
    res.json(user.scanHistory);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error fetching history');
  }
});

// 3. DELETE SCAN (DELETE /api/scans/delete/:userId/:scanId)
router.delete('/delete/:userId/:scanId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Filter out the item to delete
    user.scanHistory = user.scanHistory.filter(scan => scan._id.toString() !== req.params.scanId);
    
    await user.save();
    res.json(user.scanHistory);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error deleting item');
  }
});

module.exports = router;