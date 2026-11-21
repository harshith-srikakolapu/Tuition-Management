import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Loading, PaymentModal, StatusBadge, TopBar } from '../components';
import type { Dashboard, DueRow } from '../types';
import { fmtMonth, rupees, useLoad } from '../utils';

export function HomePage() {
  const { center } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get<Dashboard>('/dashboard'));
  const [paying, setPaying] = useState<DueRow | 'new' | null>(null);

  return (
    <>
      <TopBar title={center?.name ?? 'Home'} />
      <div className="page">
        <ErrorBox msg={error} />
        {loading && !data && <Loading />}
        {data && (
          <>
            <p className="muted small" style={{ margin: '0 0 8px' }}>
              {fmtMonth(data.month)}
            </p>
            <div className="stats">
              <div className="stat">
                <div className="label">Expected this month</div>
                <div className="value">{rupees(data.expected)}</div>
              </div>
              <div className="stat ok">
                <div className="label">Received this month</div>
                <div className="value">{rupees(data.collectedThisMonth)}</div>
              </div>
              <div className="stat bad">
                <div className="label">Total outstanding</div>
                <div className="value">{rupees(data.outstanding)}</div>
              </div>
              <div className="stat">
                <div className="label">Collection rate</div>
                <div className="value">{data.collectionRate === null ? '–' : `${data.collectionRate}%`}</div>
              </div>
            </div>

            <div className="spacer" />
            <div className="btnrow">
              <button className="btn primary" onClick={() => setPaying('new')}>
                ＋ Record payment
              </button>
              <Link className="btn" to="/attendance">
                ✅ Attendance {data.attendanceMarkedToday > 0 ? '(done)' : ''}
              </Link>
            </div>

            {data.activeStudents === 0 && (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>Welcome! Let's get set up</h3>
                <ol className="small">
                  <li>
                    <Link to="/batches">Add your batches</Link> with their monthly fee
                  </li>
                  <li>
                    <Link to="/students/new">Add students</Link> with a parent's WhatsApp number
                  </li>
                  <li>Record payments as they come in — dues and reminders are automatic</li>
                </ol>
              </div>
            )}

            <h2>
              Unpaid ({data.unpaidStudents}){' '}
              {data.pendingReminders > 0 && (
                <Link to="/reminders" className="badge warn" style={{ marginLeft: 6 }}>
                  {data.pendingReminders} reminders to send
                </Link>
              )}
            </h2>
            {data.topDues.length === 0 ? (
              <div className="card empty">🎉 Everyone has paid. Nice!</div>
            ) : (
              <div className="list">
                {data.topDues.map((r) => (
                  <div className="row" key={r.studentId}>
                    <Link to={`/students/${r.studentId}`} className="grow" style={{ color: 'inherit' }}>
                      <div className="title">{r.name}</div>
                      <div className="sub">
                        {r.batchName} · <StatusBadge outstanding={r.outstanding} overdueDays={r.overdueDays} />
                        {r.arrears > 0 && <span className="small"> incl. {rupees(r.arrears)} old</span>}
                      </div>
                    </Link>
                    <div className="amt">{rupees(r.outstanding)}</div>
                    <div className="actions">
                      {r.reminderLink && (
                        <a className="btn sm wa" href={r.reminderLink} target="_blank" rel="noreferrer" aria-label={`Remind ${r.name} on WhatsApp`}>
                          💬
                        </a>
                      )}
                      <button className="btn sm" onClick={() => setPaying(r)} aria-label={`Record payment for ${r.name}`}>
                        ₹
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {paying && (
        <PaymentModal
          student={paying === 'new' ? undefined : { id: paying.studentId, name: paying.name }}
          suggested={paying === 'new' ? undefined : paying.outstanding}
          onClose={() => setPaying(null)}
          onSaved={reload}
        />
      )}
    </>
  );
}
