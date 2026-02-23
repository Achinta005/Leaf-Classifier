const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { predictFromFile, predictFromBase64 } = require('../controller/predict');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|bmp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files are allowed.'));
    }
  },
});

router.post('/predict', upload.single('image'), predictFromFile);
router.post('/predict-base64', predictFromBase64);

module.exports = router;