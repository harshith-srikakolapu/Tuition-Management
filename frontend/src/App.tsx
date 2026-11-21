import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import { BottomNav, Loading } from './components';
import { AttendancePage } from './pages/Attendance';
import { LoginPage, SignupPage } from './pages/Auth';
import { HomePage } from './pages/Home';
import { BatchesPage, MorePage, ReportsPage, SettingsPage } from './pages/More';
import { RemindersPage } from './pages/Reminders';
import { StudentDetailPage, StudentFormPage, StudentsPage } from './pages/Students';
import type { Reminder } from './types';

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return <Shell />;
}

function Shell() {
  const location = useLocation();
  const [pending, setPending] = useState(0);
  const refreshPending = useCallback(() => {
    api
      .get<Reminder[]>('/reminders', { status: 'MANUAL,FAILED' })
      .then((r) => setPending(r.length))
      .catch(() => {});
  }, []);
  useEffect(refreshPending, [location.pathname, refreshPending]);

  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route path="/students/new" element={<StudentFormPage />} />
        <Route path="/students/:id" element={<StudentDetailPage />} />
        <Route path="/students/:id/edit" element={<StudentFormPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/reminders" element={<RemindersPage onChange={refreshPending} />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/batches" element={<BatchesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav pendingReminders={pending} />
    </div>
  );
}
