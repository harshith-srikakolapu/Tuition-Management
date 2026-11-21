import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBox, Loading, TopBar } from '../components';
import type { Reminder } from '../types';
import { fmtDate, fmtMonth, rupees, useLoad } from '../utils';

interface RunSummary {
  created: number;
  alreadySent: number;
  sentViaApi: number;
  queuedManual: number;
  failed: number;
}

export function RemindersPage({ onChange }: { onChange?: () => void }) {
  const { center } = useAuth();
  const [tab, setTab] = useState<'todo' | 'history'>('todo');
  const config = useLoad(() => api.get<{ whatsappApiEnabled: boolean }>('/reminders/config'));
  const list = useLoad(() => api.get<Reminder[]>('/reminders', { status: tab === 'todo' ? 'MANUAL,FAILED,PENDING' : 'SENT,SKIPPED' }), [tab]);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    try {
      setRun(await api.post<RunSummary>('/reminders/run'));
      await list.reload();
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const mark = async (r: Reminder, action: 'sent' | 'skip') => {
    await api.post(`/reminders/${r.id}/${action}`);
    list.setData((rows) => rows?.filter((x) => x.id !== r.id) ?? null);
    onChange?.();
  };

  const sendViaWhatsApp = (r: Reminder) => {
    window.open(r.waLink, '_blank', 'noopener');
    // Owner chose to send — record it so the parent is never reminded twice for this month/type.
    mark(r, 'sent');
  };

  return (
    <>
      <TopBar title="Reminders" />
      <div className="page">
        {config.data && (
          <div className="alert info small">
            {config.data.whatsappApiEnabled
              ? 'WhatsApp API is connected — reminders are sent automatically every day at 9 AM.'
              : 'Reminders are prepared every day at 9 AM. Tap “Send” to open WhatsApp with the message ready.'}{' '}
            {center && !center.remindersEnabled && (
              <>
                <b>Automatic reminders are turned off.</b> <Link to="/settings">Turn on</Link>
              </>
            )}
            {center?.remindersEnabled && (
              <>
                Timing: {center.remindDaysBefore} day(s) before and {center.remindDaysAfter} day(s) after the due date.{' '}
                <Link to="/settings">Change</Link>
              </>
            )}
          </div>
        )}
        <ErrorBox msg={error} />
        <button className="btn block" onClick={runNow} disabled={busy}>
          {busy ? 'Checking…' : '🔄 Check for due reminders now'}
        </button>
        {run && (
          <p className="small muted">
            {run.created} new reminder(s)
            {run.sentViaApi ? `, ${run.sentViaApi} sent` : ''}
            {run.failed ? `, ${run.failed} failed` : ''}
            {run.alreadySent ? ` · ${run.alreadySent} already sent earlier (skipped)` : ''}
          </p>
        )}
        <div className="spacer" />
        <div className="seg">
          <button className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>
            To send
          </button>
          <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
            History
          </button>
        </div>

        <ErrorBox msg={list.error} />
        {list.loading && <Loading />}
        {list.data && list.data.length === 0 && (
          <div className="card empty">{tab === 'todo' ? 'Nothing to send right now ✓' : 'No reminders sent yet.'}</div>
        )}
        {list.data?.map((r) => (
          <div className="card" key={r.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <Link to={`/students/${r.studentId}`}>
                  <h3>{r.studentName}</h3>
                </Link>
                <div className="small muted">
                  {r.batchName} · {r.parentName ?? 'Parent'} · {r.parentPhone}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{rupees(r.amountDue)}</b>
                <div>
                  <span className={`badge ${r.type === 'AFTER_DUE' ? 'bad' : 'warn'}`}>{r.type === 'AFTER_DUE' ? 'Overdue' : 'Upcoming'}</span>
                </div>
              </div>
            </div>
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>
              {r.message}
            </p>
            {r.status === 'FAILED' && <div className="alert small">Auto-send failed: {r.error}</div>}
            {tab === 'todo' ? (
              <div className="btnrow">
                <button className="btn wa" onClick={() => sendViaWhatsApp(r)}>
                  💬 Send on WhatsApp
                </button>
                <button className="btn sm" onClick={() => mark(r, 'skip')}>
                  Skip
                </button>
              </div>
            ) : (
              <div className="small muted">
                {r.status === 'SENT' ? `Sent ${fmtDate(r.sentAt)}` : 'Skipped'} · {fmtMonth(r.month)} · due {fmtDate(r.dueDate)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
