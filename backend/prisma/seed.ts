/**
 * Demo data: one center, two batches, a handful of students with a realistic mix
 * of paid / partial / advance / overdue fees and recent attendance.
 * Login: demo@example.com / demo1234
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { addDays, addMonths, monthOf, toDbDate, todayIST } from '../src/common/dates';

const prisma = new PrismaClient();
const EMAIL = 'demo@example.com';

async function main() {
  await prisma.center.deleteMany({ where: { users: { some: { email: EMAIL } } } });

  const today = todayIST();
  const month = monthOf(today);
  const prev = addMonths(month, -1);
  const prev2 = addMonths(month, -2);

  const center = await prisma.center.create({
    data: {
      name: 'Bright Minds Tuition',
      phone: '9876500000',
      address: 'MG Road, Hyderabad',
      upiId: 'brightminds@upi',
      users: { create: { name: 'Demo Owner', email: EMAIL, passwordHash: await bcrypt.hash('demo1234', 10) } },
    },
  });
  const b1 = await prisma.batch.create({
    data: { centerId: center.id, name: 'Class 8 Maths', schedule: 'Mon–Fri 5–6 PM', defaultMonthlyFee: 1200 },
  });
  const b2 = await prisma.batch.create({
    data: { centerId: center.id, name: 'Class 10 Science', schedule: 'Mon/Wed/Fri 6–7:30 PM', defaultMonthlyFee: 1800 },
  });

  type Seed = {
    name: string;
    parentName: string;
    phone: string;
    batchId: string;
    joinedOn: string;
    fee?: { monthlyFee?: number; discount?: number; discountReason?: string; dueDay?: number; proRateFirstMonth?: boolean };
    payments: { amount: number; paidOn: string; mode: 'CASH' | 'UPI' }[];
  };
  const students: Seed[] = [
    { name: 'Aarav Sharma', parentName: 'Mr. Sharma', phone: '9876500001', batchId: b1.id, joinedOn: `${prev2}-01`,
      payments: [ { amount: 1200, paidOn: `${prev2}-04`, mode: 'UPI' }, { amount: 1200, paidOn: `${prev}-06`, mode: 'UPI' }, { amount: 1200, paidOn: `${month}-03`, mode: 'UPI' } ] },
    { name: 'Diya Reddy', parentName: 'Mrs. Reddy', phone: '9876500002', batchId: b1.id, joinedOn: `${prev2}-01`,
      fee: { discount: 200, discountReason: 'Sibling discount' },
      payments: [ { amount: 1000, paidOn: `${prev2}-05`, mode: 'CASH' }, { amount: 500, paidOn: `${prev}-12`, mode: 'CASH' } ] },
    { name: 'Kabir Reddy', parentName: 'Mrs. Reddy', phone: '9876500002', batchId: b2.id, joinedOn: `${prev2}-01`,
      fee: { discount: 200, discountReason: 'Sibling discount' },
      payments: [ { amount: 4800, paidOn: `${prev2}-02`, mode: 'UPI' } ] },
    { name: 'Meera Iyer', parentName: 'Mr. Iyer', phone: '9876500003', batchId: b2.id, joinedOn: `${prev2}-01`,
      payments: [ { amount: 1800, paidOn: `${prev2}-15`, mode: 'CASH' } ] },
    { name: 'Rohan Gupta', parentName: 'Mrs. Gupta', phone: '9876500004', batchId: b1.id, joinedOn: `${prev}-18`,
      fee: { proRateFirstMonth: true, dueDay: 10 },
      payments: [ { amount: 600, paidOn: `${prev}-18`, mode: 'UPI' } ] },
    { name: 'Sneha Patel', parentName: 'Mr. Patel', phone: '9876500005', batchId: b2.id, joinedOn: `${prev}-01`,
      fee: { monthlyFee: 1500, discountReason: 'Merit scholarship' },
      payments: [ { amount: 9000, paidOn: `${prev}-01`, mode: 'UPI' } ] },
    { name: 'Vikram Singh', parentName: 'Mrs. Singh', phone: '9876500006', batchId: b1.id, joinedOn: `${month}-01`, payments: [] },
  ];

  const created = [];
  for (const s of students) {
    const st = await prisma.student.create({
      data: {
        centerId: center.id,
        batchId: s.batchId,
        name: s.name,
        parentName: s.parentName,
        parentPhone: s.phone,
        joinedOn: toDbDate(s.joinedOn),
        feeRule: { create: { ...(s.fee ?? {}) } },
        payments: {
          create: s.payments
            .filter((p) => p.paidOn <= today)
            .map((p) => ({ centerId: center.id, amount: p.amount, mode: p.mode, paidOn: toDbDate(p.paidOn), forMonth: monthOf(p.paidOn) })),
        },
      },
    });
    created.push(st);
  }

  // Attendance for the last 10 weekdays
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, -i);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const [idx, st] of created.entries()) {
      if (d < students[idx].joinedOn) continue;
      await prisma.attendance.create({ data: { studentId: st.id, date: toDbDate(d), present: (i + idx) % 5 !== 0 } });
    }
  }

  console.log(`Seeded demo center. Log in with ${EMAIL} / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
