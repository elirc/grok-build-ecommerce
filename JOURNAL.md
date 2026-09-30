> Historical starter notes. Read [README](README.md) and the [learning course](astraupskill/README.md) for implemented behavior and verified limits.

# SWE Thought Process Journal - grokbuildecommerceproject

This journal captures the decision-making process of a senior engineer building this e-commerce platform for educational purposes.

## Why E-commerce as a Learning Project?

E-commerce is excellent for mid-level upskilling because it naturally involves:
- Complex data relationships (products, variants, inventory, orders, users)
- Transactional integrity (you can't oversell stock)
- Multiple user roles (customer vs admin)
- Business workflows (cart → checkout → order status)
- Performance considerations (search, inventory checks)
- Clear separation of concerns between customer-facing and admin functionality

This mirrors real work at small-mid size companies building internal tools or customer-facing platforms.

## High-Level Architecture Decisions

### Backend Layering

We use a classic layered architecture:
- Routes → Controllers → Services → Repositories

**Rationale**:
- Services contain business logic (e.g., "check inventory before creating order").
- Repositories abstract data access, making it easier to test and swap ORMs later.
- Controllers stay thin and focused on HTTP concerns.

This structure teaches proper separation that becomes critical as codebases grow.

**Trade-off**: Slightly more files than a flat structure, but far more maintainable.

### Why Prisma + PostgreSQL?

- PostgreSQL is the default for most serious applications at this scale.
- Prisma provides excellent TypeScript support and type safety.
- Inventory and orders require strong consistency and relationships — relational DB wins here.
- Migrations are first-class citizens.

### Frontend Architecture

- Feature-based folders (features/products, features/orders, features/cart)
- TanStack Query for all server state
- Local state kept minimal (forms, UI toggles)

**Why?**
- Feature folders scale much better than "pages + components".
- TanStack Query handles caching, loading states, and invalidation — critical for real apps.
- Avoids the common junior mistake of putting everything in global state or useEffect hell.

### Auth & Roles

- JWT for simplicity and statelessness.
- Role-based access (Customer vs Admin).
- In a real e-comm, you'd also have seller roles, but we keep it focused.

Authorization logic lives primarily in services/middleware (never trust the frontend alone).

## Key Domain Challenges

### Inventory Management

One of the most important parts of real e-commerce.

Decisions:
- Stock is decremented only after successful "payment" (simulated here).
- We use database transactions in the service layer for atomicity.
- Race conditions are a real concern — in production you'd use optimistic locking or DB constraints.

### Cart Handling

Simple in-memory cart for learning (tied to session/user in real systems).

Trade-off: We keep it basic so focus stays on architecture rather than full checkout complexity.

### Order Status Workflow

Orders move through states: PENDING → PAID → SHIPPED → DELIVERED.

This teaches state machines and why you shouldn't just use free-form strings.

## Common Junior Mistakes This Project Avoids

- Mixing business logic into route handlers
- Not using transactions for critical operations (inventory)
- Returning raw database objects to the frontend
- Putting too much logic in React components
- Ignoring role-based access on the backend

## How to Use This Journal

Read this before diving deep into code.

Whenever you see a pattern or structure, refer back here for the "why".

As you extend the project (see PHASE_PLANS.md), add your own reflections.

The real skill is not just writing code — it's understanding the reasoning behind it.
