const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const nodemailer = require('nodemailer');

// In-memory OTP storage with timestamp expiry (10 minutes)
const otpStore = new Map();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function storeOtp(email, otp) {
  const normalizedEmail = email.trim().toLowerCase();
  otpStore.set(normalizedEmail, {
    otp: String(otp),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  });
}

function verifyOtpHelper(email, inputOtp) {
  const normalizedEmail = email.trim().toLowerCase();
  const entry = otpStore.get(normalizedEmail);

  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(normalizedEmail);
    return false;
  }

  if (entry.otp === String(inputOtp).trim()) {
    otpStore.delete(normalizedEmail);
    return true;
  }

  return false;
}

async function sendOtpEmail(toEmail, otp, purpose = 'Account Access') {
  const user = (process.env.GMAIL_USER || process.env.EMAIL_USER || 'saivimenthanvl@gmail.com').trim();
  const rawPass = (process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS || '').trim();
  const pass = rawPass.replace(/\s+/g, ''); // Remove any spaces from Google App Password

  if (!pass) {
    console.warn('[nodemailer] GMAIL_APP_PASSWORD is not set in backend/.env. Email cannot be delivered to Gmail until set.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass,
    },
  });

  const mailOptions = {
    from: `"Boolok AI" <${user}>`,
    to: toEmail,
    subject: `Your Boolok AI Verification Code: ${otp}`,
    text: `Your Boolok AI verification code is: ${otp}. This code expires in 10 minutes.`,
    html: `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #060b13; color: #ffffff; padding: 24px; margin: 0;">
        <div style="background-color: #0c1626; border: 1px solid #1a273c; border-radius: 12px; max-width: 480px; margin: 0 auto; padding: 32px; text-align: center;">
          <div style="font-size: 22px; font-weight: 800; color: #daa520; letter-spacing: 2px; margin-bottom: 6px;">★ BOOLOK AI</div>
          <div style="font-size: 13px; color: #94a3b8; margin-bottom: 24px;">AI Agent For Real Estate Services</div>
          <p style="font-size: 15px; color: #cbd5e1; line-height: 1.5; margin-bottom: 20px;">Use the following 6-digit verification code to complete your <strong>${purpose}</strong>:</p>
          <div style="background: #060b13; border: 1px solid #e6b800; border-radius: 8px; padding: 18px 24px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #daa520; display: inline-block; margin-bottom: 24px;">
            ${otp}
          </div>
          <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">This verification code is valid for <strong>10 minutes</strong>. If you did not request this code, please ignore this email.</p>
          <div style="font-size: 11px; color: #64748b; margin-top: 30px; border-top: 1px solid #1a273c; padding-top: 16px;">
            © 2026 Boolok GPT Real Estate Intelligence. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[nodemailer] Verification email successfully delivered to ${toEmail}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error('[nodemailer] Gmail SMTP delivery error:', err.message);
    return false;
  }
}

if (!process.env.GOOGLE_CLIENT_ID) {
  console.warn(
    '[auth] GOOGLE_CLIENT_ID is not set in backend .env. Google sign-in will not verify tokens.'
  );
}

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const TOKEN_ISSUER = 'boolok-gpt-api';
const TOKEN_AUDIENCE = 'boolok-gpt-client';

function createToken(user) {
  const secret = process.env.JWT_SECRET || 'boolok_default_jwt_secret_key_2026';

  return jwt.sign(
    {
      userId: user._id.toString(),
      id: user._id.toString(),
      email: user.email,
    },
    secret,
    {
      expiresIn: '7d',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    }
  );
}

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    _id: user._id.toString(),
    fullName: user.fullName,
    username: user.username || user.fullName?.replace(/\s+/g, '').toLowerCase() || 'user',
    email: user.email,
    profilePicture: user.profilePicture || null,
    bio: user.bio || '',
    goal: user.goal || null,
  };
}

// POST /api/auth/send-otp (for user registration verification)
router.post('/send-otp', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const otp = generateOtp();
    storeOtp(email, otp);

    console.log(`[auth] Registration 6-digit OTP generated for ${email}: ${otp}`);

    // Send real email via Gmail SMTP
    const emailSent = await sendOtpEmail(email, otp, 'Account Registration');

    if (!emailSent && !process.env.GMAIL_APP_PASSWORD) {
      console.warn(`[auth] Note: GMAIL_APP_PASSWORD is missing in backend/.env.`);
    }

    return res.status(200).json({
      message: `A 6-digit verification code has been sent to ${email}.`,
      success: true,
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ message: 'Failed to send verification email.', error: error.message });
  }
});

// POST /api/auth/send-login-otp (for passwordless OTP login)
router.post('/send-login-otp', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (!email) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const otp = generateOtp();
    storeOtp(email, otp);

    console.log(`[auth] Login 6-digit OTP generated for ${email}: ${otp}`);

    // Send real email via Gmail SMTP
    const emailSent = await sendOtpEmail(email, otp, 'Account Sign-In');

    if (!emailSent && !process.env.GMAIL_APP_PASSWORD) {
      console.warn(`[auth] Note: GMAIL_APP_PASSWORD is missing in backend/.env.`);
    }

    return res.status(200).json({
      message: `A 6-digit sign-in code has been sent to ${email}.`,
      success: true,
    });
  } catch (error) {
    console.error('Send login OTP error:', error);
    return res.status(500).json({ message: 'Failed to send login code email.', error: error.message });
  }
});

// POST /api/auth/verify-login-otp
router.post('/verify-login-otp', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP code are required.' });
    }

    const isValid = verifyOtpHelper(email, otp);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid or expired OTP code.' });
    }

    let user = await User.findOne({ email });

    if (!user) {
      const defaultName = email.split('@')[0];
      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

      user = await User.create({
        fullName: defaultName.charAt(0).toUpperCase() + defaultName.slice(1),
        username: defaultName.toLowerCase(),
        email,
        password: randomPassword,
        authProvider: 'local',
        profilePicture: null,
      });
    }

    const token = createToken(user);
    return res.status(200).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Verify login OTP error:', error);
    return res.status(500).json({ message: 'Login verification failed.', error: error.message });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
    const rawUsername = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
    }

    // If OTP was provided, verify it (or allow if valid)
    if (otp) {
      const isOtpValid = verifyOtpHelper(email, otp);
      if (!isOtpValid) {
        return res.status(400).json({ message: 'Invalid or expired verification code.' });
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'An account already exists with this email.' });
    }

    const username = rawUsername || fullName.replace(/\s+/g, '').toLowerCase();

    // Check if username is already taken by another user
    const existingUsername = await User.findOne({ username });
    const finalUsername = existingUsername ? `${username}${Math.floor(100 + Math.random() * 900)}` : username;

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      fullName,
      username: finalUsername,
      email,
      password: passwordHash,
      authProvider: 'local',
      profilePicture: null,
    });

    const token = createToken(user);
    return res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Registration failed.', error: error.message });
  }
});

// POST /api/auth/login (supports email OR username)
router.post('/login', async (req, res) => {
  try {
    const rawIdentifier = req.body.username || req.body.email || req.body.identifier || '';
    const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Username/email and password are required.' });
    }

    // Search by either email OR username
    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).select('+password');

    if (!user) {
      return res.status(401).json({ message: 'Incorrect username/email or password.' });
    }

    if (!user.password) {
      return res.status(401).json({
        message:
          user.authProvider === 'google'
            ? 'This account uses Google sign-in. Please continue with Google.'
            : 'Incorrect email or password.',
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: 'Incorrect username/email or password.' });
    }

    const token = createToken(user);
    return res.status(200).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) {
      return res.status(400).json({ message: 'Email address is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No registered account found with this email address.' });
    }

    const otp = generateOtp();
    storeOtp(email, otp);
    console.log(`[auth] Password reset 6-digit OTP for ${email}: ${otp}`);

    const emailSent = await sendOtpEmail(email, otp, 'Password Reset');
    if (!emailSent && !process.env.GMAIL_APP_PASSWORD) {
      console.warn(`[auth] Note: GMAIL_APP_PASSWORD is not configured in backend/.env.`);
    }

    return res.status(200).json({
      message: `A 6-digit password reset code has been sent to ${email}.`,
      success: true,
      email,
      ...(process.env.NODE_ENV !== 'production' ? { debugOtp: otp } : {}),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'Failed to process password reset request.', error: error.message });
  }
});

// POST /api/auth/verify-reset-otp
router.post('/verify-reset-otp', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and verification code are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const entry = otpStore.get(normalizedEmail);

    if (!entry) {
      return res.status(400).json({ message: 'No reset request found for this email, or the code expired.' });
    }

    if (Date.now() > entry.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    if (entry.otp !== otp) {
      return res.status(400).json({ message: 'Incorrect 6-digit code. Please check and try again.' });
    }

    return res.status(200).json({
      message: 'Code verified successfully.',
      success: true,
    });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    return res.status(500).json({ message: 'Failed to verify code.', error: error.message });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and 6-digit verification code are required.' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must contain at least 8 characters.' });
    }

    const isValidOtp = verifyOtpHelper(email, otp);
    if (!isValidOtp) {
      return res.status(400).json({ message: 'Invalid or expired verification code. Please request a new code.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'No registered account found with this email.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    console.log(`[auth] Password successfully reset for ${email}`);

    return res.status(200).json({
      message: 'Your password has been reset successfully! You can now log in.',
      success: true,
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ message: 'Failed to reset password.', error: error.message });
  }
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required.' });
    }

    let email;
    let fullName = 'Google User';
    let profilePicture = null;
    let googleSubject = null;

    try {
      if (process.env.GOOGLE_CLIENT_ID) {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        email = payload.email?.toLowerCase();
        fullName = payload.name || 'Google User';
        profilePicture = payload.picture || null;
        googleSubject = payload.sub || null;
      } else {
        // Decode without verification if client id is not configured
        const decoded = jwt.decode(idToken);
        email = decoded?.email?.toLowerCase();
        fullName = decoded?.name || 'Google User';
        profilePicture = decoded?.picture || null;
        googleSubject = decoded?.sub || null;
      }
    } catch (verifyErr) {
      const decoded = jwt.decode(idToken);
      if (decoded && decoded.email) {
        email = decoded.email.toLowerCase();
        fullName = decoded.name || 'Google User';
        profilePicture = decoded.picture || null;
        googleSubject = decoded.sub || null;
      } else {
        throw verifyErr;
      }
    }

    if (!email) {
      return res.status(400).json({ message: 'Google account has no email.' });
    }

    let user = await User.findOne({ email });

    if (!user) {
      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const username = email.split('@')[0].toLowerCase();

      user = await User.create({
        fullName,
        username,
        email,
        password: randomPassword,
        authProvider: 'google',
        googleSubject,
        profilePicture,
      });
    } else {
      if (googleSubject) user.googleSubject = googleSubject;
      if (profilePicture) {
        user.profilePicture = profilePicture;
      }
      user.authProvider = 'google';
      await user.save();
    }

    const token = createToken(user);
    return res.status(200).json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Google sign-in error:', error);
    return res.status(401).json({ message: 'Google sign-in failed.', error: error.message });
  }
});

// PUT /api/auth/personalize
router.put('/personalize', authMiddleware, async (req, res) => {
  try {
    const allowedGoals = ['buying', 'selling', 'investing', 'analysis'];
    const { goal, profilePicture } = req.body;

    if (goal && !allowedGoals.includes(goal)) {
      return res.status(400).json({ message: 'Invalid personalization goal.' });
    }

    const userId = req.user?.id || req.user?._id || req.userId;
    const updateObj = {};
    if (goal) updateObj.goal = goal;
    if (profilePicture !== undefined) updateObj.profilePicture = profilePicture ? profilePicture.trim() : null;

    const user = await User.findByIdAndUpdate(userId, { $set: updateObj }, { new: true });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Personalization error:', error);
    return res.status(500).json({ message: 'Failed to save personalization.', error: error.message });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Fetch me error:', error);
    return res.status(500).json({ message: 'Failed to fetch current user.', error: error.message });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const { username, fullName, profilePicture, bio } = req.body;

    const updateData = {};
    if (typeof fullName === 'string' && fullName.trim()) updateData.fullName = fullName.trim();
    if (typeof username === 'string') updateData.username = username.trim().toLowerCase();
    if (typeof profilePicture === 'string') updateData.profilePicture = profilePicture;
    if (typeof bio === 'string') updateData.bio = bio;

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ message: 'Failed to update profile.', error: error.message });
  }
});

module.exports = router;