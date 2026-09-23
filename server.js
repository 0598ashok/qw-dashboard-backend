require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dbConfig = require('./utils/dbConfig');

const app = express();
const port = process.env.PORT || 4444;

app.use(cors());
app.use(express.json());

// Middleware to prevent buffering timeouts if database is not ready
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: "Database connection is not ready. Please try again." });
  }
  next();
});

app.use("/auth", require("./routes/authRoutes"));
app.use("/api", require("./routes/apiRoutes"));

const startServer = async () => {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(dbConfig, {
      serverSelectionTimeoutMS: 15000
    });
    console.log("DB Connected Successfully");

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB Atlas:", error.message);
    process.exit(1);
  }
};

startServer();