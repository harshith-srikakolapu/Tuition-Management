import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Loading, Modal, TopBar } from '../components';
import type { Batch, Center, MonthlyReport } from '../types';
import { fmtDate, rupees, thisMonth, useLoad } from '../utils';

export function MorePage() {
  const { user, center, logout } = useAuth();
  return (
    <>
      <TopBar title="More" />
      <div className="page">
        <div className="card">
          <h3>{center?.name}</h3>
          <div className="small muted">
            {user?.name} · {user?.email}
          </div>
        </div>
        <div className="list">
          <Link className="row" to="/reports">
            <span>📊</span>
            <div className="grow title">Monthly reports</div>›
          </Link>
          <Link className="row" to="/batches">
            <span>🗂️</span>
            <div className="grow title">Batches & fees</div>›
          </Link>
          <Link className="row" to="/settings">
            <span>⚙️</span>
            <div className="grow title">Center & reminder settings</div>›
          </Link>
        </div>
        <div className="spacer" />
        <button className="btn block danger" onClick={logout}>
          Log out
        </button>
      </div>
    </>
  );
}

export function ReportsPage() {
  const [month, setMonth] = useState(thisMonth());
  const { data: r, error, loading } = useLoad(() => api.get<MonthlyReport>('/reports/monthly', { month }), [month]);
  const [dlError, setDlError] = useState<string | null>(null);
  const download = (ext: 'pdf' | 'xlsx') =>
    api.download(`/reports/monthly.${ext}?month=${month}`, `collection-${month}.${ext}`).catch((e) => setDlError(e.message));
  const pct = (n: number | null) => (n === null ? '–' : `${n}%`);

  return (
    <>
      <TopBar title="Monthly report" back />
      <div className="page">
        <label className="field">
          <span>Month</span>
          <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} />
        </label>
        <div className="btnrow">
          <button className="btn" onClick={() => download('pdf')}>
            ⬇ PDF
          </button>
          <button className="btn" onClick={() => download('xlsx')}>
            ⬇ Excel
          </button>
        </div>
        <ErrorBox msg={dlError} />
        <div className="spacer" />
        <ErrorBox msg={error} />
        {loading && <Loading />}
        {r && !loading && (
          <>
            <div className="stats">
              <div className="stat">
                <div className="label">Expected</div>
                <div className="value">{rupees(r.summary.expected)}</div>
              </div>
              <div className="stat ok">
                <div className="label">Collected ({pct(r.summary.collectionRate)})</div>
                <div className="value">{rupees(r.summary.collectedForMonth)}</div>
              </div>
              <div className="stat bad">
                <div className="label">Outstanding</div>
                <div className="value">{rupees(r.summary.outstanding)}</div>
              </div>
              <div className="stat">
                <div className="label">Avg. delay</div>
                <div className="value">{r.summary.avgDelayDays === null ? '–' : `${r.summary.avgDelayDays}d`}</div>
              </div>
            </div>
            <div className="spacer" />
            <div className="card small">
              <div className="kv">
                <span>Total received in month</span>
                <b>{rupees(r.summary.collectedInMonth)}</b>
              </div>
              <div className="kv">
                <span>Cash / UPI / Other</span>
                <span>
                  {rupees(r.summary.byMode.CASH)} / {rupees(r.summary.byMode.UPI)} / {rupees(r.summary.byMode.OTHER)}
                </span>
              </div>
              <div className="kv">
                <span>Paid on time</span>
                <span>{pct(r.summary.onTimePercent)}</span>
              </div>
              <div className="kv">
                <span>Reminders → paid within 3 days</span>
                <span>
                  {r.summary.remindersPaidWithin3Days}/{r.summary.remindersSent} ({pct(r.summary.reminderConversion)})
                </span>
              </div>
            </div>

            <h2>Students with dues ({r.summary.unpaidStudents})</h2>
            <div className="card scroll-x">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="r">Month</th>
                    <th className="r">Old</th>
                    <th className="r">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.dues
                    .filter((d) => d.outstanding > 0)
                    .map((d) => (
                      <tr key={d.studentId}>
                        <td>
                          <Link to={`/students/${d.studentId}`}>{d.name}</Link>
                          <div className="muted">{d.batchName}</div>
                        </td>
                        <td className="r">{rupees(d.monthBalance)}</td>
                        <td className="r">{rupees(d.arrears)}</td>
                        <td className="r">
                          <b>{rupees(d.outstanding)}</b>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {r.summary.unpaidStudents === 0 && <div className="empty">No dues 🎉</div>}
            </div>

            <h2>Payments ({r.payments.length})</h2>
            {r.payments.length === 0 ? (
              <div className="card empty">No payments this month.</div>
            ) : (
              <div className="list">
                {r.payments.map((p, i) => (
                  <div className="row" key={i}>
                    <div className="grow">
                      <div className="title">{p.studentName}</div>
                      <div className="sub">
                        {fmtDate(p.paidOn)} · {p.mode}
                      </div>
                    </div>
                    <div className="amt">{rupees(p.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export function BatchesPage() {
  const { data, error, loading, reload } = useLoad(() => api.get<Batch[]>('/batches'));
  const [editing, setEditing] = useState<Batch | 'new' | null>(null);
  return (
    <>
      <TopBar title="Batches" back right={<button className="btn sm primary" onClick={() => setEditing('new')}>＋ Add</button>} />
      <div className="page">
        <ErrorBox msg={error} />
        {loading && !data && <Loading />}
        {data && data.length === 0 && (
          <div className="card empty">
            A batch is a group taught together, e.g. “Class 8 Maths, 5–6 PM”.
            <div className="spacer" />
            <button className="btn primary" onClick={() => setEditing('new')}>
              Create first batch
            </button>
          </div>
        )}
        {data && data.length > 0 && (
          <div className="list">
            {data.map((b) => (
              <button className="row" key={b.id} onClick={() => setEditing(b)} style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--border)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <div className="grow">
                  <div className="title">
                    {b.name} {!b.active && <span className="badge muted">Archived</span>}
                  </div>
                  <div className="sub">
                    {b.schedule ? `${b.schedule} · ` : ''}
                    {b.activeStudents} students
                  </div>
                </div>
                <div className="amt">{rupees(b.defaultMonthlyFee)}/mo</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <BatchModal
          batch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function BatchModal({ batch, onClose, onSaved }: { batch: Batch | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(batch?.name ?? '');
  const [schedule, setSchedule] = useState(batch?.schedule ?? '');
  const [fee, setFee] = useState(batch ? String(batch.defaultMonthlyFee) : '');
  const [active, setActive] = useState(batch?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), schedule: schedule.trim() || undefined, defaultMonthlyFee: Number(fee), active };
    try {
      if (batch) await api.patch(`/batches/${batch.id}`, body);
      else await api.post('/batches', body);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!batch || !confirm(`Delete batch "${batch.name}"?`)) return;
    try {
      await api.del(`/batches/${batch.id}`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title={batch ? 'Edit batch' : 'New batch'} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorBox msg={error} />
        <label className="field">
          <span>Batch name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Class 8 Maths" autoFocus />
        </label>
        <label className="field">
          <span>Schedule (optional)</span>
          <input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Mon–Fri 5–6 PM" />
        </label>
        <label className="field">
          <span>Default monthly fee (₹)</span>
          <input required type="number" inputMode="numeric" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
        </label>
        {batch && (
          <label className="check">
            <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} />
            <span>Archive (hide from attendance and new students)</span>
          </label>
        )}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {batch && (
          <button type="button" className="btn danger block" style={{ marginTop: 8 }} onClick={remove}>
            Delete batch
          </button>
        )}
      </form>
    </Modal>
  );
}

export function SettingsPage() {
  const { center, setCenter } = useAuth();
  const [f, setF] = useState({
    name: center?.name ?? '',
    phone: center?.phone ?? '',
    address: center?.address ?? '',
    upiId: center?.upiId ?? '',
    language: center?.language ?? 'en',
    remindersEnabled: center?.remindersEnabled ?? true,
    remindDaysBefore: String(center?.remindDaysBefore ?? 3),
    remindDaysAfter: String(center?.remindDaysAfter ?? 3),
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  if (!center) return <Loading />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const c = await api.patch<Center>('/center', {
        name: f.name.trim(),
        phone: f.phone.trim() || null,
        address: f.address.trim() || null,
        upiId: f.upiId.trim() || null,
        language: f.language,
        remindersEnabled: f.remindersEnabled,
        remindDaysBefore: Number(f.remindDaysBefore),
        remindDaysAfter: Number(f.remindDaysAfter),
      });
      setCenter(c);
      setMsg({ ok: true, text: 'Settings saved' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Settings" back />
      <form className="page" onSubmit={submit}>
        {msg && <div className={`alert ${msg.ok ? 'ok' : ''}`}>{msg.text}</div>}
        <h2 style={{ marginTop: 0 }}>Center</h2>
        <label className="field">
          <span>Center name</span>
          <input required value={f.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <div className="grid2">
          <label className="field">
            <span>Phone</span>
            <input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label className="field">
            <span>UPI ID (shown in reminders)</span>
            <input value={f.upiId} onChange={(e) => set('upiId', e.target.value)} placeholder="name@okbank" />
          </label>
        </div>
        <label className="field">
          <span>Address</span>
          <input value={f.address} onChange={(e) => set('address', e.target.value)} />
        </label>

        <h2>Reminders</h2>
        <label className="check">
          <input type="checkbox" checked={f.remindersEnabled} onChange={(e) => set('remindersEnabled', e.target.checked)} />
          <span>Prepare fee reminders automatically every day</span>
        </label>
        <div className="grid2">
          <label className="field">
            <span>Days before due date</span>
            <input type="number" min={0} max={15} value={f.remindDaysBefore} onChange={(e) => set('remindDaysBefore', e.target.value)} />
          </label>
          <label className="field">
            <span>Days after due date</span>
            <input type="number" min={0} max={30} value={f.remindDaysAfter} onChange={(e) => set('remindDaysAfter', e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Message language</span>
          <select value={f.language} onChange={(e) => set('language', e.target.value)}>
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
          </select>
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </>
  );
}
