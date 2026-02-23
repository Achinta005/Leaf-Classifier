const mobilenet = require('@tensorflow-models/mobilenet');

let model = null;

const loadModel = async () => {
  if (!model) {
    console.log('Loading MobileNet model...');
    model = await mobilenet.load({ version: 2, alpha: 1.0 });
    console.log('✅ Model loaded successfully!');
  }
  return model;
};

module.exports = { loadModel };