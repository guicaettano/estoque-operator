alter table public.purchase_document_allocations
  add column if not exists minimum_stock numeric(14, 4);
