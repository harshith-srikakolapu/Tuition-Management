# Tuition Center Manager
 
A simple, mobile-friendly fee and attendance management system for small tuition and coaching centers, with automated reminders to parents.
 
> **Status:** In development. Live with one tuition center (see [Results](#results)).
> **Live demo:** _add link_ | **Demo video:** _add link_
 
---
 
## Problem Statement
 
Small tuition centers in India typically manage fees and attendance with paper notebooks, WhatsApp chats, or basic Excel sheets. Owners are teachers, not administrators, and have little time for bookkeeping.
 
- **Fee tracking is manual and error-prone.** Partial payments, advance payments, sibling discounts, and mid-month admissions are hard to record accurately, so owners often don't know exactly who owes what.
- **Collections depend on personal follow-ups.** Calling or messaging each parent takes hours every month and strains relationships.
- **Payment delays are unmeasured.** There is no visibility into average delay, collection rate, or repeat defaulters.
- **Attendance is disconnected from fees.** Paper registers make trends hard to see or share with parents.
- **Data is fragile.** Notebooks get lost, and spreadsheets are hard to maintain from a phone.
General school-management and accounting apps are built for large institutions: expensive, complex, and not designed for batch-based fees, cash/UPI payments, or WhatsApp reminders in regional languages.
 
## Objective
 
Let a small center owner record fees and attendance in under a minute, and automatically remind parents of dues, so that late payments and manual follow-up effort drop measurably.
 
## Features
 
**In scope (v1)**
- Student and batch management with per-student fee rules
- Payment recording: cash, UPI, partial, and advance payments
- Dues dashboard: who hasn't paid this month
- Automated reminders before and after the due date (WhatsApp / SMS, with a `wa.me` click-to-send fallback)
- Tap-to-mark attendance, built for phones
- Monthly collection report, exportable to PDF and Excel
**Out of scope (v1)**
Online payment gateway, exam and results management, multi-branch support, parent login portal.
 
## Tech Stack
 
| Layer | Choice |
|---|---|
| Backend | NestJS 11 (TypeScript) + Prisma ORM |
| Database | PostgreSQL |
| Frontend | Mobile-first React 18 + Vite |
| Messaging | WhatsApp Cloud API, with `wa.me` fallback |
| Scheduler | `@nestjs/schedule` (daily, 9 AM IST) |
| CI/CD | GitHub Actions |
| Hosting | Render or Railway (backend), Vercel (frontend) |
 
## Architecture
 
_Add an architecture diagram here (e.g. `docs/architecture.png`)._
 
```
[ React app (mobile) ] --> [ API server ] --> [ PostgreSQL ]
                                |
                                +--> [ Scheduler ] --> [ WhatsApp / SMS ]
```
 
## Data Model (overview)
 
- `students`: name, parent contact, batch, status
- `batches`: name, schedule, default monthly fee
- `fee_rules`: per-student fee, discounts, due day
- `payments`: amount, mode (cash/UPI), date, linked month
- `attendance`: student, date, present/absent
- `reminders`: student, due month, type, sent_at (unique key prevents duplicates)
## Key Design Decisions
 
- **Idempotent reminders.** Each reminder has a unique key (student + month + type), so a retried job never sends a parent the same message twice.
- **Partial and advance payments.** Payments are stored as separate records and dues are computed from them, rather than storing a single "paid" flag.
- **Mobile-first, low bandwidth.** Designed for low-end phones and slow connections; the owner should need no more than a 10-minute walkthrough.
- **Consent and privacy.** Student and parent data is stored only with the owner's consent and is never shared.
See [`docs/design-doc.md`](docs/design-doc.md) for trade-offs in detail.
 
## Getting Started
 
### Project layout

```
backend/    NestJS API (src/<module>/<module>.module.ts), Prisma schema + migrations, seed
frontend/   React SPA (src/pages/*), Vite dev server proxies /api → :3000
docs/       Design doc
```

### Prerequisites
- Node.js 22+
- PostgreSQL 14+ (local install, a free cloud DB such as Neon/Supabase, or Docker)

### Run locally (without Docker)

```bash
git clone https://github.com/<your-username>/tuition-center-manager.git
cd tuition-center-manager

# 1. API
cd backend
cp .env.example .env          # set DATABASE_URL (create the database first) and SECRET_KEY
npm install
npx prisma migrate deploy     # create tables
npm run db:seed               # optional demo data — login demo@example.com / demo1234
npm run dev                   # http://localhost:3000/api

# 2. Web app (new terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  (also reachable from your phone on the same Wi-Fi)
```

### Run with Docker

```bash
docker compose up --build     # web: http://localhost:8080, API: http://localhost:3000/api
```

### Run tests

```bash
cd backend && npm test        # dues engine, reminder planner, message templates
npm run typecheck             # backend and frontend both support this
```

### Environment variables (backend)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing key (required in production) |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated |
| `ENABLE_SCHEDULER` | `false` to disable the daily reminder job |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API token (optional) |
| `WHATSAPP_PHONE_ID` | WhatsApp sender phone ID (optional) |
| `WHATSAPP_TEMPLATE_BEFORE` / `_AFTER` | Approved template names with 5 body variables: parent, student, amount, due date, center (optional) |

Without the WhatsApp variables, reminders are queued in the app and sent with one tap via `wa.me`.

Frontend: `VITE_API_URL` — API base URL in production (e.g. `https://your-api.onrender.com/api`).

### Deploy

- **API → Render/Railway:** root `backend/`, build `npm install && npm run build`, start `npx prisma migrate deploy && npm start`; set the env vars above.
- **Web → Vercel:** root `frontend/`, framework Vite, set `VITE_API_URL`; `vercel.json` handles SPA routing.
 
## Results
 
Measured with a real tuition center after _N_ weeks of daily use.
 
| Metric | Before | After |
|---|---|---|
| Average payment delay (days) | _ | _ |
| Hours per week on fee follow-up | _ | _ |
| Reminders followed by payment within 3 days | n/a | _% |
| Students / batches managed | n/a | _ / _ |
| Daily use by owner | n/a | _ weeks |
 
> "Owner testimonial goes here." — _Name, Center name_
 
## Roadmap
 
- [x] Student, batch, and fee setup
- [x] Payment recording and dues dashboard
- [x] Reminder scheduler with idempotency
- [x] Attendance marking
- [x] Monthly reports (PDF / Excel)
- [ ] Deployment and weekly automated backups
- [ ] Parent portal (future)
- [ ] Online payment gateway (future)
- [ ] Multi-branch support (future)
## Cost
 
Runs on free tiers for hosting, database, and CI. The only variable cost is per-message WhatsApp/SMS pricing, which is roughly ₹100 to ₹500 per month for a single center.
 
