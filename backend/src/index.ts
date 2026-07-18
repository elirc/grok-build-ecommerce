// =============================================================================
// BACKEND ENTRY POINT - grokbuildecommerceproject
// =============================================================================
//
// This is the main entry point for the Node.js / TypeScript / Express backend
// for the e-commerce platform.
//
// EDUCATIONAL NOTES (Mid/Senior Level Focus):
// - Keep the entry point thin. All real logic lives in routes/controllers/services.
// - This follows modern startup patterns for maintainability.
// - We use Express for simplicity while demonstrating proper layering.
// - Prisma provides type-safe database access.
// - Zod is used for validation (both runtime and TypeScript inference).
//
// Architecture Overview:
// Routes → Controllers → Services → Repositories (Prisma)
//
// All files contain extensive comments explaining:
// - What the code does
// - Why certain choices were made
// - How components interact
// - Trade-offs and common pitfalls
//
// Tech Stack Choices:
// - Node + TS + Express: Fast iteration, widely used in startups
// - Prisma + Postgres: Excellent DX + strong data integrity for orders/inventory
// - This setup teaches real architecture without over-engineering (no NestJS here)
//
// =============================================================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';
import authRoutes from './routes/authRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------

// CORS configuration for development with React frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Parse JSON request bodies
app.use(express.json());

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount feature routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// -----------------------------------------------------------------------------
// START SERVER
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 E-commerce Backend running on http://localhost:${PORT}`);
  console.log('📘 See JOURNAL.md and PHASE_PLANS.md for learning context');
});
