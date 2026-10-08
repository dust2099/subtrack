import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

const Overview = lazy(() => import('@/pages/Overview'));
const Subscriptions = lazy(() => import('@/pages/Subscriptions'));
const Settings = lazy(() => import('@/pages/Settings'));
const Friends = lazy(() => import('@/pages/Friends'));
const Auth = lazy(() =>
  import('@/pages/Auth').then((module) => ({ default: module.Auth })),
);
const Dashboard = lazy(() => import('@/pages/Dashboard'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        {t('common.loading')}
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/auth" replace />} />
      <Route path="/auth" element={<Auth />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="friends" element={<Friends />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}

export default App;
