import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import Intake from './pages/Intake'
import ClientPortal from './pages/ClientPortal'
import Dashboard from './pages/Dashboard'
import ClientDetail from './pages/ClientDetail'
import CampaignDetail from './pages/CampaignDetail'
import ClientMessages from './pages/ClientMessages'
import Account from './pages/Account'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/intake" element={<Intake />} />
      <Route path="/client/:clientId" element={<ClientPortal />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/clients/:clientId"
        element={
          <ProtectedRoute>
            <ClientDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/clients/:clientId/campaigns/:campaignId"
        element={
          <ProtectedRoute>
            <CampaignDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/clients/:clientId/messages"
        element={
          <ProtectedRoute>
            <ClientMessages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <div className="mx-auto max-w-md px-4 py-24 text-center">
            <h1 className="text-lg font-semibold">Page not found</h1>
            <a href="/dashboard" className="text-sm text-brand-700 underline">
              Go to dashboard
            </a>
          </div>
        }
      />
    </Routes>
  )
}
