-- WebKrypto · Migración para el panel mejorado (notas adicionales por cliente)
-- Pega en Supabase > SQL Editor > New query y presiona "Run". Se puede ejecutar más de una vez.
alter table public.clientes add column if not exists notas_historial jsonb default '[]'::jsonb;
create index if not exists clientes_creado_idx on public.clientes (creado_at desc);
