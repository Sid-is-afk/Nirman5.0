const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const admin = require("firebase-admin");
const path = require('path');

// --- 1. SETUP FIREBASE ADMIN ---
// This initializes the Firebase Admin SDK so your backend can talk to Firebase.
// We use a try-catch block to prevent errors if it's already initialized.
try {
  if (!admin.apps.length) {
    // Path to your service account key file
    // MAKE SURE this path is correct relative to where you run the server
    // You need to download this JSON from Firebase Console -> Project Settings -> Service Accounts
    const serviceAccount = require(path.join(__dirname, '../config/serviceAccountKey.json'));
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("✅ Firebase Admin Initialized");
  }
} catch (error) {
  console.error("❌ Firebase Admin Initialization Error:", error);
  console.log("⚠  Google Login will NOT work until serviceAccountKey.json is added to backend/config/");
}

const JWT_SECRET = process.env.JWT_SECRET || "agri_sentry_secret_key_123";

// --- 2. REGISTER (Sign Up - Email/Phone) ---
router.post('/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email || "placeholder_non_existent_email" }, 
        { phone: phone || "placeholder_non_existent_phone" }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ message: "User with this email or phone already exists." });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      name,
      email: email || undefined,
      phone: phone || undefined,
      password: hashedPassword
    });

    const savedUser = await newUser.save();

    // Generate Token
    const token = jwt.sign({ id: savedUser._id }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      token,
      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        phone: savedUser.phone,
        role: savedUser.role
      }
    });

  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ message: "Server Error during Signup" });
  }
});

// --- 3. LOGIN (Sign In - Email/Phone) ---
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email OR phone

    // Find user by Email OR Phone
    const user = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }]
    });

    if (!user) {
      return res.status(400).json({ message: "User not found." });
    }

    // Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials." });
    }

    // Return User Info
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server Error during Login" });
  }
});

// --- 4. GOOGLE LOGIN ROUTE (The New Part) ---
router.post('/google', async (req, res) => {
  const { token } = req.body; // Token received from Frontend (Firebase)

  if (!token) {
      return res.status(400).json({ message: "No token provided." });
  }

  try {
    // A. Verify the token with Firebase
    // This ensures the token is valid and really came from Google
    const decodedValue = await admin.auth().verifyIdToken(token);
    const { email, name, picture } = decodedValue;

    console.log("Google User Verified:", email);

    // B. Check if this user exists in YOUR MongoDB
    let user = await User.findOne({ email });

    if (!user) {
      // C. If not found, create a new user automatically!
      // We generate a random password placeholder since they use Google to login
      const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);

      user = new User({
        name: name || "Google User",
        email: email,
        password: hashedPassword, 
        // avatar: picture, // Optional: Save their Google profile pic if you add 'avatar' to User model
        role: 'farmer'
      });
      
      await user.save();
      console.log("New Google User Created in MongoDB");
    }

    // D. Create a session token (JWT) for your app
    // This is what your frontend will use for future requests to your API
    const appToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

    // E. Send user info back to React
    res.json({
      token: appToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
     
      }
    });

  } catch (e) {
    console.error("Google Auth Error:", e);
    res.status(401).json({ message: "Invalid Google Token or Firebase Error" });
  }
});

module.exports = router;