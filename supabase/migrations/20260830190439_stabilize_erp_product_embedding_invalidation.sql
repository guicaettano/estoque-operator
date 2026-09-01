create extension if not exists pgcrypto with schema extensions;

alter table public.erp_products
  add column if not exists search_text_hash text;

update public.erp_products
set search_text_hash = encode(extensions.digest(coalesce(search_text, ''), 'sha256'), 'hex')
where search_text_hash is null
   or search_text_hash is distinct from encode(extensions.digest(coalesce(search_text, ''), 'sha256'), 'hex');

alter table public.erp_products
  alter column search_text_hash set not null;

create or replace function public.invalidate_erp_product_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  computed_hash text;
begin
  computed_hash := encode(extensions.digest(coalesce(new.search_text, ''), 'sha256'), 'hex');

  if tg_op = 'UPDATE' and computed_hash is distinct from old.search_text_hash then
    new.embedding = null;
    new.embedding_updated_at = null;
  end if;

  new.search_text_hash = computed_hash;
  return new;
end;
$$;

drop trigger if exists erp_products_invalidate_embedding on public.erp_products;
create trigger erp_products_invalidate_embedding
before insert or update of search_text on public.erp_products
for each row execute function public.invalidate_erp_product_embedding();

comment on column public.erp_products.search_text_hash is
  'SHA-256 of canonical search_text. Embeddings are invalidated only when this semantic hash changes.';
