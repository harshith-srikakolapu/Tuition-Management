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
| Backend | _FastAPI / NestJS (update to your choice)_ |
| Database | PostgreSQL |
| Frontend | Mobile-first React |
| Messaging | WhatsApp Cloud API, with `wa.me` fallback |
| Scheduler | Celery / cron |
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
 
### Prerequisites
- Docker and Docker Compose
- Node.js / Python (match your stack)
### Run locally
 
```bash
git clone https://github.com/<your-username>/tuition-center-manager.git
cd tuition-center-manager
cp .env.example .env        # fill in database and messaging credentials
docker compose up --build
```
 
The app will be available at `http://localhost:3000`.
 
### Run tests
 
```bash
# update for your stack
make test
```
 
### Environment variables
 
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | Session / JWT signing key |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API token (optional) |
| `WHATSAPP_PHONE_ID` | WhatsApp sender phone ID (optional) |
 
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
 
- [ ] Student, batch, and fee setup
- [ ] Payment recording and dues dashboard
- [ ] Reminder scheduler with idempotency
- [ ] Attendance marking
- [ ] Monthly reports (PDF / Excel)
- [ ] Deployment and weekly automated backups
- [ ] Parent portal (future)
- [ ] Online payment gateway (future)
- [ ] Multi-branch support (future)
## Cost
 
Runs on free tiers for hosting, database, and CI. The only variable cost is per-message WhatsApp/SMS pricing, which is roughly ₹100 to ₹500 per month for a single center.
 
## License
 
MIT. See [LICENSE](LICENSE).
 
## Author
 
**Your Name**
[LinkedIn](https://linkedin.com/in/your-profile) | [Email](mailto:you@example.com)
 
