import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

/* -----------------------
   Setup paths
------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -----------------------
   App setup
------------------------ */
const app = express();
app.use(cors());
app.use(express.json());

/* -----------------------
   Static images folder
------------------------ */
app.use("/images", express.static(path.join(__dirname, "images")));

/* -----------------------
   Logger
------------------------ */
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});

/* -----------------------
   MongoDB Connection
------------------------ */
const client = new MongoClient(process.env.MONGODB_URI);

let lessonsCollection;
let ordersCollection;

async function connectDB() {
  try {
    await client.connect();
    const db = client.db("Shopping"); // ✅ THIS MUST MATCH YOUR DB

    lessonsCollection = db.collection("lessons");
    ordersCollection = db.collection("orders");

    console.log("✅ MongoDB Connected Successfully!");
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err.message);
  }
}

connectDB();

/* -----------------------
   Safety middleware
------------------------ */
app.use((req, res, next) => {
  if (!lessonsCollection) {
    return res.status(503).json({ error: "Database not connected yet" });
  }
  next();
});

/* -----------------------
   GET all lessons
------------------------ */
app.get("/lessons", async (req, res) => {
  try {
    const lessons = await lessonsCollection.find({}).toArray();
    res.json(lessons);
  } catch (err) {
    console.error("LESSONS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

/* -----------------------
   SEARCH lessons
------------------------ */
app.get("/search", async (req, res) => {
  const query = req.query.q?.trim();
  if (!query) return res.json([]);

  const regex = new RegExp(query, "i");

  try {
    const results = await lessonsCollection.find({
      $or: [
        { topic: regex },     // ✅ FIXED
        { location: regex }   // ✅ ALREADY CORRECT
      ]
    }).toArray();

    res.json(results);
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    res.status(500).json({ error: "Search failed" });
  }
});



/* -----------------------
   GET all orders
------------------------ */
app.get("/orders", async (req, res) => {
  try {
    const orders = await ordersCollection.find({}).toArray();
    res.status(200).json(orders);
  } catch (err) {
    console.error("GET ORDERS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});





/* -----------------------
   POST order
------------------------ */
app.post("/orders", async (req, res) => {
  const { items, name, phone } = req.body;

  if (!items || !name || !phone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    for (const item of items) {
      const lessonId = new ObjectId(item.lessonId);
      const qty = item.qty;

      const lesson = await lessonsCollection.findOne({ _id: lessonId });

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      if (lesson.space < qty) {
        return res.status(400).json({ error: "Not enough spaces" });
      }

      await ordersCollection.insertOne({
        name,
        phone,
        lessonId,
        qty,
        date: new Date(),
      });

      await lessonsCollection.updateOne(
        { _id: lessonId },
        { $inc: { space: -qty } }
      );
    }

    res.json({ message: "✅ Order placed successfully!" });
  } catch (err) {
    console.error("ORDER ERROR:", err);
    res.status(500).json({ error: "Order failed" });
  }
});

/* -----------------------
   UPDATE lesson spaces
------------------------ */
app.put("/lessons/:id", async (req, res) => {
  const { space } = req.body;

  if (typeof space !== "number") {
    return res.status(400).json({ error: "Space must be a number" });
  }

  try {
    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { space } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json({ message: "✅ Space updated" });
  } catch (err) {
    console.error("PUT ERROR:", err);
    res.status(500).json({ error: "Failed to update space" });
  }
});

/* -----------------------
   Start Server
------------------------ */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
