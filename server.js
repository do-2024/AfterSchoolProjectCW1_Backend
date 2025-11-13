// server.js
console.log('🟢 Server file starting...')

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'
import path from 'path'
import { fileURLToPath } from 'url'

// Allow __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// ====== LOGGER MIDDLEWARE (INLINE) ======
const logger = (req, res, next) => {
  const now = new Date().toISOString()
  console.log(`[${now}] ${req.method} ${req.url}`)
  next()
}

// ====== MIDDLEWARE ======
app.use(cors())
app.use(express.json())
app.use(logger) // logs every request to the console

// ====== STATIC FILE MIDDLEWARE ======
app.use(
  '/images',
  express.static(path.join(__dirname, 'public/images'), { fallthrough: false })
)

// Custom error handler for missing static files
app.use((err, req, res, next) => {
  if (err.status === 404) {
    res.status(404).json({ message: 'Image not found' })
  } else {
    next(err)
  }
})

// ====== DATABASE CONNECTION ======
let db, lessonsCollection, ordersCollection

async function connectToMongoDB() {
  try {
    console.log('🔌 Connecting to MongoDB Atlas...')
    const client = new MongoClient(process.env.MONGODB_URI)
    await client.connect()
    db = client.db('Shopping')
    lessonsCollection = db.collection('lessons')
    ordersCollection = db.collection('orders')
    console.log('✅ Connected to MongoDB Atlas')
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err)
  }
}

// ====== ROUTES ======

// Root test route
app.get('/', (req, res) => res.send('✅ Backend running successfully!'))

// ✅ GET /lessons — fetch all lessons
app.get('/lessons', async (req, res) => {
  try {
    const lessons = await lessonsCollection.find().toArray()
    res.status(200).json(lessons)
  } catch (err) {
    console.error('❌ Error fetching lessons:', err)
    res.status(500).json({ message: 'Error fetching lessons' })
  }
})

// ✅ POST /orders — create a new order
app.post('/orders', async (req, res) => {
  const { name, phone, lessons } = req.body
  if (!name || !phone || !Array.isArray(lessons) || lessons.length === 0) {
    return res.status(400).json({ message: 'Invalid order data' })
  }

  try {
    const newOrder = {
      name,
      phone,
      lessons, // [{ lessonId, qty }]
      createdAt: new Date()
    }
    const result = await ordersCollection.insertOne(newOrder)
    res.status(201).json({ message: '✅ Order created', orderId: result.insertedId })
  } catch (err) {
    console.error('❌ Failed to save order:', err)
    res.status(500).json({ message: 'Error saving order' })
  }
})

// ✅ PUT /lessons/:id — update lesson fields (e.g. spaces)
app.put('/lessons/:id', async (req, res) => {
  const { id } = req.params
  const updateData = req.body // e.g. { spaces: 3 }

  if (!updateData || typeof updateData !== 'object') {
    return res.status(400).json({ message: 'Invalid update data' })
  }

  try {
    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Lesson not found' })
    }

    res.json({ message: '✅ Lesson updated successfully' })
  } catch (err) {
    console.error('❌ Error updating lesson:', err)
    res.status(500).json({ message: 'Error updating lesson' })
  }
})

// Fallback 404 for unknown routes
app.use((req, res) => res.status(404).json({ message: 'Route not found' }))

// ====== START SERVER ======
app.listen(PORT, async () => {
  await connectToMongoDB()
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
