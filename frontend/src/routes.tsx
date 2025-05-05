import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Layout
import MainLayout from './components/Layout/MainLayout';

// Pages
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Templates from './pages/Templates';
import Instances from './pages/Instances';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Login from './pages/Login';
import Alerts from './pages/Alerts';

// Auth Provider
import { useAuth } from './contexts/AuthContext';

function AppRoutes() {
  const { user, loading } = useAuth();
  
  // Mostrar uma tela de carregamento enquanto verifica a autenticação
  if (loading) {
    return <div>Carregando...</div>;
  }
  
  return (
    <Routes>
      {/* Rotas públicas */}
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
      
      {/* Rotas protegidas */}
      <Route path="/" element={user ? <MainLayout><Dashboard /></MainLayout> : <Navigate to="/login" />} />
      <Route path="/dashboard" element={user ? <MainLayout><Dashboard /></MainLayout> : <Navigate to="/login" />} />
      
      <Route path="/contacts" element={user ? <MainLayout><Contacts /></MainLayout> : <Navigate to="/login" />} />
      
      <Route path="/templates" element={user ? <MainLayout><Templates /></MainLayout> : <Navigate to="/login" />} />
      
      <Route path="/instances" element={user ? <MainLayout><Instances /></MainLayout> : <Navigate to="/login" />} />
      
      <Route path="/settings" element={user ? <MainLayout><Settings /></MainLayout> : <Navigate to="/login" />} />
      <Route path="/profile" element={user ? <MainLayout><Profile /></MainLayout> : <Navigate to="/login" />} />
      <Route path="/alerts" element={user ? <MainLayout><Alerts /></MainLayout> : <Navigate to="/login" />} />
      
      {/* Rota padrão (fallback) */}
      <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
    </Routes>
  );
}

export default AppRoutes; 