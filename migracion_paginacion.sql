-- =========================================================
-- WebKrypto · Migración para la paginación del panel admin
-- Pega TODO en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez. Ejecútalo ANTES de usar el panel nuevo.
--
-- Qué hace: crea columnas calculadas automáticamente (no las escribes tú)
-- para que el panel pueda buscar, filtrar y ordenar en el servidor y traer
-- solo la página que estás viendo, en vez de bajar todos los clientes.
-- =========================================================

alter table public.clientes
  add column if not exists ciudad text
    generated always as (nullif(formulario ->> 'ciudad', '')) stored,
  add column if not exists rubro text
    generated always as (nullif(formulario ->> 'rubro', '')) stored,
  add column if not exists servicio_interes text
    generated always as (nullif(formulario ->> 'servicio_interes', '')) stored,
  add column if not exists proximo_venc date
    generated always as (least(mantencion_vencimiento, hosting_vencimiento, dominio_vencimiento)) stored,
  add column if not exists saldo_pendiente numeric
    generated always as (
      case when estado = 'Concretado' and coalesce(pago_estado, '') <> 'Pagado'
           then coalesce(monto_pendiente, 0) else 0 end
    ) stored;

-- Índices para que ordenar y filtrar siga siendo rápido con muchos clientes
create index if not exists clientes_creado_idx        on public.clientes (creado_at desc);
create index if not exists clientes_estado_idx        on public.clientes (estado);
create index if not exists clientes_pago_idx          on public.clientes (pago_estado);
create index if not exists clientes_proximo_venc_idx  on public.clientes (proximo_venc);

-- Verificación: deberías ver las 5 columnas nuevas
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'clientes'
  and column_name in ('ciudad', 'rubro', 'servicio_interes', 'proximo_venc', 'saldo_pendiente');
