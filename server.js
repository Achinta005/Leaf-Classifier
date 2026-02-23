const express = require("express");
const cors = require("cors");
const path = require("path");
const { loadModel } = require("./models/modelLoader");
const predictionRoutes = require("./routes/prediction");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Routes
app.use("/api", predictionRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    model: "MobileNet v2",
    timestamp: new Date().toISOString(),
  });
});

// Model info
app.get("/api/model-info", (req, res) => {
  res.json({
    name: "MobileNet v2",
    version: "2.0",
    inputSize: "224x224",
    classes: 1000,
    description: "Pre-trained on ImageNet dataset",
  });
});

// Frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Error handling
app.use((error, req, res, next) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    return res
      .status(400)
      .json({ success: false, error: "File too large. Maximum size is 10MB" });
  }
  res.status(500).json({ success: false, error: error.message });
});

// Start
async function startServer() {
  try {
    console.log("=".repeat(60));
    console.log("🤖 Image Classification API Server");
    console.log("=".repeat(60));
    await loadModel();
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log("=".repeat(60));
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
