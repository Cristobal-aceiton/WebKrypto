-- =========================================================
-- WebKrypto · Endurecimiento de seguridad en Supabase
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Ejecútalo DESPUÉS de supabase_setup.sql. Se puede correr varias veces.
--
-- Por qué importa: la "anon key" que ves en index.html es pública por diseño
-- (cualquiera puede verla). Lo que realmente te protege son estas reglas del
-- lado del servidor, porque las validaciones del navegador se pueden saltar.
-- =========================================================

alter table public.clientes add column if not exists notas_historial jsonb default '[]'::jsonb;

-- 1) Límites de tamaño: nadie puede meter textos gigantes ni JSON enormes.
--    "not valid" = no revisa filas antiguas, solo las nuevas o modificadas.
alter table public.clientes drop constraint if exists limites_texto;
alter table public.clientes add constraint limites_texto check (
      char_length(coalesce(nombre_negocio, '')) between 1 and 100
  and char_length(coalesce(nombre_contacto, '')) <= 100
  and char_length(coalesce(whatsapp, '')) <= 20
  and char_length(coalesce(correo, '')) <= 254
  and char_length(coalesce(notas, '')) <= 2000
  and char_length(coalesce(hosting_proveedor, '')) <= 100
  and char_length(coalesce(dominio_nombre, '')) <= 253
  and pg_column_size(formulario) <= 20000
  and pg_column_size(archivos) <= 4000
  and pg_column_size(notas_historial) <= 100000
) not valid;

-- 2) El visitante anónimo solo puede crear un "lead" limpio.
--    Antes: with check (true) => podía insertar estado 'Concretado', montos,
--    notas, etc. Ahora todo lo administrativo debe venir en su valor inicial.
drop policy if exists "cualquiera_puede_insertar" on public.clientes;
create policy "cualquiera_puede_insertar"
  on public.clientes for insert
  to anon
  with check (
        origen = 'formulario'
    and estado = 'Pendiente'
    and pago_estado = 'Pendiente'
    and coalesce(monto_total, 0) = 0
    and coalesce(monto_pendiente, 0) = 0
    and coalesce(mantencion_activa, false) = false
    and coalesce(mantencion_precio, 0) = 0
    and mantencion_vencimiento is null
    and hosting_vencimiento is null
    and dominio_vencimiento is null
    and hosting_proveedor is null
    and dominio_nombre is null
    and notas is null
    and coalesce(plan, 'Por definir') = 'Por definir'
    and coalesce(notas_historial, '[]'::jsonb) = '[]'::jsonb
  );

-- 3) Límite de envíos por IP (anti-spam / anti-inundación): máx. 8 por hora.
create table if not exists public.intentos_formulario (
  ip text not null,
  creado timestamptz not null default now()
);
create index if not exists intentos_formulario_ip_idx on public.intentos_formulario (ip, creado desc);
alter table public.intentos_formulario enable row level security;   -- sin políticas: nadie de afuera la ve
revoke all on public.intentos_formulario from anon, authenticated;

create or replace function public.limitar_envios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text;
  v_ip  text;
  v_n   int;
begin
  v_rol := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
  if v_rol <> 'anon' then
    return new;  -- tú desde el panel (o el SQL Editor) no tienes límite
  end if;

  v_ip := trim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', 'desconocida'), ',', 1));

  delete from public.intentos_formulario where creado < now() - interval '1 day';
  select count(*) into v_n from public.intentos_formulario where ip = v_ip and creado > now() - interval '1 hour';
  if v_n >= 8 then
    raise exception 'Demasiados envíos. Intenta de nuevo más tarde.' using errcode = 'P0001';
  end if;
  insert into public.intentos_formulario (ip) values (v_ip);
  return new;
end;
$$;

drop trigger if exists trg_limitar_envios on public.clientes;
create trigger trg_limitar_envios
  before insert on public.clientes
  for each row execute function public.limitar_envios();

-- 4) Storage: solo se aceptan archivos con extensión permitida y ruta "uuid/nombre-seguro".
drop policy if exists "cualquiera_sube_adjuntos" on storage.objects;
create policy "cualquiera_sube_adjuntos"
  on storage.objects for insert
  to anon
  with check (
        bucket_id = 'adjuntos'
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf')
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,150}$'
  );

-- 5) OPCIONAL (muy recomendado): que SOLO TU correo pueda leer/editar/borrar.
--    Hoy cualquier usuario "authenticated" puede hacerlo; si alguna vez se
--    habilitara el registro público, esa persona vería todos tus clientes.
--    Para activarlo: cambia TU_CORREO@ejemplo.com por tu correo de login
--    y quita los "-- " del inicio de las líneas.
--
-- create or replace function public.es_admin() returns boolean
--   language sql stable as $f$ select (auth.jwt() ->> 'email') = 'TU_CORREO@ejemplo.com' $f$;
-- drop policy if exists "logueados_leen" on public.clientes;
-- drop policy if exists "logueados_editan" on public.clientes;
-- drop policy if exists "logueados_borran" on public.clientes;
-- create policy "admin_lee"    on public.clientes for select to authenticated using (public.es_admin());
-- create policy "admin_edita"  on public.clientes for update to authenticated using (public.es_admin()) with check (public.es_admin());
-- create policy "admin_borra"  on public.clientes for delete to authenticated using (public.es_admin());

-- Verificación: debes ver las políticas nuevas de clientes y storage.
select tablename, policyname, cmd, roles from pg_policies
where tablename in ('clientes', 'objects') order by tablename, policyname;
