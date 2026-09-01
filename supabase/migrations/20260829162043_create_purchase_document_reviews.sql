create table public.purchase_document_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider = 'cci'),
  supplier_name text not null,
  source_filename text not null,
  status text not null default 'confirmed' check (status in ('review', 'confirmed', 'error')),
  created_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz
);

create index purchase_document_reviews_store_created_idx
  on public.purchase_document_reviews (store_id, created_at desc);
create index purchase_document_reviews_user_created_idx
  on public.purchase_document_reviews (user_id, created_at desc);

create table public.purchase_document_review_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.purchase_document_reviews(id) on delete cascade,
  supplier_code text,
  supplier_reference text,
  incoming_description text not null,
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_cost numeric(14, 3) not null check (unit_cost >= 0),
  line_total numeric(14, 2),
  raw_text text,
  status text not null check (status in ('matched', 'manual_match', 'new_product', 'ignored')),
  selected_product_id uuid references public.erp_products(id) on delete restrict,
  selected_external_id text,
  deterministic_score numeric(6, 5),
  ai_confidence numeric(6, 5),
  match_method text check (match_method in ('exact', 'deterministic', 'ai_reranked', 'manual')),
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (status in ('matched', 'manual_match') and selected_product_id is not null and selected_external_id is not null and match_method is not null)
    or (status in ('new_product', 'ignored') and selected_product_id is null and selected_external_id is null)
  )
);

create index purchase_document_review_items_document_idx
  on public.purchase_document_review_items (document_id);
create index purchase_document_review_items_selected_product_idx
  on public.purchase_document_review_items (selected_product_id)
  where selected_product_id is not null;

alter table public.purchase_document_reviews enable row level security;
alter table public.purchase_document_review_items enable row level security;

grant select, insert on public.purchase_document_reviews to authenticated;
grant select, insert on public.purchase_document_review_items to authenticated;
grant all on public.purchase_document_reviews to service_role;
grant all on public.purchase_document_review_items to service_role;

create policy "Store members view their purchase reviews"
on public.purchase_document_reviews for select to authenticated
using (user_id = (select auth.uid()) and public.is_store_member(store_id));

create policy "Store members create their purchase reviews"
on public.purchase_document_reviews for insert to authenticated
with check (user_id = (select auth.uid()) and public.is_store_member(store_id));

create policy "Store members view their purchase review items"
on public.purchase_document_review_items for select to authenticated
using (exists (
  select 1 from public.purchase_document_reviews reviews
  where reviews.id = purchase_document_review_items.document_id
    and reviews.user_id = (select auth.uid())
    and public.is_store_member(reviews.store_id)
));

create policy "Store members create their purchase review items"
on public.purchase_document_review_items for insert to authenticated
with check (exists (
  select 1 from public.purchase_document_reviews reviews
  where reviews.id = purchase_document_review_items.document_id
    and reviews.user_id = (select auth.uid())
    and public.is_store_member(reviews.store_id)
));
