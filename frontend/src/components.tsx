import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from './api';
import type { CreatePaymentResponse, PaymentMode, StudentListItem } from './types';
import { rupees, todayStr } from './utils';

export function TopBar({ title, back, right }: { title: string; back?: boolean; right?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="topbar">
      {back && (
        <button className="back btn sm" style={{ border: 0, background: 'none' }} onClick={() => nav(-1)} aria-label="Back">
          ←
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function BottomNav({ pendingReminders = 0 }: { pendingReminders?: number }) {
  const items = [
    { to: '/', ico: '🏠', label: 'Home', end: true },
    { to: '/students', ico: '👥', label: 'Students' },
    { to: '/attendance', ico: '✅', label: 'Attendance' },
    { to: '/reminders', ico: '🔔', label: 'Reminders', dot: pendingReminders },
    { to: '/more', ico: '☰', label: 'More' },
  ];
  return (
    <div className="bottomnav">
      <nav>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico" aria-hidden>
              {i.ico}
            </span>
            {i.label}
            {!!i.dot && <span className="dot">{i.dot > 99 ? '99+' : i.dot}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Loading = () => <div className="spinner">Loading…</div>;
export const ErrorBox = ({ msg }: { msg: string | null }) => (msg ? <div className="alert">{msg}</div> : null);

export function StatusBadge({ outstanding, overdueDays, advance }: { outstanding: number; overdueDays?: number; advance?: number }) {
  if (outstanding > 0 && overdueDays && overdueDays > 0) return <span className="badge bad">{overdueDays}d overdue</span>;
  if (outstanding > 0) return <span className="badge warn">Due</span>;
  if (advance && advance > 0) return <span className="badge">Advance {rupees(advance)}</span>;
  return <span className="badge ok">Paid</span>;
}

/** Record a payment. Pass `student` to preselect, otherwise a picker is shown. */
export function PaymentModal({
  student,
  suggested,
  onClose,
  onSaved,
}: {
  student?: { id: string; name: string };
  suggested?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [studentId, setStudentId] = useState(student?.id ?? '');
  const [amount, setAmount] = useState(suggested && suggested > 0 ? String(suggested) : '');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [paidOn, setPaidOn] = useState(todayStr());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreatePaymentResponse | null>(null);

  useEffect(() => {
    if (!student) api.get<StudentListItem[]>('/students', { status: 'ACTIVE' }).then(setStudents).catch(() => {});
  }, [student]);

  const pick = (id: string) => {
    setStudentId(id);
    const s = students.find((x) => x.id === id);
    if (s && s.outstanding > 0) setAmount(String(s.outstanding));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<CreatePaymentResponse>('/payments', {
        studentId,
        amount: Number(amount),
        mode,
        paidOn,
        reference: reference || undefined,
        note: note || undefined,
      });
      setDone(r);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal title="Payment saved" onClose={onClose}>
        <div className="alert ok">
          {rupees(done.payment.amount)} recorded.{' '}
          {done.outstanding > 0 ? `Balance due: ${rupees(done.outstanding)}` : done.advance > 0 ? `Advance credit: ${rupees(done.advance)}` : 'All dues cleared.'}
        </div>
        <p className="small muted">{done.receiptText}</p>
        <div className="btnrow">
          <a className="btn wa" href={done.receiptLink} target="_blank" rel="noreferrer">
            Send receipt on WhatsApp
          </a>
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={student ? `Payment — ${student.name}` : 'Record payment'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox msg={error} />
        {!student && (
          <label className="field">
            <span>Student</span>
            <select required value={studentId} onChange={(e) => pick(e.target.value)}>
              <option value="">Select student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.batchName}
                  {s.outstanding > 0 ? ` (due ${rupees(s.outstanding)})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>Amount (₹)</span>
          <input required type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </label>
        <div className="seg" role="radiogroup" aria-label="Payment mode">
          {(['CASH', 'UPI', 'OTHER'] as PaymentMode[]).map((m) => (
            <button type="button" key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} aria-pressed={mode === m}>
              {m === 'CASH' ? 'Cash' : m === 'UPI' ? 'UPI' : 'Other'}
            </button>
          ))}
        </div>
        <div className="grid2">
          <label className="field">
            <span>Date</span>
            <input type="date" value={paidOn} max={todayStr()} onChange={(e) => setPaidOn(e.target.value)} required />
          </label>
          <label className="field">
            <span>{mode === 'UPI' ? 'UPI ref (optional)' : 'Reference (optional)'}</span>
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn primary block" disabled={busy || !studentId || !amount}>
          {busy ? 'Saving…' : 'Save payment'}
        </button>
      </form>
    </Modal>
  );
}
