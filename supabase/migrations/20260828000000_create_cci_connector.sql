create extension if not exists pg_trgm with schema extensions;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (store_id, user_id)
);

create index if not exists store_members_user_id_idx
  on public.store_members (user_id);

create or replace function public.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_members
    where store_members.store_id = target_store_id
      and store_members.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_store_member(uuid) from public;
grant execute on function public.is_store_member(uuid) to authenticated;

create table if not exists public.erp_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  external_id text not null,
  description text not null,
  sale_price numeric,
  cost_price numeric,
  stock numeric,
  barcode text,
  reference text,
  location text,
  supplier text,
  raw_data jsonb,
  synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint erp_products_store_provider_external_unique
    unique (store_id, provider, external_id)
);

create index if not exists erp_products_store_id_idx on public.erp_products (store_id);
create index if not exists erp_products_provider_idx on public.erp_products (provider);
create index if not exists erp_products_external_id_idx on public.erp_products (external_id);
create index if not exists erp_products_description_trgm_idx
  on public.erp_products using gin (description extensions.gin_trgm_ops);
create index if not exists erp_products_barcode_idx on public.erp_products (barcode)
  where barcode is not null;
create index if not exists erp_products_reference_idx on public.erp_products (reference)
  where reference is not null;

create table if not exists public.cci_connector_credentials (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null default 'CCI Connector',
  token_hash text not null unique check (char_length(token_hash) = 64),
  active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists cci_connector_credentials_store_id_idx
  on public.cci_connector_credentials (store_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger stores_set_updated_at
before update on public.stores
for each row execute function public.set_updated_at();

create trigger erp_products_set_updated_at
before update on public.erp_products
for each row execute function public.set_updated_at();

create trigger cci_connector_credentials_set_updated_at
before update on public.cci_connector_credentials
for each row execute function public.set_updated_at();

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.erp_products enable row level security;
alter table public.cci_connector_credentials enable row level security;

grant select on public.stores to authenticated;
grant select on public.store_members to authenticated;
grant select on public.erp_products to authenticated;

create policy "Store members can view stores"
on public.stores for select to authenticated
using (public.is_store_member(id));

create policy "Store members can view memberships"
on public.store_members for select to authenticated
using (public.is_store_member(store_id));

create policy "Store members can view ERP products"
on public.erp_products for select to authenticated
using (public.is_store_member(store_id));

-- Deliberately no client policy or grant for cci_connector_credentials.
-- The service-role-backed sync route is the only application path that reads it.
