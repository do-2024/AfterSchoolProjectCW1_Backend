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
app.use(logger) // <-- this logs every request to the console

//
