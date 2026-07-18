# grokbuildecommerceproject

A full-stack E-commerce Platform built for educational purposes to upskill to mid/senior SWE level.

## Overview

This project simulates building a realistic e-commerce system (products, cart, orders, inventory) using modern JavaScript stack.

**Goal**: Teach advanced CRUD patterns, architecture, APIs, testing, and real-world decision making that you'd encounter at a small-to-mid size company.

## Tech Stack

**Backend**
- Node.js + TypeScript
- Express.js
- Prisma ORM + PostgreSQL
- Zod for validation
- JWT authentication

**Frontend**
- React + TypeScript (Vite)
- TanStack Query (for data fetching/caching)
- React Hook Form + Zod
- Tailwind CSS
- React Router

**Other**
- Docker Compose for local Postgres
- Heavy comments throughout for learning

## Project Structure

```
grokbuildecommerceproject/
├── backend/                 # Express + Prisma API
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── middleware/
│   │   └── types/
│   └── prisma/
├── frontend/                # React app
│   └── src/
│       ├── features/        # Feature-based (products, cart, orders, admin)
│       ├── components/
│       ├── hooks/
│       ├── api/
│       └── lib/
├── docker-compose.yml
├── JOURNAL.md               # Senior SWE thought process
├── PHASE_PLANS.md           # Implementation roadmap
└── README.md
```

## How to Use for Upskilling

1. Read **JOURNAL.md** first — explains the "why" behind architecture choices.
2. Read **PHASE_PLANS.md** for the step-by-step learning path.
3. Explore the code — comments explain specific lines, interactions, trade-offs, and mid-level concepts.

This is **not** meant to be a perfect production app. The value is in the comments, decisions, and learning opportunities.

Start by reading the docs, then dive into the code.
