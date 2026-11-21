# Design Doc: Tuition Center Manager (v1)

## Goals

- A center owner records a payment or a day's attendance in **under a minute**, on a low-end phone.
- Parents get fee reminders **without the owner chasing them**, and never get the same reminder twice.
- The owner always knows **exactly who owes what**, even with partial, advance and mid-month payments.

## Architecture

```
React SPA (Vite, mobile-first)  ──HTTPS/JSON──▶  NestJS API  ──Prisma──▶  PostgreSQL
                                                    │
                                                    └─ @nestjs/schedule (daily 09:00 IST)
                                                         └─▶ WhatsApp Cloud API  |  wa.me queue
```

- **Multi-tenant by center.** Each owner signs up and gets a `Center`. A JWT carries `centerId`, and every query is scoped by it. A global `AuthGuard` protects every route except signup, login and health.
- **One process.** The scheduler runs inside the API process. With more than one API instance, set `ENABLE_SCHEDULER=false` on the extra instances. If two runs do overlap, the idempotency key still prevents duplicates (see below).

## Fees and dues: computed, never flagged

The system stores **facts** (fee rules and payments) and **derives** dues from them. It never stores a "paid" flag.

1. **Charges.** Every month from the joining month through the leaving month gets one charge: `(student fee ?? batch default) − discount`. The joining month can be pro-rated by the days remaining.
2. **Due date.** `dueDay` is clamped to the length of the month. If a student joins after the due day, the first month falls due on the joining date.
3. **Allocation.** Payments are sorted by date and applied **FIFO** to the oldest unpaid month.
   - A **partial payment** leaves that month `PARTIAL`.
   - An **advance payment** spills into future months and is shown as credit until those months arrive.
   - **Arrears** are the old months still unpaid.
4. **Delay metrics.** When a month is fully covered, the date of the covering payment is its `paidOffOn`. `delayDays = max(0, paidOffOn − dueDate)` feeds the "average payment delay" metric.

All of this lives in [`backend/src/dues/dues.engine.ts`](../backend/src/dues/dues.engine.ts), a pure function with unit tests.

**Trade-offs**

- Dues are recomputed on every read. That is O(students × months), which is trivial at small-center scale (hundreds of students, a few years of history). If it ever matters, cache ledgers per student and invalidate them on payment or fee-rule changes.
- Changing a student's fee **applies to all past months too**, because fee history is not versioned in v1. Owners are told to change fees at the start of a month. A future `fee_rule_history (effective_from)` table would fix this.
- `payments.forMonth` is stored for display and receipts only. Allocation is always FIFO, so a mis-tagged month can never corrupt the balance.

## Reminders: idempotent by construction

- **Planning** ([`reminder.planner.ts`](../backend/src/reminders/reminder.planner.ts)):
  - `BEFORE_DUE` goes out from `dueDate − daysBefore` up to the due date.
  - `AFTER_DUE` goes out from `dueDate + daysAfter` onwards.
  - Both windows are open-ended. If the server was down on the exact day, the next run catches up.
- **Idempotency.** `reminders` has `UNIQUE (student_id, month, type)`.
  - The job does `INSERT` first and treats a unique violation (`P2002`) as "already handled".
  - Only the run that inserted the row may dispatch it, so retries, overlapping runs and the "Run now" button cannot double-send.
- **Delivery.**
  - **WhatsApp Cloud API (optional).** Sends a pre-approved template. On failure the row becomes `FAILED` with the error message and is retried on the next run. A `SENT` row is never re-sent.
  - **wa.me fallback (default).** The row becomes `MANUAL` and appears under *Reminders → To send*. Tapping *Send* opens WhatsApp with the text pre-filled and marks the row `SENT`. This costs nothing and needs no Meta business verification.
- **Opt-out.** Each student has `allowReminders`, and each center has `remindersEnabled` plus its own timing.

## Attendance

- `attendance` has `UNIQUE (student_id, date)`, and saves are upserts, so re-marking a day just corrects it.
- The UI starts everyone as **present**, so the owner only taps the absentees. That is the fastest possible flow for a typical batch.

## Reports

`GET /reports/monthly` returns:

- expected fees, collected fees and collection rate
- receipts by mode (cash, UPI, other)
- outstanding amount and the list of defaulters
- average delay and on-time percentage
- **reminder conversion**: the share of sent reminders followed by a payment within 3 days

These metrics map directly to the README's Results table. The same data is exported as PDF (pdfkit) or Excel (exceljs).

## Privacy and security

- Passwords are hashed with bcrypt (10 rounds).
- JWTs expire after 30 days, and `SECRET_KEY` is required in production.
- All input is validated with `class-validator`, and unknown fields are stripped.
- Parent phone numbers are used only for messages the owner configures. There are no third-party analytics.
- Deleting a student cascades to their payments, attendance and reminders, so their data can be fully erased. Marking a student "Left" keeps their history.

## Out of scope (v1)

Payment gateway, exams and results, multi-branch, parent portal, staff accounts, SMS provider. The `WhatsAppProvider` is the seam for adding SMS later.
