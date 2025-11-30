const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    unique: true, 
    sparse: true, 
    trim: true,
    lowercase: true
  },
  phone: { 
    type: String, 
    unique: true, 
    sparse: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: {
    type: String,
    enum: ['farmer', 'expert', 'admin'],
    default: 'farmer'
  },
  

  farmName: { type: String, default: '' },
  location: { type: String, default: '' },
  cropTypes: { type: String, default: '' },
  avatar: { type: String, default: '' },
  notifications: {
    storm: { type: Boolean, default: true },
    pest: { type: Boolean, default: true },
    market: { type: Boolean, default: false }
  },


  scanHistory: [{
    scanType: { type: String, enum: ['disease', 'pest'] }, 
    name: String,       
    severity: String,   
    confidence: Number, 
    date: { type: Date, default: Date.now },
    image: String,  
    resultData: Object  
  }],

  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('User', userSchema);