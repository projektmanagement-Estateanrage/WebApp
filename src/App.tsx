import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/AuthContext'
import { isSupabaseConfigured } from './lib/supabase'
import { Login } from './pages/Login'
import { Projekte } from './pages/Projekte'
import { ProjektDetail } from './pages/ProjektDetail'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <p className="p-8 text-sm text-slate-500">Lädt…</p>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function LoginRoute() {
  const { session, loading } = useAuth()
  if (loading) return <p className="p-8 text-sm text-slate-500">Lädt…</p>
  if (session) return <Navigate to="/projekte" replace />
  return <Login />
}

function SetupHinweis() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
      <div className="max-w-md space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-6">
        <h1 className="font-semibold text-amber-900">Supabase noch nicht konfiguriert</h1>
        <p className="text-sm text-amber-800">
          <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code> fehlen. Kopiere{' '}
          <code>.env.example</code> nach <code>.env.local</code> und trage die Werte aus deinem
          Supabase-Projekt (Project Settings → API) ein.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!isSupabaseConfigured) return <SetupHinweis />

  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/projekte"
        element={
          <RequireAuth>
            <Projekte />
          </RequireAuth>
        }
      />
      <Route
        path="/projekte/:id"
        element={
          <RequireAuth>
            <ProjektDetail />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/projekte" replace />} />
    </Routes>
  )
}
