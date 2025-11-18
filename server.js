require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());

// ====== Custom logger middleware ======
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ====== Serve static images ======
app.use("/images", express.static("images"));

// ====== Env & Mongo client ======
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in .env");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

let lessonsCollection;
let ordersCollection;

async function migrateTopicToSubject(db) {
  try {
    // Only update documents that have 'topic' and do not already have 'subject'
    const result = await db.collection("lessons").updateMany(
      { topic: { $exists: true }, subject: { $exists: false } },
      [
        // aggregation pipeline update: set subject = topic, unset topic
        { $set: { subject: "$topic" } },
        { $unset: "topic" }
      ]
    );

    if (result.matchedCount > 0) {
      console.log(`Migration: converted ${result.matchedCount} lesson(s) from 'topic' -> 'subject'.`);
    } else {
      console.log("Migration: no 'topic' fields found or already migrated.");
    }
  } catch (err) {
    console.error("Migration error:", err);
  }
}

async function start() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas.");

    // Use DB name from connection string (or default)
    const db = client.db(); // connection string already contains the DB "Shopping"
    lessonsCollection = db.collection("lessons");
    ordersCollection = db.collection("orders");

    // Run migration to rename topic -> subject if needed
    await migrateTopicToSubject(db);

    // Start server only after DB is ready
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();

// ================= ROUTES =================

// GET /lessons - return all lessons
app.get("/lessons", async (req, res) => {
  try {
    const lessons = await lessonsCollection.find().toArray();
    res.json(lessons);
  } catch (err) {
    console.error("GET /lessons error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /orders - create an order (validation included)
app.post("/orders", async (req, res) => {
  try {
    const { name, phone, lessonIDs, spaces } = req.body;

    // Basic validation
    if (!name || !/^[A-Za-z\s]+$/.test(name)) {
      return res.status(400).json({ error: "Name is required and must contain letters only" });
    }
    if (!phone || !/^[0-9]+$/.test(phone)) {
      return res.status(400).json({ error: "Phone is required and must contain numbers only" });
    }
    if (!Array.isArray(lessonIDs) || lessonIDs.length === 0) {
      return res.status(400).json({ error: "lessonIDs must be a non-empty array" });
    }
    if (typeof spaces !== "number" || spaces <= 0) {
      return res.status(400).json({ error: "spaces must be a positive number" });
    }

    const orderDoc = {
      name,
      phone,
      lessonIDs,
      spaces,
      createdAt: new Date()
    };

    const result = await ordersCollection.insertOne(orderDoc);
    res.json({ message: "Order saved", id: result.insertedId });
  } catch (err) {
    console.error("POST /orders error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /lessons/:id - update only allowed fields (subject, location, price, space, image)
app.put("/lessons/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid lesson id" });
    }

    const allowedFields = ["subject", "location", "price", "space", "image"];
    const update = {};
    for (const key of allowedFields) {
      if (req.body.hasOwnProperty(key)) {
        update[key] = req.body[key];
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update" });
    }

    // If price or space provided, ensure they are numbers
    if (update.price !== undefined && typeof update.price !== "number") {
      return res.status(400).json({ error: "price must be a number" });
    }
    if (update.space !== undefined && typeof update.space !== "number") {
      return res.status(400).json({ error: "space must be a number" });
    }

    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json({ message: "Lesson updated", matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error("PUT /lessons/:id error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /search?query=... - backend search (subject, location, price, space)
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.query || "").trim();
    if (q === "") {
      // return all if empty
      const all = await lessonsCollection.find().toArray();
      return res.json(all);
    }

    // Build OR conditions. For price/space try numeric match, also regex fallback.
    const or = [
      { subject: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } }
    ];

    // If query looks numeric, add numeric equality checks for price/space
    if (!isNaN(Number(q))) {
      const num = Number(q);
      or.push({ price: num }, { space: num });
    } else {
      // fallback: regex against stringified price/space
      or.push({ price: { $regex: q, $options: "i" } }, { space: { $regex: q, $options: "i" } });
    }

    const results = await lessonsCollection.find({ $or: or }).toArray();
    res.json(results);
  } catch (err) {
    console.error("GET /search error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
