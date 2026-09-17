-- Statusspalten für importe: die Oberfläche fragt hierüber den Fortschritt
-- einer Background Function ab, statt auf eine HTTP-Antwort zu warten (siehe
-- CLAUDE.md, Ablauf-Abschnitt zum Import).
alter table importe
  add column status text not null default 'wird_geparst'
    check (status in ('wird_geparst', 'wird_erkannt', 'fertig', 'fehler')),
  add column fehler text;

-- Der Storage-Bucket "importe" selbst wird NICHT hier per SQL angelegt.
-- `insert into storage.buckets` scheitert im SQL-Editor an fehlenden Rechten
-- (Buckets gehören der Storage-API, nicht dem normalen SQL-Client) und reißt
-- als Teil dieser Transaktion die ganze Migration zurück, inklusive der
-- harmlosen alter-table-Zeilen oben. Der Bucket wird stattdessen im
-- Supabase-Dashboard angelegt (Storage → New bucket → "importe", privat,
-- Größenlimit und erlaubte MIME-Typen siehe CLAUDE.md).
--
-- Diese Policies setzen nicht voraus, dass der Bucket zum Zeitpunkt dieser
-- Migration schon existiert — sie greifen automatisch, sobald er da ist.
create policy "team liest import-dateien" on storage.objects
  for select to authenticated
  using (bucket_id = 'importe');

create policy "team laedt import-dateien hoch" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'importe');
