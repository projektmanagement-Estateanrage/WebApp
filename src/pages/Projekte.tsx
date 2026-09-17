import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import type { Projekt } from '../types/database'

export function Projekte() {
  const { signOut } = useAuth()
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function laden() {
    setLoading(true)
    const { data, error } = await supabase
      .from('projekte')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setProjekte((data ?? []) as Projekt[])
    setLoading(false)
  }

  useEffect(() => {
    laden()
  }, [])

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    if (!name) return

    const { error } = await supabase.from('projekte').insert({
      name,
      ort: (form.get('ort') as string) || null,
      bautraeger: (form.get('bautraeger') as string) || null,
    })
    if (error) {
      setError(error.message)
      return
    }
    setShowForm(false)
    laden()
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Projekte</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            {showForm ? 'Abbrechen' : 'Neues Projekt'}
          </button>
          <button
            onClick={signOut}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
          >
            Abmelden
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">Name *</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Ort</label>
            <input
              name="ort"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Bauträger</label>
            <input
              name="bautraeger"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Anlegen
          </button>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Lädt…</p>
      ) : projekte.length === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Projekte angelegt.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {projekte.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projekte/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{p.name}</span>
                <span className="text-sm text-slate-500">
                  {[p.ort, p.bautraeger].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
