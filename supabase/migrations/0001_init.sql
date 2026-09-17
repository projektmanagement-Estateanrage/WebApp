-- Projekte, Einheiten, Importe für die Objektlisten-App.
-- kaufpreis/kaltmiete bleiben nullable: "verkauft" o.ä. liefert keinen Preis,
-- eine 0 dort wäre eine Falschaussage in Summen.

create table if not exists projekte (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ort text,
  bautraeger text,
  notiz text,
  kontrolle_flaeche numeric,
  kontrolle_kaufpreis numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type einheit_typ as enum ('wohnung', 'stellplatz', 'garage', 'gewerbe', 'sonstiges');
create type einheit_status as enum ('frei', 'reserviert', 'verkauft');

create table if not exists einheiten (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  bezeichnung text not null,
  typ einheit_typ not null default 'wohnung',
  etage text,
  zimmer text,
  groesse text,
  kaufpreis integer,
  kaltmiete integer,
  status einheit_status,
  garage boolean not null default false,
  garage_preis integer,
  stellplatz boolean not null default false,
  stellplatz_preis integer,
  hinweis text,
  sortierung integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists einheiten_projekt_id_idx on einheiten(projekt_id);

create table if not exists importe (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references projekte(id) on delete cascade,
  dateiname text not null,
  storage_pfad text not null,
  quelle_typ text not null,
  roh_text text,
  modell_antwort jsonb,
  hinweise jsonb,
  erstellt_von text,
  created_at timestamptz not null default now()
);

create index if not exists importe_projekt_id_idx on importe(projekt_id);

-- updated_at automatisch nachführen
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projekte_set_updated_at
  before update on projekte
  for each row execute function set_updated_at();

create trigger einheiten_set_updated_at
  before update on einheiten
  for each row execute function set_updated_at();

-- Nur eingeloggte Teamkonten dürfen lesen/schreiben. Self-Signup wird in den
-- Supabase Auth-Einstellungen deaktiviert (Auth > Providers > Email > "Allow
-- new users to sign up" aus), Accounts werden manuell im Dashboard angelegt.
alter table projekte enable row level security;
alter table einheiten enable row level security;
alter table importe enable row level security;

create policy "team liest projekte" on projekte for select using (auth.role() = 'authenticated');
create policy "team schreibt projekte" on projekte for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "team liest einheiten" on einheiten for select using (auth.role() = 'authenticated');
create policy "team schreibt einheiten" on einheiten for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "team liest importe" on importe for select using (auth.role() = 'authenticated');
create policy "team schreibt importe" on importe for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
