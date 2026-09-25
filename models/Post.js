const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    title: {
      type: String,
      default: '',
      trim: true,
    },

    price: {
      type: String,
      default: '',
      trim: true,
    },

    location: {
      type: String,
      default: '',
      trim: true,
    },

    specs: {
      type: String,
      default: '',
      trim: true,
    },

    content: {
      type: String,
      default: '',
      trim: true,
    },

    mediaUrl: {
      type: String,
      default: null,
    },

    mediaUrls: [
      {
        type: String,
      },
    ],

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    reactions: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        type: {
          type: String,
          enum: ['like', 'love'],
          default: 'like',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },

        text: {
          type: String,
          trim: true,
        },

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Post', postSchema);