import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorBox, Loading, PaymentModal, StatusBadge, TopBar } from '../components';
import type { Batch, StudentDetail, StudentListItem } from '../types';
import { fmtDate, fmtMonth, rupees, todayStr, useLoad } from '../utils';

export function StudentsPage() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [batchId, setBatchId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const batches = useLoad(() => api.get<Batch[]>('/batches'));
  const { data, error, loading } = useLoad(
    () => api.get<StudentListItem[]>('/students', { q: debounced || undefined, batchId: batchId || undefined, status }),
    [debounced, batchId, status],
  );
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <TopBar title="Students" />
      <div className="page">
        <input type="search" placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
        <div className="spacer" />
        <div className="chips">
          <button className={`chip ${!batchId ? 'on' : ''}`} onClick={() => setBatchId('')}>
            All batches
          </button>
          {batches.data?.map((b) => (
            <button key={b.id} className={`chip ${batchId === b.id ? 'on' : ''}`} onClick={() => setBatchId(b.id)}>
              {b.name}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={status === 'ACTIVE' ? 'on' : ''} onClick={() => setStatus('ACTIVE')}>
            Active
          </button>
          <button className={status === 'INACTIVE' ? 'on' : ''} onClick={() => setStatus('INACTIVE')}>
            Left
          </button>
        </div>
        <ErrorBox msg={error} />
        {loading && !data && <Loading />}
        {data && data.length === 0 && (
          <div className="card empty">
            No students yet. {batches.data?.length === 0 ? <Link to="/batches">Create a batch first</Link> : 'Tap ＋ to add one.'}
          </div>
        )}
        {data && data.length > 0 && (
          <div className="list">
            {data.map((s) => (
              <Link to={`/students/${s.id}`} className="row" key={s.id}>
                <div className="grow">
                  <div className="title">{s.name}</div>
                  <div className="sub">
                    {s.batchName} · {rupees(s.monthlyFee)}/mo
                  </div>
                </div>
                <div className="amt">
                  {s.outstanding > 0 ? <span style={{ color: 'var(--bad)' }}>{rupees(s.outstanding)}</span> : null}
                  <div>
                    <StatusBadge outstanding={s.outstanding} advance={s.advance} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <button className="fab" onClick={() => nav('/students/new')} aria-label="Add student">
        ＋
      </button>
    </>
  );
}

export function StudentDetailPage() {
  const { id } = useParams();
  const { data: s, error, loading, reload } = useLoad(() => api.get<StudentDetail>(`/students/${id}`), [id]);
  const [paying, setPaying] = useState(false);
  const [showAllMonths, setShowAllMonths] = useState(false);

  const deletePayment = async (pid: string) => {
    if (!confirm('Delete this payment? Dues will be recalculated.')) return;
    await api.del(`/payments/${pid}`);
    reload();
  };

  return (
    <>
      <TopBar title={s?.name ?? 'Student'} back right={s && <Link className="btn sm" to={`/students/${s.id}/edit`}>Edit</Link>} />
      <div className="page">
        <ErrorBox msg={error} />
        {loading && !s && <Loading />}
        {s && (
          <>
            <div className="card">
              <div className="kv">
                <span className="muted">Batch</span>
                <span>{s.batch.name}</span>
              </div>
              <div className="kv">
                <span className="muted">Parent</span>
                <span>
                  {s.parentName ?? '–'} · <a href={`tel:${s.parentPhone}`}>{s.parentPhone}</a>
                </span>
              </div>
              <div className="kv">
                <span className="muted">Monthly fee</span>
                <span>
                  {rupees(s.feeRule.effectiveMonthlyFee)}
                  {s.feeRule.discount > 0 && (
                    <span className="small muted"> ({rupees(s.feeRule.discount)} off{s.feeRule.discountReason ? ` · ${s.feeRule.discountReason}` : ''})</span>
                  )}
                </span>
              </div>
              <div className="kv">
                <span className="muted">Due day</span>
                <span>{s.feeRule.dueDay} of every month</span>
              </div>
              <div className="kv">
                <span className="muted">Joined</span>
                <span>
                  {fmtDate(s.joinedOn)}
                  {s.leftOn && ` · left ${fmtDate(s.leftOn)}`}
                </span>
              </div>
              {s.notes && <p className="small muted">{s.notes}</p>}
            </div>

            <div className="stats">
              <div className={`stat ${s.ledger.outstanding > 0 ? 'bad' : 'ok'}`}>
                <div className="label">Outstanding</div>
                <div className="value">{rupees(s.ledger.outstanding)}</div>
              </div>
              <div className="stat">
                <div className="label">Advance credit</div>
                <div className="value">{rupees(s.ledger.advance)}</div>
                {s.ledger.advanceMonths > 0 && <div className="small muted">covers {s.ledger.advanceMonths} more month(s)</div>}
              </div>
            </div>
            <div className="spacer" />
            <div className="btnrow">
              <button className="btn primary" onClick={() => setPaying(true)}>
                ＋ Payment
              </button>
              {s.reminderLink && (
                <a className="btn wa" href={s.reminderLink} target="_blank" rel="noreferrer">
                  💬 Remind
                </a>
              )}
            </div>

            <h2>Fee months</h2>
            {s.ledger.months.length === 0 ? (
              <div className="card empty">No fees charged yet.</div>
            ) : (
              <div className="list">
                {(showAllMonths ? s.ledger.months : s.ledger.months.slice(0, 6)).map((m) => (
                  <div className="row" key={m.month}>
                    <div className="grow">
                      <div className="title">{fmtMonth(m.month)}</div>
                      <div className="sub">
                        Due {fmtDate(m.dueDate)}
                        {m.paidOffOn && ` · paid ${fmtDate(m.paidOffOn)}`}
                        {m.delayDays ? ` (${m.delayDays}d late)` : ''}
                      </div>
                    </div>
                    <div className="amt">
                      {rupees(m.charge)}
                      <div>
                        <span className={`badge ${m.status === 'PAID' ? 'ok' : m.status === 'PARTIAL' ? 'warn' : 'bad'}`}>
                          {m.status === 'PARTIAL' ? `${rupees(m.balance)} left` : m.status === 'PAID' ? 'Paid' : 'Unpaid'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {s.ledger.months.length > 6 && !showAllMonths && (
              <button className="btn block sm" style={{ marginTop: 8 }} onClick={() => setShowAllMonths(true)}>
                Show all {s.ledger.months.length} months
              </button>
            )}

            <h2>Payments</h2>
            {s.payments.length === 0 ? (
              <div className="card empty">No payments yet.</div>
            ) : (
              <div className="list">
                {s.payments.map((p) => (
                  <div className="row" key={p.id}>
                    <div className="grow">
                      <div className="title">{rupees(p.amount)}</div>
                      <div className="sub">
                        {fmtDate(p.paidOn)} · {p.mode}
                        {p.reference && ` · ${p.reference}`}
                        {p.note && ` · ${p.note}`}
                      </div>
                    </div>
                    <button className="btn sm danger" onClick={() => deletePayment(p.id)} aria-label="Delete payment">
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            )}

            <h2>
              Attendance — {fmtMonth(s.attendance.month)}{' '}
              {s.attendance.total > 0 && (
                <span className="badge">
                  {Math.round((s.attendance.present / s.attendance.total) * 100)}% ({s.attendance.present}/{s.attendance.total})
                </span>
              )}
            </h2>
            {s.attendance.total === 0 ? (
              <div className="card empty">Not marked this month.</div>
            ) : (
              <div className="card small">
                {s.attendance.days.filter((d) => !d.present).length === 0
                  ? 'Present every marked day 👏'
                  : `Absent on: ${s.attendance.days
                      .filter((d) => !d.present)
                      .map((d) => fmtDate(d.date).replace(/ \d{4}$/, ''))
                      .join(', ')}`}
              </div>
            )}

            {s.reminders.length > 0 && (
              <>
                <h2>Reminders</h2>
                <div className="list">
                  {s.reminders.map((r) => (
                    <div className="row" key={r.id}>
                      <div className="grow">
                        <div className="title small">
                          {r.type === 'BEFORE_DUE' ? 'Before due' : 'Overdue'} · {fmtMonth(r.month)}
                        </div>
                        <div className="sub">{fmtDate(r.sentAt ?? r.createdAt)}</div>
                      </div>
                      <span className="badge muted">{r.status}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {paying && s && (
        <PaymentModal student={{ id: s.id, name: s.name }} suggested={s.ledger.outstanding} onClose={() => setPaying(false)} onSaved={reload} />
      )}
    </>
  );
}

interface FormState {
  name: string;
  parentName: string;
  parentPhone: string;
  batchId: string;
  joinedOn: string;
  status: 'ACTIVE' | 'INACTIVE';
  notes: string;
  allowReminders: boolean;
  monthlyFee: string; // '' => batch default
  discount: string;
  discountReason: string;
  dueDay: string;
  proRateFirstMonth: boolean;
}

export function StudentFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const nav = useNavigate();
  const batches = useLoad(() => api.get<Batch[]>('/batches'));
  const [f, setF] = useState<FormState>({
    name: '',
    parentName: '',
    parentPhone: '',
    batchId: '',
    joinedOn: todayStr(),
    status: 'ACTIVE',
    notes: '',
    allowReminders: true,
    monthlyFee: '',
    discount: '0',
    discountReason: '',
    dueDay: '5',
    proRateFirstMonth: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<StudentDetail>(`/students/${id}`).then((s) =>
      setF({
        name: s.name,
        parentName: s.parentName ?? '',
        parentPhone: s.parentPhone,
        batchId: s.batchId,
        joinedOn: s.joinedOn,
        status: s.status,
        notes: s.notes ?? '',
        allowReminders: s.allowReminders,
        monthlyFee: s.feeRule.monthlyFee === null ? '' : String(s.feeRule.monthlyFee),
        discount: String(s.feeRule.discount),
        discountReason: s.feeRule.discountReason ?? '',
        dueDay: String(s.feeRule.dueDay),
        proRateFirstMonth: s.feeRule.proRateFirstMonth,
      }),
    );
  }, [id]);

  useEffect(() => {
    if (!f.batchId && batches.data?.length) setF((x) => ({ ...x, batchId: batches.data!.find((b) => b.active)?.id ?? '' }));
  }, [batches.data, f.batchId]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  const batch = batches.data?.find((b) => b.id === f.batchId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: f.name.trim(),
      parentName: f.parentName.trim() || null,
      parentPhone: f.parentPhone.trim(),
      batchId: f.batchId,
      joinedOn: f.joinedOn,
      status: f.status,
      notes: f.notes.trim() || null,
      allowReminders: f.allowReminders,
      monthlyFee: f.monthlyFee === '' ? null : Number(f.monthlyFee),
      discount: Number(f.discount || 0),
      discountReason: f.discountReason.trim() || null,
      dueDay: Number(f.dueDay),
      proRateFirstMonth: f.proRateFirstMonth,
    };
    try {
      const s = editing ? await api.patch<StudentDetail>(`/students/${id}`, body) : await api.post<StudentDetail>('/students', body);
      nav(`/students/${s.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('Permanently delete this student and all their payments and attendance? To keep history, set status to "Left" instead.')) return;
    await api.del(`/students/${id}`);
    nav('/students', { replace: true });
  };

  if (batches.data && batches.data.length === 0) {
    return (
      <>
        <TopBar title="Add student" back />
        <div className="page">
          <div className="card empty">
            Create a batch first. <Link to="/batches">Go to batches →</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title={editing ? 'Edit student' : 'Add student'} back />
      <form className="page" onSubmit={submit}>
        <ErrorBox msg={error} />
        <label className="field">
          <span>Student name</span>
          <input required value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus={!editing} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Parent name</span>
            <input value={f.parentName} onChange={(e) => set('parentName', e.target.value)} />
          </label>
          <label className="field">
            <span>Parent WhatsApp</span>
            <input required type="tel" inputMode="tel" placeholder="98765 43210" value={f.parentPhone} onChange={(e) => set('parentPhone', e.target.value)} />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Batch</span>
            <select required value={f.batchId} onChange={(e) => set('batchId', e.target.value)}>
              {batches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {!b.active ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Joined on</span>
            <input required type="date" value={f.joinedOn} onChange={(e) => set('joinedOn', e.target.value)} />
          </label>
        </div>

        <h2>Fees</h2>
        <div className="grid2">
          <label className="field">
            <span>Monthly fee (₹)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={batch ? `${batch.defaultMonthlyFee} (batch default)` : ''}
              value={f.monthlyFee}
              onChange={(e) => set('monthlyFee', e.target.value)}
            />
          </label>
          <label className="field">
            <span>Due day of month</span>
            <input required type="number" inputMode="numeric" min={1} max={31} value={f.dueDay} onChange={(e) => set('dueDay', e.target.value)} />
          </label>
        </div>
        <div className="grid2">
          <label className="field">
            <span>Discount (₹/month)</span>
            <input type="number" inputMode="numeric" min={0} value={f.discount} onChange={(e) => set('discount', e.target.value)} />
          </label>
          <label className="field">
            <span>Discount reason</span>
            <input placeholder="e.g. Sibling" value={f.discountReason} onChange={(e) => set('discountReason', e.target.value)} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.proRateFirstMonth} onChange={(e) => set('proRateFirstMonth', e.target.checked)} />
          <span>Charge only for remaining days in the joining month</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={f.allowReminders} onChange={(e) => set('allowReminders', e.target.checked)} />
          <span>Send automatic fee reminders to parent</span>
        </label>

        {editing && (
          <>
            <h2>Status</h2>
            <div className="seg">
              <button type="button" className={f.status === 'ACTIVE' ? 'on' : ''} onClick={() => set('status', 'ACTIVE')}>
                Active
              </button>
              <button type="button" className={f.status === 'INACTIVE' ? 'on' : ''} onClick={() => set('status', 'INACTIVE')}>
                Left
              </button>
            </div>
            {f.status === 'INACTIVE' && <p className="small muted">Fees stop being charged after the month they leave.</p>}
          </>
        )}

        <label className="field">
          <span>Notes</span>
          <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Add student'}
        </button>
        {editing && (
          <button type="button" className="btn danger block" style={{ marginTop: 10 }} onClick={remove}>
            Delete student
          </button>
        )}
      </form>
    </>
  );
}
