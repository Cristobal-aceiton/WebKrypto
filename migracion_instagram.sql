-- =========================================================
-- WebKrypto · Carrusel de Instagram (posts cargados desde el panel admin)
-- Pega TODO en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez.
--
-- Qué hace: crea la tabla de posts y un bucket público "instagram" para las
-- imágenes. Cualquier visitante puede LEER los posts (se muestran en la web);
-- solo tú, logueado en el panel, puedes crear, editar o borrar.
-- =========================================================

create table if not exists public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  imagen_url text not null,
  imagen_path text,
  post_url text not null,
  texto text,
  creado_at timestamptz not null default now()
);

alter table public.instagram_posts enable row level security;

-- Validaciones del lado del servidor (no se pueden saltar desde el navegador).
alter table public.instagram_posts drop constraint if exists instagram_limites;
alter table public.instagram_posts add constraint instagram_limites check (
      char_length(coalesce(texto, '')) <= 120
  and post_url ~ '^https://(www\.)?instagram\.com/'
  and char_length(post_url) <= 300
  and imagen_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/instagram/'
  and char_length(imagen_url) <= 400
);

create index if not exists instagram_posts_creado_idx on public.instagram_posts (creado_at desc);

drop policy if exists "ig_publico_lee" on public.instagram_posts;
create policy "ig_publico_lee"
  on public.instagram_posts for select
  to anon, authenticated
  using (true);

drop policy if exists "ig_logueados_crean" on public.instagram_posts;
create policy "ig_logueados_crean"
  on public.instagram_posts for insert
  to authenticated
  with check (true);

drop policy if exists "ig_logueados_editan" on public.instagram_posts;
create policy "ig_logueados_editan"
  on public.instagram_posts for update
  to authenticated
  using (true) with check (true);

drop policy if exists "ig_logueados_borran" on public.instagram_posts;
create policy "ig_logueados_borran"
  on public.instagram_posts for delete
  to authenticated
  using (true);

-- Bucket público de lectura para las imágenes (máx. 5 MB, solo jpg/png/webp).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instagram', 'instagram', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Solo un usuario logueado (tú) puede subir, reemplazar o borrar imágenes.
drop policy if exists "ig_logueados_suben" on storage.objects;
create policy "ig_logueados_suben"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'instagram');

drop policy if exists "ig_logueados_actualizan" on storage.objects;
create policy "ig_logueados_actualizan"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'instagram') with check (bucket_id = 'instagram');

drop policy if exists "ig_logueados_borran_img" on storage.objects;
create policy "ig_logueados_borran_img"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'instagram');

-- Verificación: debes ver la tabla con sus 4 políticas y el bucket.
select policyname, cmd, roles from pg_policies where tablename = 'instagram_posts' order by policyname;
select id, public, file_size_limit from storage.buckets where id = 'instagram';
