const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// For meter reading images
const meterStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'cargo-tracker/meter-readings',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
    }
});

// For expense receipts
const receiptStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'cargo-tracker/receipts',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
    }
});

module.exports = {
    cloudinary,
    meterStorage,
    receiptStorage
};