const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const authMiddleware = require('../middleware/auth');

// @route   GET /api/dashboard/stats
// @desc    Get tailored dashboard stats based on user's goal
// @access  Private
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const goal = req.user.goal || 'buying'; // Default to buying if no goal is set

    // Mock dynamic data based on personalization goal
    let payload = {
      user: {
        fullName: req.user.fullName,
        goal: req.user.goal
      },
      recentInquiries: [],
      marketPredictions: {
        location: '',
        growthIndex: '',
        value: '',
        volatility: '',
        growthPercent: '',
        peakDate: ''
      },
      complianceAlert: ''
    };

    switch (goal) {
      case 'investing':
        payload.recentInquiries = ['Commercial Plaza ROI', 'Multifamily Units Texas', 'Industrial Warehouses'];
        payload.marketPredictions = {
          location: 'Austin, TX',
          growthIndex: '+6.2% YoY',
          value: '$4.5M',
          volatility: 'High',
          growthPercent: '+14.1% YoY',
          peakDate: 'Q2 2027'
        };
        payload.complianceAlert = 'Update to Regulation D applies to current syndication listings.';
        break;
      case 'selling':
        payload.recentInquiries = ['Home Value Estimator', 'Curb Appeal ROI', 'Staging Costs 2026'];
        payload.marketPredictions = {
          location: 'San Diego, CA',
          growthIndex: '+2.1% YoY',
          value: '$1.2M',
          volatility: 'Low',
          growthPercent: '+4.5% YoY',
          peakDate: 'Q3 2026'
        };
        payload.complianceAlert = 'New Seller Disclosure requirements in California.';
        break;
      case 'analysis':
        payload.recentInquiries = ['NYC Office Vacancy Rates', 'Suburban Shift Data', 'Interest Rate Impact'];
        payload.marketPredictions = {
          location: 'Global Index',
          growthIndex: '+1.8% YoY',
          value: 'Index 142.4',
          volatility: 'Medium',
          growthPercent: '+2.2% YoY',
          peakDate: 'Q1 2027'
        };
        payload.complianceAlert = 'Data privacy policy updates for international scraping.';
        break;
      case 'buying':
      default:
        payload.recentInquiries = ['3BR Luxury Condo Downtown', 'Waterfront Villa under 2M', 'Kyoto Forest'];
        payload.marketPredictions = {
          location: 'Ubud, Bali',
          growthIndex: '+4.2% YoY',
          value: '$2.1M',
          volatility: 'Medium',
          growthPercent: '+12.4% YoY',
          peakDate: 'Q4 2026'
        };
        payload.complianceAlert = 'Update to Regulation Z applies to current listings.';
        break;
    }

    res.json(payload);
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ message: 'Server error fetching dashboard stats' });
  }
});

module.exports = router;
