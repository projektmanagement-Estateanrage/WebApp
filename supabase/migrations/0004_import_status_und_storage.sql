-- Statusspalten für importe: die Oberfläche fragt hierüber den Fortschritt
-- einer Background Function ab, statt auf eine HTTP-Antwort zu warten (siehe
-- CLAUDE.md, Ablauf-Abschnitt zum Import).
alter table importe
  add column status text not null default 'wird_geparst'
    check (status in ('wird_geparst', 'wird_erkannt', 'fertig', 'fehler')),
  add column fehler text;

-- Storage-Bucket für hochgeladene Originaldateien. Privat: nur über
-- authentifizierte Requests bzw. den service_role-Key der Function
-- erreichbar, nie öffentlich lesbar.
insert into storage.buckets (id, name, public)
values ('importe', 'importe', false)
on conflict (id) do nothing;

create policy "team liest import-dateien" on storage.objects
  for select to authenticated
  using (bucket_id = 'importe');

create policy "team laedt import-dateien hoch" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'importe');
