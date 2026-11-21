import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorBox } from '../components';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="logo">📚</div>
      <h1>Tuition Manager</h1>
      <p className="center muted">Fees, attendance and reminders — from your phone.</p>
      <form onSubmit={submit} className="card">
        <ErrorBox msg={error} />
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="center">
        New center? <Link to="/signup">Create an account</Link>
      </p>
    </div>
  );
}

export function SignupPage() {
  const { signup } = useAuth();
  const [f, setF] = useState({ centerName: '', ownerName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signup(f);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="logo">📚</div>
      <h1>Set up your center</h1>
      <p className="center muted">Takes less than a minute.</p>
      <form onSubmit={submit} className="card">
        <ErrorBox msg={error} />
        <label className="field">
          <span>Center name</span>
          <input required minLength={2} value={f.centerName} onChange={set('centerName')} placeholder="e.g. Bright Minds Tuition" />
        </label>
        <label className="field">
          <span>Your name</span>
          <input required minLength={2} value={f.ownerName} onChange={set('ownerName')} autoComplete="name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" required value={f.email} onChange={set('email')} autoComplete="email" />
        </label>
        <label className="field">
          <span>Password (min 8 characters)</span>
          <input type="password" required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" />
        </label>
        <p className="small muted">
          Student and parent details you add are stored only for running your center and are never shared.
        </p>
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="center">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
