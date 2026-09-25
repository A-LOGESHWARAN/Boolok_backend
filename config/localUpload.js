const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDirectory = path.join(
    __dirname,
    '..',
    'uploads',
    'posts'
);

fs.mkdirSync(uploadDirectory, {
    recursive: true,
});

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
    },

    filename: (req, file, callback) => {
        const extension =
            path.extname(file.originalname) || '.jpg';

        callback(
            null,
            `${Date.now()}-${Math.round(
                Math.random() * 1e9
            )}${extension}`
        );
    },
});

const upload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024,
    },

    fileFilter: (req, file, callback) => {
        const allowed = [
            'image/jpeg',
            'image/png',
            'image/webp',
        ];

        if (!allowed.includes(file.mimetype)) {
            return callback(
                new Error('Only JPG, PNG and WEBP are allowed.')
            );
        }

        callback(null, true);
    },
});

module.exports = upload;