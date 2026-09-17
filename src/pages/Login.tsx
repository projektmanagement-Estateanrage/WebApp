import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/AuthContext'

export function Login() {
  const { signInWithPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await signInWithPassword(email, password)
    if (error) setError(error)
    setSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-900">Objektlisten — Login</h1>
        <p className="text-sm text-slate-500">
          Nur für Teamkonten. Neue Konten werden manuell im Supabase-Dashboard angelegt.
        </p>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            E-Mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
