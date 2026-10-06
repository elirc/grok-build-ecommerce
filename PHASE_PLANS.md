> Historical starter notes. Read [README](README.md) and the [learning course](astraupskill/README.md) for implemented behavior and verified limits.

# PHASE PLANS - grokbuildecommerceproject

This document outlines a progressive roadmap for building this e-commerce platform, designed specifically to develop mid-to-senior level SWE skills.

## Current State (Foundation)

**What exists:**
- Basic project structure
- Layered backend architecture (routes → controllers → services → repositories)
- Prisma schema for core e-comm entities
- React frontend with TanStack Query skeleton
- Heavy comments explaining architecture and decisions

**Goal of this phase**: Understand the skeleton and why it's structured this way.

> **Status (2026-10-06, verified against code):** Superseded. The shipped backend keeps routes and repositories but has only one controller (`backend/src/controllers/productController.ts`); order routes call `services/orderService.ts`, which delegates to `repositories/orderRepository.ts`.

---

## Phase 1: Core Domain + Authentication

### Goals
- User authentication (register/login with JWT)
- Role-based access (Customer vs Admin)
- Basic product CRUD (for admin)
- Public product browsing (for customers)

### Implementation Focus
**Backend**
- User model + password hashing
- JWT generation and middleware
- Protect admin routes
- Basic product endpoints with validation (Zod)

**Frontend**
- Simple login/register pages
- Protected admin section
- Public product listing
- Use TanStack Query for data fetching

**Learning Objectives**
- Authentication patterns in fullstack apps
- Protecting routes on both sides
- Basic role-based authorization
- How frontend state management interacts with auth

> **Status (2026-10-06):** Shipped. JWT login/registration (`backend/src/routes/authRoutes.ts`, `services/authService.ts`), current-role checks per request (`middleware/auth.ts:38-65`), admin-only product CRUD with Zod contracts (`lib/validation.ts`), and a combined sign-in/register form in `frontend/src/App.tsx`. Registration cannot create an administrator.

---

## Phase 2: Cart & Checkout Flow

### Goals
- Add items to cart
- View and modify cart
- Checkout process (simulated payment)
- Create orders with line items
- Basic inventory decrement (using transactions)

### Implementation Focus
**Backend**
- Cart handling (can be session-based or DB-backed for learning)
- Order creation service
- Use database transactions to update inventory safely
- Order status (PENDING, PAID, etc.)

**Frontend**
- Cart UI (local state + sync with backend)
- Checkout form
- Order confirmation page
- Optimistic updates where appropriate

**Key Mid-Level Concepts**
- Transactional integrity (critical for inventory)
- Separating customer vs admin concerns
- Handling partial failures in checkout
- State management split (server state via TanStack Query vs client cart state)

> **Status (2026-10-06):** Shipped with a different cart design. The cart is tab-memory React state (`frontend/src/features/cart/CartPanel.tsx`), not session- or DB-backed, and there are no optimistic updates. Checkout reserves stock at order creation inside one transaction with a durable retry key (`backend/src/repositories/orderRepository.ts:85-186`); PAID is a simulated admin transition, not a payment step.

---

## Phase 3: Advanced API Design & Data Access

### Goals
- Proper pagination on all list endpoints
- Filtering and sorting (products by category/price, orders by status)
- Search functionality
- Consistent API responses and error handling

### Implementation Focus
**Backend**
- Add query parameter support (page, limit, sort, filter, search)
- Efficient queries (avoid N+1)
- Centralized error handling middleware
- OpenAPI documentation (or at least consistent schemas)

**Frontend**
- Advanced filter UI
- URL-synced filters (using react-router search params)
- Better loading and empty states

**Learning Objectives**
- Professional API design beyond basic CRUD
- Performance considerations in data access
- Handling complex query parameters cleanly

> **Status (2026-10-06):** Partly shipped. Lists take `q` (literal, case-insensitive search) and `page` with a fixed page size of 20 (`backend/src/lib/validation.ts:46-66`); orders also filter by `status`, products by `active`. Centralized error handling exists (`lib/errors.ts`). Not built: sorting parameters, OpenAPI, and URL-synced filters (`react-router-dom` is listed in `frontend/package.json` but not imported anywhere).

---

## Phase 4: Testing Strategy

### Goals
Build real confidence through tests.

### Implementation Focus
**Backend**
- Unit tests for services (especially order/inventory logic)
- Integration tests for routes (using supertest + test DB)
- Test role-based access rules

**Frontend**
- Component tests for key UI (product cards, cart)
- Hook tests for data fetching logic
- E2E tests with Playwright for checkout flow (optional but valuable)

**Mid-Level Emphasis**
- Test business rules, not just implementation
- Mock external dependencies properly
- Integration tests that exercise the full stack

> **Status (2026-10-06):** Shipped. 15 contract tests (`backend/src/__tests__/productService.test.ts`), 40 supertest integration tests against a helper-owned PostgreSQL cluster (`workflow.integration.test.ts`), 8 component tests, 3 setup tests, and 14 Playwright scenarios (`browser-tests/commerce.spec.mjs`). No hook tests.

---

## Phase 5: Advanced Features & Polish

### Suggested Extensions (pick based on interest)
- Product variants and inventory management
- Order history and status tracking for customers
- Admin dashboard (view orders, update inventory)
- Basic search across products
- File uploads for product images
- Simple reporting endpoints (sales by category)
- Background jobs (e.g., order confirmation emails)

### Architecture Evolution
- Introduce domain events for order lifecycle
- Add caching (Redis) for product listings
- Better error messages and validation
- Structured logging

> **Status (2026-10-06):** Customer order history and admin order review/status updates shipped (`frontend/src/features/orders/pages/OrdersPage.tsx`). Variants, image uploads, reporting endpoints, background jobs, Redis caching, and domain events were not built; the only structured log is the one-line JSON for 5xx responses in `lib/errors.ts:61-68`.

---

## Recommended Learning Order

1. Finish Phase 1 (auth + basic products) — get end-to-end flow working.
2. Phase 2 (cart + checkout) — this is where real complexity appears.
3. Phase 3 (pagination/filtering) — teaches professional API design.
4. Add tests as you go (don't wait until Phase 4).
5. Tackle one advanced feature from Phase 5.

After each major feature, spend time updating your understanding in JOURNAL.md style notes.

---

## Success Criteria for Mid-Level Growth

By the end of this project you should be comfortable with:
- Designing APIs that scale beyond basic CRUD
- Thinking in transactions and data integrity
- Separating concerns across layers
- Making intentional trade-offs and explaining them
- Building testable, maintainable fullstack applications

This project is designed to feel like real work at a small-to-mid size company.
