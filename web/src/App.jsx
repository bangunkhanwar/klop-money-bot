import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/AppShell';
import { LoadingScreen } from './components/Feedback';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import TransactionFormPage from './pages/TransactionFormPage';
import TransactionDetailPage from './pages/TransactionDetailPage';
import BudgetPage from './pages/BudgetPage';
import AccountPage from './pages/AccountPage';
import ProfileEditPage from './pages/ProfileEditPage';
import PreferencesPage from './pages/PreferencesPage';
import HelpPage from './pages/HelpPage';
import PrivacyPage from './pages/PrivacyPage';

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen label="Menyiapkan Klop Money..." />;
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <Navigate to="/" replace /> : <LoginPage />;
}

export default function App() {
  return <AuthProvider><BrowserRouter><Routes>
    <Route path="/login" element={<LoginRoute />} />
    <Route element={<ProtectedLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="transactions" element={<TransactionsPage />} />
      <Route path="transactions/new" element={<TransactionFormPage />} />
      <Route path="transactions/:id" element={<TransactionDetailPage />} />
      <Route path="transactions/:id/edit" element={<TransactionFormPage />} />
      <Route path="budget" element={<BudgetPage />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="account/edit" element={<ProfileEditPage />} />
      <Route path="account/preferences" element={<PreferencesPage />} />
      <Route path="help" element={<HelpPage />} />
      <Route path="privacy" element={<PrivacyPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></BrowserRouter></AuthProvider>;
}
