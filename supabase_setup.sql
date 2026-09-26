-- =========================================================
-- WebKrypto · Configuración inicial de Supabase
-- Pega TODO este archivo en Supabase > SQL Editor > New query
-- y presiona "Run". Se puede ejecutar una sola vez.
-- =========================================================

create extension if not exists pgcrypto;

-- Tabla principal: cada fila es un lead del formulario o un cliente
-- que agregaste manualmente desde el panel.
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre_negocio text,
  nombre_contacto text,
  whatsapp text,
  correo text,
  plan text default 'Por definir',
  estado text default 'Pendiente',              -- Pendiente / Concretado / No concretado / Cancelado
  monto_total numeric default 0,
  pago_estado text default 'Pendiente',          -- Pendiente / Parcial / Pagado
  monto_pendiente numeric default 0,
  mantencion_activa boolean default false,
  mantencion_precio numeric default 0,
  mantencion_vencimiento date,
  hosting_proveedor text,
  hosting_vencimiento date,
  dominio_nombre text,
  dominio_vencimiento date,
  notas text,
  formulario jsonb,          -- todas las respuestas del formulario de cotización, tal cual
  archivos jsonb,             -- { "logo": "url", "fotos": ["url1","url2"] }
  origen text default 'manual', -- 'formulario' (vino de la web) o 'manual' (lo creaste tú)
  creado_at timestamptz default now(),
  actualizado_at timestamptz default now()
);

alter table public.clientes enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'estado_valido') then
    alter table public.clientes
      add constraint estado_valido check (estado in ('Pendiente','Concretado','No concretado','Cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pago_estado_valido') then
    alter table public.clientes
      add constraint pago_estado_valido check (pago_estado in ('Pendiente','Parcial','Pagado'));
  end if;
end $$;

-- Cualquier visitante de tu web (rol "anon") puede CREAR una fila nueva
-- (esto es lo que hace el formulario de cotización). No puede leer ni
-- modificar filas existentes.
drop policy if exists "cualquiera_puede_insertar" on public.clientes;
create policy "cualquiera_puede_insertar"
  on public.clientes for insert
  to anon
  with check (true);

-- Solo tú, una vez logueado ("authenticated"), puedes ver, editar y borrar.
drop policy if exists "logueados_leen" on public.clientes;
create policy "logueados_leen"
  on public.clientes for select
  to authenticated
  using (true);

drop policy if exists "logueados_editan" on public.clientes;
create policy "logueados_editan"
  on public.clientes for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "logueados_borran" on public.clientes;
create policy "logueados_borran"
  on public.clientes for delete
  to authenticated
  using (true);

-- Mantiene actualizado el campo actualizado_at en cada cambio
create or replace function public.tocar_actualizado_at()
returns trigger as $$
begin
  new.actualizado_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clientes_actualizado on public.clientes;
create trigger trg_clientes_actualizado
  before update on public.clientes
  for each row execute function public.tocar_actualizado_at();

-- =========================================================
-- Bucket de Storage para los logos/fotos que suben los clientes
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos', 'adjuntos', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
on conflict (id) do update set file_size_limit = 10485760;

drop policy if exists "cualquiera_sube_adjuntos" on storage.objects;
create policy "cualquiera_sube_adjuntos"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'adjuntos');

-- El bucket es público para lectura (así funcionan los links que ves
-- en el panel), pero nadie externo puede listar, editar ni borrar
-- archivos de otros. file_size_limit obliga el máximo de 10MB también
-- del lado del servidor (antes solo se validaba en el navegador).
