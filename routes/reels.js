const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const Reel = require('../models/Reel');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');

// ── Multer storage: save uploaded video files to /uploads/reels/ ────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'reels');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Only video files are allowed'));
  },
});

const PLACEHOLDER_INSIGHTS = [
  'High buyer interest predicted based on comparable listings in this area.',
  'Property features align well with current market demand trends.',
  'Location shows strong long-term appreciation potential.',
  'Listing quality and presentation are above average for this segment.',
  'Strong engagement expected based on similar recent listings.',
];

function generatePlaceholderAnalysis() {
  const aiMatch = Math.floor(Math.random() * (99 - 80 + 1)) + 80;
  const insight = PLACEHOLDER_INSIGHTS[Math.floor(Math.random() * PLACEHOLDER_INSIGHTS.length)];
  return { aiMatch, insight };
}

const formatReel = (reel, viewerId = null) => {
  const r = reel.toObject ? reel.toObject() : reel;
  const likesArray = (r.likes || []).map((l) => (l?._id ? l._id.toString() : String(l)));
  const isLiked = viewerId ? likesArray.includes(viewerId.toString()) : false;

  const comments = (r.comments || []).map((c) => {
    const u = c.user || {};
    return {
      _id: c._id,
      author: {
        _id: u._id || u.id || null,
        fullName: u.fullName || 'Boolok Member',
        username: u.username || 'member',
        profilePicture: u.profilePicture || null,
      },
      text: c.text,
      createdAt: c.createdAt,
    };
  });

  return {
    _id: r._id.toString(),
    author: r.author
      ? {
          _id: r.author._id?.toString() || r.author.id?.toString(),
          fullName: r.author.fullName || 'Boolok Member',
          username: r.author.username || 'member',
          profilePicture: r.author.profilePicture || null,
        }
      : null,
    videoUrl: r.videoUrl,
    caption: r.caption || '',
    title: r.title || '',
    location: r.location || '',
    aiMatch: r.aiMatch,
    insight: r.insight,
    views: r.views || 0,
    likes: likesArray,
    likesCount: likesArray.length,
    isLiked,
    comments,
    commentsCount: comments.length,
    createdAt: r.createdAt,
  };
};

// ── GET /api/reels : Fetch all reels ─────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const viewerId = req.user?.id || req.user?._id || null;
    const reels = await Reel.find()
      .populate('author', 'fullName username profilePicture')
      .populate('comments.user', 'fullName username profilePicture')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(reels.map((r) => formatReel(r, viewerId)));
  } catch (error) {
    console.error('FETCH REELS ERROR:', error);
    res.status(500).json({ message: 'Server error fetching reels' });
  }
});

// ── POST /api/reels : Create a new reel ──────────────────────────────────────
router.post('/', auth, upload.single('video'), async (req, res) => {
  try {
    let videoUrl;
    if (req.file) {
      videoUrl = `/uploads/reels/${req.file.filename}`;
    } else if (typeof req.body.videoUrl === 'string' && req.body.videoUrl.trim()) {
      videoUrl = req.body.videoUrl.trim();
    } else {
      return res.status(400).json({ message: 'A video file or video URL is required.' });
    }

    const { caption, title, location } = req.body;
    const placeholder = generatePlaceholderAnalysis();

    const newReel = new Reel({
      author: req.user.id,
      videoUrl,
      caption: caption || '',
      title: title || '',
      location: location || '',
      aiMatch: req.body.aiMatch ? Number(req.body.aiMatch) : placeholder.aiMatch,
      insight: req.body.insight ? req.body.insight.trim() : placeholder.insight,
      likes: [],
      comments: [],
    });

    const savedReel = await newReel.save();
    await savedReel.populate('author', 'fullName username profilePicture');
    res.status(201).json(formatReel(savedReel, req.user.id));
  } catch (error) {
    console.error('CREATE REEL ERROR:', error);
    res.status(500).json({ message: 'Server error creating reel' });
  }
});

// ── PUT /api/reels/:id/like : Toggle like on a reel ─────────────────────────
router.put('/:id/like', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reel ID' });
    }

    const reel = await Reel.findById(req.params.id);
    if (!reel) return res.status(404).json({ message: 'Reel not found' });

    const alreadyLiked = reel.likes.some((id) => id.toString() === userId.toString());
    const update = alreadyLiked
      ? { $pull: { likes: userId } }
      : { $addToSet: { likes: userId } };

    const updated = await Reel.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('author', 'fullName username profilePicture')
      .populate('comments.user', 'fullName username profilePicture');

    res.json(formatReel(updated, userId));
  } catch (error) {
    console.error('LIKE REEL ERROR:', error);
    res.status(500).json({ message: 'Server error updating reel like' });
  }
});

// ── POST /api/reels/:id/comments : Add comment to a reel ────────────────────
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Comment text is required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reel ID' });
    }

    const reel = await Reel.findById(req.params.id);
    if (!reel) return res.status(404).json({ message: 'Reel not found.' });

    reel.comments.push({
      user: req.user.id,
      text: text.trim(),
      createdAt: new Date(),
    });

    await reel.save();
    const populated = await Reel.findById(req.params.id)
      .populate('author', 'fullName username profilePicture')
      .populate('comments.user', 'fullName username profilePicture');

    res.status(201).json(formatReel(populated, req.user.id));
  } catch (error) {
    console.error('ADD REEL COMMENT ERROR:', error);
    res.status(500).json({ message: 'Server error adding comment.' });
  }
});

// ── GET /api/reels/:id/comments : Get comments for a reel ───────────────────
router.get('/:id/comments', optionalAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reel ID' });
    }
    const reel = await Reel.findById(req.params.id)
      .populate('comments.user', 'fullName username profilePicture');
    if (!reel) return res.status(404).json({ message: 'Reel not found.' });

    const comments = (reel.comments || []).map((c) => ({
      _id: c._id,
      author: c.user || { fullName: 'Boolok Member', username: 'member' },
      text: c.text,
      createdAt: c.createdAt,
    }));
    res.json(comments);
  } catch (error) {
    console.error('GET REEL COMMENTS ERROR:', error);
    res.status(500).json({ message: 'Server error fetching comments.' });
  }
});

// ── DELETE /api/reels/:id : Delete a reel ───────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid reel ID' });
    }
    const reel = await Reel.findById(req.params.id);
    if (!reel) return res.status(404).json({ message: 'Reel not found' });

    if (reel.videoUrl && reel.videoUrl.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', reel.videoUrl);
      fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') {
          console.warn('Could not delete video file:', err.message);
        }
      });
    }

    await reel.deleteOne();
    res.json({ message: 'Reel deleted successfully' });
  } catch (error) {
    console.error('DELETE REEL ERROR:', error);
    res.status(500).json({ message: 'Server error deleting reel' });
  }
});

module.exports = router;