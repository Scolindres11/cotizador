-- =====================================================================
-- Cotizador COMRURAL · Migración 01
-- Ejecutar UNA vez en Supabase › SQL Editor › New query › Run.
-- Se puede volver a ejecutar sin daño: no borra ni cambia columnas existentes.
-- =====================================================================

-- 1) Columnas nuevas en cotizaciones -----------------------------------
-- organizacion_id: mismo tipo que organizaciones.id (se detecta solo)
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
    from pg_attribute a
   where a.attrelid = 'public.organizaciones'::regclass and a.attname = 'id';
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cotizaciones' and column_name = 'organizacion_id') then
    execute format('alter table public.cotizaciones add column organizacion_id %s references public.organizaciones(id) on delete set null', t);
  end if;
end $$;

alter table public.cotizaciones add column if not exists es_manual       boolean not null default false;
alter table public.cotizaciones add column if not exists pasado_catalogo boolean not null default false;
create index if not exists cotizaciones_organizacion_id_idx on public.cotizaciones (organizacion_id);

-- Unir las cotizaciones que ya existen con su organización
-- a) mismo nombre y mismo lote
update public.cotizaciones c
   set organizacion_id = o.id
  from public.organizaciones o
 where c.organizacion_id is null
   and lower(trim(c.organizacion)) = lower(trim(o.organizacion))
   and c.lote::text is not distinct from o.lote::text;
-- b) mismo nombre, cuando el nombre es único
update public.cotizaciones c
   set organizacion_id = o.id
  from public.organizaciones o
 where c.organizacion_id is null
   and lower(trim(c.organizacion)) = lower(trim(o.organizacion))
   and (select count(*) from public.organizaciones o2
         where lower(trim(o2.organizacion)) = lower(trim(o.organizacion))) = 1;

-- 2) Órdenes de compra con número correlativo (OC-001, OC-002…) --------
create sequence if not exists public.ordenes_compra_seq;

create table if not exists public.ordenes_compra (
  id              bigint generated always as identity primary key,
  numero          text not null unique,
  organizacion_id text not null,
  organizacion    text,
  lote            text,
  total           numeric,
  creado_por      text,
  creado_en       timestamptz not null default now()
);
create index if not exists ordenes_compra_org_idx on public.ordenes_compra (organizacion_id);

alter table public.ordenes_compra enable row level security;
drop policy if exists "ordenes_compra: leer autorizados" on public.ordenes_compra;
create policy "ordenes_compra: leer autorizados" on public.ordenes_compra
  for select to authenticated using (public.es_autorizado());
grant select on public.ordenes_compra to authenticated;

-- Crea el siguiente número de orden (solo usuarios autorizados)
create or replace function public.crear_orden_compra(
  p_organizacion_id text, p_organizacion text, p_lote text, p_total numeric
) returns public.ordenes_compra
language plpgsql security definer set search_path = public as $$
declare r public.ordenes_compra;
begin
  if not public.es_autorizado() then
    raise exception 'Tu correo no está autorizado';
  end if;
  insert into public.ordenes_compra (numero, organizacion_id, organizacion, lote, total, creado_por)
  values ('OC-' || lpad(nextval('public.ordenes_compra_seq')::text, 3, '0'),
          p_organizacion_id, p_organizacion, p_lote, p_total, auth.jwt() ->> 'email')
  returning * into r;
  return r;
end $$;
revoke all on function public.crear_orden_compra(text, text, text, numeric) from public, anon;
grant execute on function public.crear_orden_compra(text, text, text, numeric) to authenticated;

-- 3) Vaciar el catálogo antes de "Reemplazar todo" (solo admin) --------
create or replace function public.vaciar_catalogo()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo la administradora puede vaciar el catálogo';
  end if;
  truncate table public.catalogo;
end $$;
revoke all on function public.vaciar_catalogo() from public, anon;
grant execute on function public.vaciar_catalogo() to authenticated;

-- 4) Cambios en vivo (Realtime) para cotizaciones ---------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cotizaciones') then
    alter publication supabase_realtime add table public.cotizaciones;
  end if;
end $$;

-- Verificación: debe mostrar cuántas cotizaciones quedaron sin organización
select count(*) filter (where organizacion_id is null) as sin_organizacion,
       count(*) as total
  from public.cotizaciones;
