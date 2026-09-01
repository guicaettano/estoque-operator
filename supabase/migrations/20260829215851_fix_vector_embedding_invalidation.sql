create or replace function public.invalidate_erp_product_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.search_text is distinct from old.search_text then
    new.embedding = null;
    new.embedding_updated_at = null;
  end if;
  return new;
end;
$$;
