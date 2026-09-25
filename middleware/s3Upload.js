const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');

const requiredEnvironmentVariables = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_S3_BUCKET',
];

for (const variableName of requiredEnvironmentVariables) {
    if (!process.env[variableName]) {
        console.warn(
            `Warning: ${variableName} is missing from the backend environment.`
        );
    }
}

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

const upload = multer({
    storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,

        key: (req, file, callback) => {
            const originalExtension = path.extname(file.originalname).toLowerCase();
            const extension = originalExtension || '.jpg';

            const userId = req.user?.id || req.user?._id || 'unknown-user';
            const filename = `posts/${userId}-${Date.now()}${extension}`;

            callback(null, filename);
        },
    }),

    limits: {
        fileSize: 10 * 1024 * 1024,
    },

    fileFilter: (req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return callback(
                new Error('Unsupported image format. Upload JPG, PNG, or WEBP.')
            );
        }
        callback(null, true);
    },
});

module.exports = upload;