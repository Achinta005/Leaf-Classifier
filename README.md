# 🚀 AI Image Classifier Pro - JavaScript Full Stack

A professional, production-ready full-stack image classification application built with **Node.js**, **Express**, **React**, and **TensorFlow.js**. Features a beautiful, modern UI with both image upload and camera capture capabilities.

## ✨ Features

### 🎨 Frontend
- **Modern React UI** with beautiful gradient design
- **Responsive Design** - Works perfectly on desktop and mobile
- **Image Upload** - Select images from your device
- **Live Camera Capture** - Take photos directly in the browser
- **Real-time Classification** - Instant AI predictions
- **Animated Results** - Smooth transitions and visual feedback
- **Confidence Bars** - Visual representation of prediction confidence
- **Professional Statistics** - View model performance metrics

### ⚙️ Backend
- **Node.js & Express** - Fast, scalable server
- **TensorFlow.js** - Client-side ML capabilities
- **MobileNet v2** - State-of-the-art image classification
- **File Upload Support** - Handles multipart form data
- **Base64 Support** - Process camera captures
- **Error Handling** - Robust error management
- **CORS Enabled** - Cross-origin resource sharing
- **Image Preprocessing** - Automatic resizing and optimization

### 🤖 AI Capabilities
- **1000+ Object Classes** - Trained on ImageNet dataset
- **Top 5 Predictions** - Multiple classification results
- **Confidence Scores** - Percentage-based accuracy
- **Fast Inference** - Optimized for speed
- **Memory Efficient** - Smart tensor management

## 📁 Project Structure

```
image-classifier-js/
├── server.js           # Express backend with TensorFlow.js
├── package.json        # Backend dependencies
├── index.html          # React frontend application
├── test-api.js         # API testing script
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore file
└── README.md           # This file
```

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **ML Library**: TensorFlow.js Node
- **Model**: MobileNet v2
- **Image Processing**: Sharp
- **File Uploads**: Multer
- **CORS**: cors

### Frontend
- **Library**: React 18
- **Icons**: Font Awesome 6
- **Styling**: Custom CSS with animations
- **Build**: Babel (in-browser transpilation)

## 📦 Installation

### Prerequisites
- Node.js 16.0 or higher
- npm or yarn
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Step 1: Install Dependencies

```bash
# Navigate to project directory
cd image-classifier-js

# Install backend dependencies
npm install
```

**Note**: First installation may take 3-5 minutes as TensorFlow.js is a large package.

### Step 2: Start the Backend

```bash
# Start the server
npm start

# Or for development with auto-reload
npm run dev
```

The server will start on `http://localhost:5000`

You should see:
```
============================================================
🤖 Image Classification API Server
============================================================
Loading MobileNet model...
✅ Model loaded successfully!
✅ Server running on http://localhost:5000
============================================================
```

### Step 3: Open the Frontend

Simply open `index.html` in your web browser:

```bash
# On macOS
open index.html

# On Linux
xdg-open index.html

# On Windows
start index.html
```

Or double-click the `index.html` file.

Alternatively, serve it with a simple HTTP server:

```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx http-server -p 8080
```

Then open `http://localhost:8080`

## 🚀 Quick Start

### Option 1: NPM Scripts

```bash
# Install dependencies
npm install

# Start server
npm start

# Run tests
npm test
```

### Option 2: Manual Start

```bash
# Install dependencies
npm install express cors multer sharp @tensorflow/tfjs-node @tensorflow-models/mobilenet

# Start server
node server.js

# In another terminal, test the API
node test-api.js
```

## 📖 Usage Guide

### Upload an Image

1. Click the **"Upload Image"** button
2. Select an image file (JPG, PNG, GIF, WebP)
3. Wait for AI analysis (1-3 seconds)
4. View top 5 predictions with confidence scores

### Capture with Camera

1. Click the **"Use Camera"** button
2. Allow camera permissions when prompted
3. Position your subject in the camera view
4. Click **"Capture"** to take the photo
5. View classification results instantly

### Understanding Results

- **#1 Result** - Highlighted in purple with trophy icon 🏆
- **Confidence Bars** - Visual representation of prediction strength
- **Percentage** - Numerical confidence score (0-100%)
- **Statistics** - Top confidence, prediction count, model used

## 🔌 API Documentation

### Base URL
```
http://localhost:5000
```

### Endpoints

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "model": "MobileNet v2",
  "timestamp": "2024-02-10T14:30:00.000Z"
}
```

#### Model Information
```http
GET /api/model-info
```

**Response:**
```json
{
  "name": "MobileNet v2",
  "version": "2.0",
  "inputSize": "224x224",
  "classes": 1000,
  "description": "Pre-trained on ImageNet dataset"
}
```

#### Classify Image (File Upload)
```http
POST /api/predict
Content-Type: multipart/form-data

Body:
  - image: File
```

**Response:**
```json
{
  "success": true,
  "predictions": [
    {
      "rank": 1,
      "class": "Golden Retriever",
      "probability": 0.8234,
      "percentage": "82.34%"
    },
    ...
  ],
  "topPrediction": {
    "rank": 1,
    "class": "Golden Retriever",
    "probability": 0.8234,
    "percentage": "82.34%"
  },
  "modelUsed": "MobileNet v2"
}
```

#### Classify Image (Base64)
```http
POST /api/predict-base64
Content-Type: application/json

Body:
{
  "imageData": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**Response:** Same as file upload endpoint

## 🧪 Testing

### Test the API
```bash
node test-api.js
```

### Manual Testing with curl

**Upload an image:**
```bash
curl -X POST \
  -F "image=@path/to/your/image.jpg" \
  http://localhost:5000/api/predict
```

**Test with base64:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"imageData":"data:image/jpeg;base64,..."}' \
  http://localhost:5000/api/predict-base64
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file:

```env
PORT=5000
NODE_ENV=development
MAX_FILE_SIZE=10485760
ALLOWED_ORIGINS=*
```

### Server Configuration

Edit `server.js` to customize:
- Port number
- File size limits
- Allowed file types
- CORS settings
- Model version

## 🎨 Customization

### Frontend Styling

The app uses CSS custom properties. Modify in `index.html`:

```css
:root {
    --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --secondary-gradient: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    --card-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}
```

### Backend Model

To use a different TensorFlow.js model:

```javascript
// In server.js
const customModel = await tf.loadLayersModel('path/to/model.json');
```

## 📊 Performance

- **Model Load Time**: ~2-5 seconds (first time only)
- **Prediction Speed**: 100-300ms per image
- **Memory Usage**: ~200-400MB
- **Supported Image Size**: Up to 10MB
- **Optimal Input**: 224x224 pixels (auto-resized)

## 🔒 Security Considerations

- **File Upload Validation**: Type and size checking
- **CORS Configuration**: Restrict origins in production
- **Error Handling**: No sensitive data in error messages
- **Input Sanitization**: Image preprocessing and validation
- **Rate Limiting**: Consider adding in production

## 🐛 Troubleshooting

### "Cannot find module"
```bash
npm install
```

### "Cannot connect to server"
- Ensure backend is running: `node server.js`
- Check port 5000 is not in use
- Verify firewall settings

### "Camera not working"
- Grant camera permissions in browser
- Use HTTPS for mobile devices
- Check browser compatibility

### "Model loading failed"
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### "Out of memory"
- Reduce image size before upload
- Restart the Node.js server
- Increase Node.js memory: `node --max-old-space-size=4096 server.js`

## 🌐 Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 📱 Mobile Support

The application is fully responsive and supports:
- Touch gestures
- Mobile camera access
- Optimized layouts for small screens
- Fast performance on mobile devices

## 🚀 Deployment

### Deploy to Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create your-app-name

# Deploy
git push heroku main

# Open app
heroku open
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Deploy to AWS EC2

```bash
# SSH to instance
ssh -i your-key.pem ubuntu@your-instance

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone your-repo
cd image-classifier-js
npm install
node server.js
```

## 🔄 Future Enhancements

- [ ] Custom model training interface
- [ ] Batch image processing
- [ ] Export results to CSV/JSON
- [ ] Multiple model support
- [ ] Image preprocessing filters
- [ ] Multi-language support
- [ ] Progressive Web App (PWA)
- [ ] Offline mode support
- [ ] User authentication
- [ ] Image history/gallery

## 📄 License

MIT License - Free to use and modify for your projects!

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues or questions:
1. Check this README
2. Review the troubleshooting section
3. Test with `node test-api.js`
4. Check browser console for errors

## 🙏 Credits

- **MobileNet v2**: Google Research
- **TensorFlow.js**: Google TensorFlow Team
- **ImageNet**: Stanford Vision Lab
- **Icons**: Font Awesome

---

**Built with ❤️ using Node.js, React, and TensorFlow.js**

*Made by developers, for developers*
