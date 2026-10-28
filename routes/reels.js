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
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    let rawExt = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (!rawExt || rawExt.length > 5 || rawExt.includes('/')) {
      rawExt = (file.mimetype && file.mimetype.startsWith('image/')) ? '.jpg' : '.mp4';
    }
    cb(null, `${unique}${rawExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isVideoExt = ['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi'].includes(ext);
    const isImageExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    const isMediaMime =
      !file.mimetype ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'application/octet-stream';

    if (isMediaMime || isVideoExt || isImageExt) {
      cb(null, true);
    } else {
      cb(new Error('Only video and image files are allowed'));
    }
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
    const createdDate = c.createdAt || new Date();
    return {
      _id: c._id,
      user: {
        _id: u._id || u.id || null,
        fullName: u.fullName || 'Boolok Member',
        username: u.username || 'member',
        profilePicture: u.profilePicture || null,
      },
      author: {
        _id: u._id || u.id || null,
        fullName: u.fullName || 'Boolok Member',
        username: u.username || 'member',
        profilePicture: u.profilePicture || null,
      },
      text: c.text,
      createdAt: createdDate,
      time: new Date(createdDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date(createdDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    };
  });

  const poster = r.poster || r.thumbnail || null;
  const thumbnail = r.thumbnail || r.poster || null;

  const authorDisplayName = r.authorName || r.author?.fullName || 'Boolok Member';

  return {
    _id: r._id.toString(),
    author: r.author
      ? {
          _id: r.author._id?.toString() || r.author.id?.toString(),
          fullName: authorDisplayName,
          username: r.author.username || 'member',
          profilePicture: r.author.profilePicture || null,
        }
      : {
          _id: null,
          fullName: authorDisplayName,
          username: 'member',
          profilePicture: null,
        },
    videoUrl: r.videoUrl,
    poster,
    thumbnail,
    caption: r.caption || '',
    title: r.title || '',
    authorName: r.authorName || '',
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
router.post('/', auth, upload.any(), async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    console.log(`[reels] Upload request from user ${req.user?.id}, received ${files.length} file(s)`);

    const videoFile = files.find(
      (f) =>
        f.fieldname === 'video' ||
        f.fieldname === 'file' ||
        (f.mimetype && f.mimetype.startsWith('video/')) ||
        (f.originalname && /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(f.originalname)) ||
        (files.length === 1 && (!f.mimetype || !f.mimetype.startsWith('image/')))
    );

    const thumbFile = files.find(
      (f) =>
        f !== videoFile &&
        (f.fieldname === 'thumbnail' ||
          f.fieldname === 'poster' ||
          (f.mimetype && f.mimetype.startsWith('image/')) ||
          (f.originalname && /\.(jpg|jpeg|png|webp)$/i.test(f.originalname)))
    );

    let videoUrl = null;
    if (videoFile) {
      videoUrl = `/uploads/reels/${videoFile.filename}`;
    } else if (typeof req.body.videoUrl === 'string' && req.body.videoUrl.trim()) {
      videoUrl = req.body.videoUrl.trim();
    } else if (typeof req.body.video === 'string' && req.body.video.trim()) {
      videoUrl = req.body.video.trim();
    } else {
      console.warn('[reels] Missing video. Body:', Object.keys(req.body));
      return res.status(400).json({ message: 'A video file or video URL is required.' });
    }

    let thumbnail = null;
    if (thumbFile) {
      thumbnail = `/uploads/reels/${thumbFile.filename}`;
    } else if (typeof req.body.thumbnail === 'string' && req.body.thumbnail.trim()) {
      thumbnail = req.body.thumbnail.trim();
    } else if (typeof req.body.poster === 'string' && req.body.poster.trim()) {
      thumbnail = req.body.poster.trim();
    }

    const { caption, title, location, authorName } = req.body;
    const placeholder = generatePlaceholderAnalysis();

    const newReel = new Reel({
      author: req.user.id,
      videoUrl,
      thumbnail: thumbnail || null,
      poster: thumbnail || null,
      caption: caption ? String(caption).trim() : '',
      title: title ? String(title).trim() : '',
      authorName: authorName ? String(authorName).trim() : '',
      location: location ? String(location).trim() : '',
      aiMatch: req.body.aiMatch ? Number(req.body.aiMatch) : placeholder.aiMatch,
      insight: req.body.insight ? String(req.body.insight).trim() : placeholder.insight,
      likes: [],
      comments: [],
    });

    const savedReel = await newReel.save();
    await savedReel.populate('author', 'fullName username profilePicture');
    console.log(`[reels] Successfully created reel: ${savedReel._id}`);
    res.status(201).json(formatReel(savedReel, req.user.id));
  } catch (error) {
    console.error('CREATE REEL ERROR:', error);
    res.status(500).json({ message: 'Server error creating reel', error: error.message });
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

    const comments = (reel.comments || []).map((c) => {
      const u = c.user || {};
      const createdDate = c.createdAt || new Date();
      return {
        _id: c._id,
        user: {
          _id: u._id || u.id || null,
          fullName: u.fullName || 'Boolok Member',
          username: u.username || 'member',
          profilePicture: u.profilePicture || null,
        },
        author: {
          _id: u._id || u.id || null,
          fullName: u.fullName || 'Boolok Member',
          username: u.username || 'member',
          profilePicture: u.profilePicture || null,
        },
        text: c.text,
        createdAt: createdDate,
        time: new Date(createdDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date(createdDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
      };
    });
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