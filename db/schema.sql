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
    latency_ms integer,
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


-- 5. Projects Table
create table if not exists public.projects (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    name text not null,
    description text,
    status text default 'started' not null check (status in ('backlog', 'started', 'completed', 'paused')),
    target_date timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on projects
alter table public.projects enable row level security;

-- Indexing for projects
create index if not exists projects_user_idx on public.projects(user_id);

-- 5b. Project Milestones Table
create table if not exists public.project_milestones (
    id uuid default gen_random_uuid() primary key,
    project_id uuid references public.projects(id) on delete cascade not null,
    name text not null,
    description text,
    status text default 'open' not null check (status in ('open', 'completed')),
    target_date timestamp with time zone not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on project_milestones
alter table public.project_milestones enable row level security;

-- Indexing for project_milestones
create index if not exists project_milestones_project_idx on public.project_milestones(project_id);

-- 6. Incidents Table
create table if not exists public.incidents (
    id uuid default gen_random_uuid() primary key,
    endpoint_id uuid references public.endpoints(id) on delete cascade not null,
    project_id uuid references public.projects(id) on delete set null,
    title text not null,
    description text,
    status text default 'todo' not null check (status in ('todo', 'in_progress', 'done')),
    priority text default 'medium' not null,
    assignee text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on incidents
alter table public.incidents enable row level security;

-- Indexing for performance
create index if not exists incidents_endpoint_idx on public.incidents(endpoint_id);
create index if not exists incidents_status_idx on public.incidents(status);
create index if not exists incidents_project_idx on public.incidents(project_id);

-- 7. Incident Comments Table
create table if not exists public.incident_comments (
    id uuid default gen_random_uuid() primary key,
    incident_id uuid references public.incidents(id) on delete cascade not null,
    commenter text not null,
    body text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on comments
alter table public.incident_comments enable row level security;

-- Indexing
create index if not exists incident_comments_incident_idx on public.incident_comments(incident_id);


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES FOR INCIDENTS / PROJECTS
-- ==========================================

create policy projects_all_policy on public.projects
    for all using ((select auth.uid()) = user_id);

create policy project_milestones_all_policy on public.project_milestones
    for all using (
        exists (
            select 1 from public.projects
            where public.projects.id = project_milestones.project_id
              and public.projects.user_id = (select auth.uid())
        )
    );

create policy incidents_all_policy on public.incidents
    for all using (
        exists (
            select 1 from public.endpoints
            where public.endpoints.id = incidents.endpoint_id
              and public.endpoints.user_id = (select auth.uid())
        )
    );

create policy incident_comments_all_policy on public.incident_comments
    for all using (
        exists (
            select 1 from public.incidents
            join public.endpoints on public.endpoints.id = public.incidents.endpoint_id
            where public.incidents.id = incident_comments.incident_id
              and public.endpoints.user_id = (select auth.uid())
        )
    );


-- 8. Alert Channels Table
create table if not exists public.alert_channels (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    name text not null,
    channel_type text not null check (channel_type in ('slack', 'email', 'discord')),
    config jsonb not null,
    is_active boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.alert_channels enable row level security;

-- Index
create index if not exists alert_channels_user_idx on public.alert_channels(user_id);

-- RLS Policy
create policy alert_channels_all_policy on public.alert_channels
    for all using ((select auth.uid()) = user_id);


-- 9. Severity Priorities Table
create table if not exists public.severity_priorities (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    name text not null,
    color text not null,
    rank integer default 1 not null,
    threshold_failures integer default 1 not null,
    alert_channel_id uuid references public.alert_channels(id) on delete set null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.severity_priorities enable row level security;

-- Index
create index if not exists severity_priorities_user_idx on public.severity_priorities(user_id);

-- RLS Policy
create policy severity_priorities_all_policy on public.severity_priorities
    for all using ((select auth.uid()) = user_id);




