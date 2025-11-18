import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

// For serving images in /images folder
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Static images
app.use("/images", express.static(path.join(__dirname, "images")));

// Logger middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

const mongoURI = process.env.MONGODB_URI;
const client = new MongoClient(mongoURI);

let lessonsCollection;
let ordersCollection;

// Connect to MongoDB
async function connectDB() {
    try {
        await client.connect();
        const db = client.db("Shopping");

        lessonsCollection = db.collection("lessons");
        ordersCollection = db.collection("orders");

        console.log("Connected to MongoDB!");
    } catch (err) {
        console.error("DB connection error:", err);
    }
}

connectDB();

/* ===========================
   GET ALL LESSONS
=========================== */
app.get("/lessons", async (req, res) => {
    try {
        const lessons = await lessonsCollection.find().toArray();
        res.json(lessons);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch lessons" });
    }
});

/* ===========================
   SEARCH LESSONS
=========================== */
app.get("/search", async (req, res) => {
    const query = req.query.q;

    if (!query || query.trim() === "") {
        return res.json([]);
    }

    const regex = new RegExp(query, "i"); // case-insensitive

    try {
        const results = await lessonsCollection.find({
            $or: [
                { subject: regex },
                { location: regex },
                { price: { $regex: regex } }, 
                { space: { $regex: regex } }
            ]
        }).toArray();

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "Search failed" });
    }
});

/* ===========================
   PLACE ORDER
=========================== */
app.post("/orders", async (req, res) => {
    const { lessonId, name, phone, quantity } = req.body;

    if (!lessonId || !name || !phone || !quantity) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // Convert lessonId into ObjectId
        const lesson = await lessonsCollection.findOne({
            _id: new ObjectId(lessonId)
        });

        if (!lesson) {
            return res.status(404).json({ error: "Lesson not found" });
        }

        // Check if enough spaces exist
        if (lesson.space < quantity) {
            return res.status(400).json({ error: "Not enough spaces available" });
        }

        // Insert order into DB
        await ordersCollection.insertOne({
            lessonId,
            name,
            phone,
            quantity,
            date: new Date()
        });

        // Reduce available spaces
        await lessonsCollection.updateOne(
            { _id: lesson._id },
            { $inc: { space: -quantity } }
        );

        res.json({ message: "Order placed successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Order failed" });
    }
});

/* ===========================
   UPDATE SPACES (PUT)
=========================== */
app.put("/lessons/:id", async (req, res) => {
    const id = req.params.id;
    const { space } = req.body;

    if (typeof space !== "number") {
        return res.status(400).json({ error: "Space must be a number" });
    }

    try {
        const result = await lessonsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { space } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Lesson not found" });
        }

        res.json({ message: "Space updated successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to update space" });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
