// server.js
console.log("🟢 Server file starting...");

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { ObjectId } = require("bson"); // ✅ use ObjectId from bson (not deprecated)
const logger = require("./middleware/logger");

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Middleware ======
app.use(cors());
app.use(express.json());
app.use(logger);

// ====== MongoDB Setup ======
let db, lessonsCollection;

async function connectToMongoDB() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db("afterschoolDB");
    lessonsCollection = db.collection("lessons");
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}

// ====== ROUTES ======

// Test route
app.get("/", (req, res) => {
  res.send("✅ Backend running successfully!");
});

// Get all lessons
app.get("/lessons", async (req, res) => {
  try {
    const lessons = await lessonsCollection.find().toArray();
    res.json(lessons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching lessons" });
  }
});

// Checkout route — decrease available spaces
app.post("/checkout", async (req, res) => {
  const { cart } = req.body;

  if (!cart || !Array.isArray(cart)) {
    return res.status(400).json({ message: "Invalid cart data" });
  }

  try {
    for (const item of cart) {
      const lesson = await lessonsCollection.findOne({ _id: new ObjectId(item.id) });
      if (lesson && lesson.spaces >= item.qty) {
        await lessonsCollection.updateOne(
          { _id: new ObjectId(item.id) },
          { $inc: { spaces: -item.qty } }
        );
      }
    }

    res.json({ message: "Checkout successful!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Checkout failed" });
  }
});

// ====== START SERVER ======
app.listen(PORT, async () => {
  await connectToMongoDB();
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
