create extension if not exists vector with schema extensions;

alter table public.erp_products
  add column if not exists search_text text not null default '',
  add column if not exists embedding extensions.vector(512),
  add column if not exists embedding_updated_at timestamptz;

create index if not exists erp_products_store_provider_idx
  on public.erp_products (store_id, provider);

create index if not exists erp_products_search_text_trgm_idx
  on public.erp_products using gin (search_text extensions.gin_trgm_ops);

create or replace function public.invalidate_erp_product_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.search_text is distinct from old.search_text
    and new.embedding is not distinct from old.embedding then
    new.embedding = null;
    new.embedding_updated_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists erp_products_invalidate_embedding on public.erp_products;
create trigger erp_products_invalidate_embedding
before update of search_text on public.erp_products
for each row execute function public.invalidate_erp_product_embedding();

create or replace function public.match_erp_products(
  match_store_id uuid,
  match_provider text,
  query_text text,
  query_embedding extensions.vector(512),
  match_count integer default 30
)
returns table (
  id uuid,
  external_id text,
  description text,
  stock numeric,
  cost_price numeric,
  sale_price numeric,
  barcode text,
  reference text,
  supplier text,
  raw_data jsonb,
  lexical_score double precision,
  semantic_score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    products.id,
    products.external_id,
    products.description,
    products.stock,
    products.cost_price,
    products.sale_price,
    products.barcode,
    products.reference,
    products.supplier,
    products.raw_data,
    greatest(extensions.similarity(products.search_text, query_text), 0)::double precision as lexical_score,
    greatest(1 - (products.embedding OPERATOR(extensions.<=>) query_embedding), 0)::double precision as semantic_score
  from public.erp_products as products
  where products.store_id = match_store_id
    and products.provider = match_provider
    and products.embedding is not null
  order by (
    greatest(extensions.similarity(products.search_text, query_text), 0) * 0.55
    + greatest(1 - (products.embedding OPERATOR(extensions.<=>) query_embedding), 0) * 0.45
  ) desc
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.match_erp_products(uuid, text, text, extensions.vector, integer) from public, anon, authenticated;
grant execute on function public.match_erp_products(uuid, text, text, extensions.vector, integer) to service_role;

comment on column public.erp_products.embedding is
  'OpenAI text-embedding-3-small reduced to 512 dimensions; generated server-side only.';
comment on function public.match_erp_products(uuid, text, text, extensions.vector, integer) is
  'Hybrid candidate retrieval strictly isolated by store_id and provider. Structured conflict rules run in TypeScript.';
