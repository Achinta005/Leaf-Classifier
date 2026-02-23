const sharp = require('sharp');
const tf = require('@tensorflow/tfjs');

const preprocessImage = async (imageBuffer) => {
  try {
    const processedImage = await sharp(imageBuffer)
      .resize(224, 224)
      .removeAlpha()
      .raw()
      .toBuffer();

    const tensor = tf.tensor3d(processedImage, [224, 224, 3]);
    const normalized = tensor.toFloat().div(tf.scalar(255));
    const batched = normalized.expandDims(0);

    return batched;
  } catch (error) {
    throw new Error(`Image preprocessing failed: ${error.message}`);
  }
};

module.exports = { preprocessImage };