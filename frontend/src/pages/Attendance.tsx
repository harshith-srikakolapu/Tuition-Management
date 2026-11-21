import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ErrorBox, Loading, TopBar } from '../components';
import type { AttendanceSheet, AttendanceSummaryRow, Batch } from '../types';
import { fmtDate, thisMonth, todayStr, useLoad } from '../utils';

const LAST_BATCH = 'tcm.lastBatch';
const readLast = () => {
  try {
    return localStorage.getItem(LAST_BATCH) ?? '';
  } catch {
    return '';
  }
};

export function AttendancePage() {
  const batches = useLoad(() => api.get<Batch[]>('/batches'));
  const active = batches.data?.filter((b) => b.active) ?? [];
  const [batchId, setBatchId] = useState(readLast());
  const [date, setDate] = useState(todayStr());
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean | null>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'mark' | 'summary'>('mark');

  useEffect(() => {
    const act = batches.data?.filter((b) => b.active) ?? [];
    if (act.length && !act.some((b) => b.id === batchId)) setBatchId(act[0].id);
  }, [batches.data, batchId]);

  const sheet = useLoad(
    () => (batchId ? api.get<AttendanceSheet>('/attendance', { batchId, date }) : Promise.resolve(null)),
    [batchId, date],
  );
  useEffect(() => {
    if (!sheet.data) return;
    // Unmarked students default to present — the owner only taps the absentees.
    setMarks(Object.fromEntries(sheet.data.students.map((s) => [s.id, s.present ?? true])));
    setSaved(Object.fromEntries(sheet.data.students.map((s) => [s.id, s.present])));
    setStatus(null);
  }, [sheet.data]);

  const choose = (id: string) => {
    setBatchId(id);
    try {
      localStorage.setItem(LAST_BATCH, id);
    } catch {
      /* ignore */
    }
  };

  const dirty = sheet.data?.students.some((s) => saved[s.id] !== marks[s.id]) ?? false;
  const absent = Object.values(marks).filter((v) => !v).length;

  const save = async () => {
    if (!sheet.data) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.put('/attendance', { date, entries: sheet.data.students.map((s) => ({ studentId: s.id, present: marks[s.id] })) });
      setSaved({ ...marks });
      setStatus('saved');
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar title="Attendance" />
      <div className="page">
        <div className="seg">
          <button className={view === 'mark' ? 'on' : ''} onClick={() => setView('mark')}>
            Mark
          </button>
          <button className={view === 'summary' ? 'on' : ''} onClick={() => setView('summary')}>
            Monthly %
          </button>
        </div>
        {batches.data && active.length === 0 && (
          <div className="card empty">
            No batches yet. <Link to="/batches">Create one →</Link>
          </div>
        )}
        <div className="chips">
          {active.map((b) => (
            <button key={b.id} className={`chip ${batchId === b.id ? 'on' : ''}`} onClick={() => choose(b.id)}>
              {b.name}
            </button>
          ))}
        </div>

        {view === 'summary' ? (
          <Summary batchId={batchId} />
        ) : (
          <>
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value || todayStr())} />
            </label>
            <ErrorBox msg={sheet.error} />
            {sheet.loading && <Loading />}
            {sheet.data && sheet.data.students.length === 0 && <div className="card empty">No students in this batch on {fmtDate(date)}.</div>}
            {sheet.data && sheet.data.students.length > 0 && !sheet.loading && (
              <>
                <p className="small muted" style={{ marginTop: 0 }}>
                  Tap a student to mark absent. {sheet.data.students.length - absent} present · {absent} absent
                </p>
                <div className="att-grid">
                  {sheet.data.students.map((s) => (
                    <button
                      key={s.id}
                      className={`att ${marks[s.id] ? '' : 'absent'} ${saved[s.id] !== marks[s.id] ? 'unsaved' : ''}`}
                      onClick={() => setMarks((m) => ({ ...m, [s.id]: !m[s.id] }))}
                      aria-pressed={!marks[s.id]}
                    >
                      <span className="n">{s.name}</span>
                      <span className="s">{marks[s.id] ? 'PRESENT' : 'ABSENT'}</span>
                    </button>
                  ))}
                </div>
                <div className="spacer" />
                {status === 'saved' && !dirty && <div className="alert ok">Attendance saved for {fmtDate(date)} ✓</div>}
                {status && status !== 'saved' && <div className="alert">{status}</div>}
                <button className="btn primary block" disabled={busy || (!dirty && status === 'saved')} onClick={save}>
                  {busy ? 'Saving…' : dirty ? 'Save attendance' : 'Saved'}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Summary({ batchId }: { batchId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const { data, error, loading } = useLoad(
    () => api.get<AttendanceSummaryRow[]>('/attendance/summary', { month, batchId: batchId || undefined }),
    [month, batchId],
  );
  return (
    <>
      <label className="field">
        <span>Month</span>
        <input type="month" value={month} max={thisMonth()} onChange={(e) => setMonth(e.target.value || thisMonth())} />
      </label>
      <ErrorBox msg={error} />
      {loading && <Loading />}
      {data && data.length === 0 && <div className="card empty">No attendance marked for this month.</div>}
      {data && data.length > 0 && (
        <div className="list">
          {data.map((r) => (
            <Link to={`/students/${r.studentId}`} className="row" key={r.studentId}>
              <div className="grow">
                <div className="title">{r.name}</div>
                <div className="sub">
                  {r.present}/{r.total} days
                </div>
              </div>
              <span className={`badge ${r.percent >= 85 ? 'ok' : r.percent >= 70 ? 'warn' : 'bad'}`}>{r.percent}%</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
