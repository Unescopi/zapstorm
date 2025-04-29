import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import MainLayout from '../components/Layout/MainLayout';
import Login from '../pages/Login';
import Dashboard from '../pages/Dashboard';
import Campaigns from '../pages/Campaigns';
import Contacts from '../pages/Contacts';
import Templates from '../pages/Templates';
import Instances from '../pages/Instances';
import Settings from '../pages/Settings';
import Profile from '../pages/Profile';

// Rota privada que verifica autenticação
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Carregando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
};

// Rota pública que redireciona usuários autenticados
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Carregando...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" />;
  }

  return <>{children}</>;
};

export default function AppRoutes() {
  return (
    <Routes>
      {/* Rotas públicas */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      {/* Rota para redirecionar / para /dashboard */}
      <Route
        path="/"
        element={<Navigate to="/dashboard" />}
      />

      {/* Rotas privadas */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <MainLayout>
              <Dashboard />
            </MainLayout>
          </PrivateRoute>
        }
      />

      {/* Páginas com MainLayout */}
      <Route
        path="/contacts"
        element={
          <PrivateRoute>
            <MainLayout>
              <Contacts />
            </MainLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/campaigns"
        element={
          <PrivateRoute>
            <MainLayout>
              <Campaigns />
            </MainLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/templates"
        element={
          <PrivateRoute>
            <MainLayout>
              <Templates />
            </MainLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/instances"
        element={
          <PrivateRoute>
            <MainLayout>
              <Instances />
            </MainLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <MainLayout>
              <Settings />
            </MainLayout>
          </PrivateRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <PrivateRoute>
            <MainLayout>
              <Profile />
            </MainLayout>
          </PrivateRoute>
        }
      />

      {/* Rota 404 */}
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
} 