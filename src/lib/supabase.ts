import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

// Ohne echte Werte einen Dummy-Client erzeugen, damit der Import nicht crasht —
// die App zeigt stattdessen einen "Setup fehlt"-Hinweis (siehe App.tsx) statt
// eines rohen Fehlers. Kein Mock der Daten, nur ein funktionsfähiger Client.
// Bewusst ohne generischen Database-Typ: sobald das echte Supabase-Projekt
// existiert, ersetzt `supabase gen types typescript` die Handarbeit in
// src/types/database.ts durch generierte, garantiert passende Typen.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder',
)
