const tf = require('@tensorflow/tfjs');
const { loadModel } = require('../models/modelLoader');
const { preprocessImage } = require('../utils/imageProcessor');

const predictFromFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const currentModel = await loadModel();
    const imageTensor = await preprocessImage(req.file.buffer);
    const predictions = await currentModel.classify(imageTensor);
    imageTensor.dispose();

    const formattedPredictions = predictions.map((pred, index) => ({
      rank: index + 1,
      class: pred.className,
      probability: pred.probability,
      percentage: `${(pred.probability * 100).toFixed(2)}%`,
    }));

    res.json({
      success: true,
      predictions: formattedPredictions,
      topPrediction: formattedPredictions[0],
      modelUsed: 'MobileNet v2',
      imageSize: { width: req.file.size, type: req.file.mimetype },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const predictFromBase64 = async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    let base64Data = imageData;
    if (imageData.includes('base64,')) base64Data = imageData.split('base64,')[1];

    const imageBuffer = Buffer.from(base64Data, 'base64');
    const currentModel = await loadModel();
    const imageTensor = await preprocessImage(imageBuffer);
    const predictions = await currentModel.classify(imageTensor);
    imageTensor.dispose();

    const formattedPredictions = predictions.map((pred, index) => ({
      rank: index + 1,
      class: pred.className,
      probability: pred.probability,
      percentage: `${(pred.probability * 100).toFixed(2)}%`,
    }));

    res.json({
      success: true,
      predictions: formattedPredictions,
      topPrediction: formattedPredictions[0],
      modelUsed: 'MobileNet v2',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { predictFromFile, predictFromBase64 };