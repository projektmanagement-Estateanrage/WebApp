# Objektlisten

Interne Webapp für Estateanfrage: Kaufpreislisten von Bauträgern (Excel/PDF) werden
per KI in eine geprüfte, editierbare Einheitenliste überführt. Kernregeln und
Datenmodell stehen in [`CLAUDE.md`](./CLAUDE.md).

## Stack

- Vite + React + TypeScript, Tailwind
- Supabase (Postgres, Auth, Storage)
- Netlify Hosting + Functions unter `/api` (via Redirect auf `/.netlify/functions`)
- Anthropic SDK serverseitig in einer Function

## Setup

```bash
npm install
cp .env.example .env.local   # Werte aus dem Supabase-Projekt eintragen
npm run dev
```

## Scripts

- `npm run dev` — Dev-Server
- `npm run build` — Typecheck + Production-Build
- `npm test` — Vitest
- `npm run lint` — Oxlint
