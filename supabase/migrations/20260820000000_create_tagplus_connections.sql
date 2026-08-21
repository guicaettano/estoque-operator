create table if not exists public.tagplus_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'bearer',
  scopes text not null default 'read:produtos',
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.tagplus_connections enable row level security;

-- Intentionally no client policies: tokens are accessed only through server routes
-- using SUPABASE_SERVICE_ROLE_KEY.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = timezone('utc', now()); return new; end; $$;

create trigger tagplus_connections_set_updated_at
before update on public.tagplus_connections
for each row execute function public.set_updated_at();
