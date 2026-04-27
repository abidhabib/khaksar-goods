const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const isBilty = file?.fieldname === 'bilty_slip_image';
        const isReceipt = file?.fieldname === 'receipt_image';
        const isLoadPhoto = file?.fieldname === 'load_photo' || file?.fieldname === 'loadPhoto' || file?.fieldname === 'load_image';
        const isPaymentScreenshot = file?.fieldname === 'payment_screenshot' || file?.fieldname === 'screenshot_image';

        return {
            folder: isBilty
                ? 'cargo-tracker/bilty-slips'
                : isReceipt
                    ? 'cargo-tracker/receipts'
                    : isLoadPhoto
                        ? 'cargo-tracker/load-photos'
                        : isPaymentScreenshot
                            ? 'cargo-tracker/payment-submissions'
                            : 'cargo-tracker/meter-readings',
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
        };
    }
});

module.exports = {
    cloudinary,
    meterStorage: uploadStorage,
    receiptStorage: uploadStorage
};
