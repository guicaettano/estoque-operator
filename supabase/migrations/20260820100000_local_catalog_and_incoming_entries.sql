create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text,
  name text not null check (char_length(trim(name)) > 0),
  unit text,
  cost numeric(14, 2),
  sale_price numeric(14, 2),
  source text not null default 'local' check (source in ('local', 'tagplus')),
  external_id text,
  sync_status text not null default 'local_only' check (sync_status in ('local_only', 'pending', 'synced', 'error')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists product_catalog_user_id_idx on public.product_catalog (user_id);
create unique index if not exists product_catalog_user_id_code_unique_idx on public.product_catalog (user_id, code) where code is not null;

create table if not exists public.incoming_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_name text,
  source_filename text not null,
  source text not null check (source in ('pdf', 'xml')),
  status text not null default 'review' check (status in ('review', 'confirmed', 'error')),
  created_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz
);

create index if not exists incoming_entries_user_id_created_at_idx on public.incoming_entries (user_id, created_at desc);

create table if not exists public.incoming_entry_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.incoming_entries(id) on delete cascade,
  incoming_code text,
  incoming_description text not null,
  final_name text not null,
  unit text,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  profit_percentage numeric(8, 2) not null check (profit_percentage >= 0),
  sale_price numeric(14, 2) not null check (sale_price >= 0),
  rr_motos_quantity numeric(14, 4) not null check (rr_motos_quantity >= 0),
  rr_autopecas_quantity numeric(14, 4) not null check (rr_autopecas_quantity >= 0),
  matched_product_id uuid not null references public.product_catalog(id) on delete restrict,
  action text not null check (action in ('matched', 'created')),
  created_at timestamptz not null default timezone('utc', now()),
  check (rr_motos_quantity + rr_autopecas_quantity = quantity)
);

create index if not exists incoming_entry_items_entry_id_idx on public.incoming_entry_items (entry_id);

alter table public.product_catalog enable row level security;
alter table public.incoming_entries enable row level security;
alter table public.incoming_entry_items enable row level security;

grant select, insert, update, delete on public.product_catalog to authenticated;
grant select, insert, update, delete on public.incoming_entries to authenticated;
grant select, insert, update, delete on public.incoming_entry_items to authenticated;

create policy "Users manage their catalog products"
on public.product_catalog for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their own incoming entries"
on public.incoming_entries for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage items of their own incoming entries"
on public.incoming_entry_items for all to authenticated
using (exists (
  select 1 from public.incoming_entries
  where incoming_entries.id = incoming_entry_items.entry_id
    and incoming_entries.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.incoming_entries
  where incoming_entries.id = incoming_entry_items.entry_id
    and incoming_entries.user_id = (select auth.uid())
));

create trigger product_catalog_set_updated_at
before update on public.product_catalog
for each row execute function public.set_updated_at();
