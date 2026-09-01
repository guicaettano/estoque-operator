alter table public.stores add column if not exists provider text;

update public.stores stores set provider = 'cci'
where provider is null and exists (
  select 1 from public.erp_products products where products.store_id = stores.id and products.provider = 'cci'
);

alter table public.stores add constraint stores_provider_check
  check (provider in ('cci', 'tagplus')) not valid;

alter table public.tagplus_connections
  add column if not exists store_id uuid references public.stores(id) on delete restrict;

do $$
declare connection record; new_store_id uuid;
begin
  for connection in select id, user_id from public.tagplus_connections where store_id is null loop
    insert into public.stores (name, created_by, provider)
      values ('R&R AUTOPEÇAS', connection.user_id, 'tagplus') returning id into new_store_id;
    insert into public.store_members (store_id, user_id, role)
      values (new_store_id, connection.user_id, 'owner') on conflict do nothing;
    update public.tagplus_connections set store_id = new_store_id where id = connection.id;
  end loop;
end $$;

create unique index if not exists tagplus_connections_store_id_unique_idx
  on public.tagplus_connections (store_id) where store_id is not null;

alter table public.purchase_document_reviews
  drop constraint if exists purchase_document_reviews_provider_check;
alter table public.purchase_document_reviews
  add constraint purchase_document_reviews_provider_check check (provider in ('cci', 'multi_store'));

alter table public.purchase_document_review_items
  add column if not exists inventory_update_plan jsonb;

create table public.purchase_document_allocations (
  id uuid primary key default gen_random_uuid(),
  review_item_id uuid not null references public.purchase_document_review_items(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete restrict,
  store_name text not null,
  provider text not null check (provider in ('cci', 'tagplus')),
  product_id text,
  external_id text,
  product_description text,
  current_stock numeric(14, 4), sales_7d numeric(14, 4), sales_30d numeric(14, 4), sales_90d numeric(14, 4),
  avg_daily_sales_30d numeric(14, 6), days_of_cover numeric(14, 4), last_sale_at timestamptz,
  data_quality text not null check (data_quality in ('low', 'medium', 'high')),
  suggested_quantity numeric(14, 4) not null check (suggested_quantity >= 0),
  allocated_quantity numeric(14, 4) not null check (allocated_quantity >= 0),
  predicted_stock numeric(14, 4), current_cost numeric(14, 4), new_cost numeric(14, 4),
  current_sale_price numeric(14, 4), new_sale_price numeric(14, 4),
  allocation_method text not null check (allocation_method in ('deterministic', 'ai', 'manual')),
  necessity_score numeric(12, 6) not null,
  necessity_level text not null check (necessity_level in ('low', 'medium', 'high', 'critical')),
  reason text not null, confidence numeric(6, 5), requires_product_creation boolean not null default false,
  suggestion_accepted boolean not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (review_item_id, store_id)
);

create index purchase_document_allocations_review_item_idx on public.purchase_document_allocations (review_item_id);
create index purchase_document_allocations_acceptance_idx on public.purchase_document_allocations (created_at desc, suggestion_accepted);

alter table public.purchase_document_allocations enable row level security;
grant select, insert on public.purchase_document_allocations to authenticated;
grant all on public.purchase_document_allocations to service_role;

create policy "Store members view purchase allocations" on public.purchase_document_allocations
for select to authenticated using (exists (
  select 1 from public.purchase_document_review_items items
  join public.purchase_document_reviews reviews on reviews.id = items.document_id
  where items.id = purchase_document_allocations.review_item_id
    and reviews.user_id = (select auth.uid()) and public.is_store_member(purchase_document_allocations.store_id)
));

create policy "Store members create purchase allocations" on public.purchase_document_allocations
for insert to authenticated with check (exists (
  select 1 from public.purchase_document_review_items items
  join public.purchase_document_reviews reviews on reviews.id = items.document_id
  where items.id = purchase_document_allocations.review_item_id
    and reviews.user_id = (select auth.uid()) and public.is_store_member(purchase_document_allocations.store_id)
));
