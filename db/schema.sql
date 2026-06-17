-- Create schema objects for HookShield

-- 1. Users Table (linked to auth.users if run in Supabase, fallback to uuid for generic postgres)
create table if not exists public.users (
    id uuid primary key,
    email text not null unique,
    api_key text not null unique,
    tier text not null default 'free' check (tier in ('free', 'premium', 'enterprise')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on users
alter table public.users enable row level security;

-- 2. Endpoints Table
create table if not exists public.endpoints (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    slug text not null unique,
    source_name text not null,
    secret_token text,
    active_state boolean default true not null,
    target_url text not null,
    failure_count integer default 0 not null,
    alert_webhook_url text,
    auth_headers jsonb,
    max_retries integer,
    backoff_base integer,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on endpoints
alter table public.endpoints enable row level security;

-- Index for instant lookup of slug during ingestion
create index if not exists endpoints_slug_idx on public.endpoints(slug);

-- 3. Webhook Logs Table
create table if not exists public.webhook_logs (
    id uuid default gen_random_uuid() primary key,
    endpoint_id uuid references public.endpoints(id) on delete cascade not null,
    payload_string text not null,
    headers_json jsonb not null,
    response_code integer,
    delivery_status text not null check (delivery_status in ('pending', 'success', 'failed', 'dropped')),
    retry_count integer default 0 not null,
    error_message text,
    event_hash text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on webhook_logs
alter table public.webhook_logs enable row level security;

-- Composite index targeting high-volume log writes, filtering, and ordering
create index if not exists webhook_logs_perf_idx on public.webhook_logs (endpoint_id, delivery_status, created_at desc);
create index if not exists webhook_logs_event_hash_idx on public.webhook_logs (event_hash);

-- 4. Idempotency Keys Table for deduplication
create table if not exists public.idempotency_keys (
    key_hash text primary key, -- Composite key of endpoint_id + upstream_event_id
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on idempotency_keys
alter table public.idempotency_keys enable row level security;


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Users Policies
create policy users_select_policy on public.users
    for select using ((select auth.uid()) = id);

create policy users_update_policy on public.users
    for update using ((select auth.uid()) = id);

-- Endpoints Policies
create policy endpoints_all_policy on public.endpoints
    for all using ((select auth.uid()) = user_id);

-- Webhook Logs Policies
-- A user can access logs for endpoints they own
create policy webhook_logs_all_policy on public.webhook_logs
    for all using (
        exists (
            select 1 from public.endpoints
            where public.endpoints.id = webhook_logs.endpoint_id
              and public.endpoints.user_id = (select auth.uid())
        )
    );

-- Idempotency Keys Policies (internal use, but lock to authenticated just in case)
create policy idempotency_all_policy on public.idempotency_keys
    for all using (true);
