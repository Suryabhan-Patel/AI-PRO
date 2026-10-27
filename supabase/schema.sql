-- ============================================================
-- travel-planner: Supabase Database Schema
-- ============================================================
-- Run each section in the Supabase SQL editor (see README for
-- step-by-step instructions). Sections are idempotent – safe
-- to re-run after changes.
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";


-- ============================================================
-- 1. PROFILES
--    One row per auth.users record.
--    Created automatically via trigger on signup (see §6).
-- ============================================================
create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    email       text,
    full_name   text,
    avatar_url  text,
    created_at  timestamptz not null default now()
);

comment on table public.profiles is
    'Extended user data linked to Supabase Auth.';


-- ============================================================
-- 2. TRIPS
-- ============================================================
create table if not exists public.trips (
    id              uuid        primary key default uuid_generate_v4(),
    owner_id        uuid        not null references public.profiles (id) on delete cascade,

    -- Basic info
    title           text        not null,
    destination     text        not null,
    start_date      date,
    end_date        date,

    -- Planning details
    budget          numeric(12, 2),
    travel_style    text,           -- e.g. 'adventure', 'luxury', 'backpacker'
    group_size      integer         check (group_size > 0),
    interests       text[]      not null default '{}',
    pace            text,           -- e.g. 'relaxed', 'moderate', 'fast'

    -- AI-generated output
    itinerary       jsonb       not null default '[]'::jsonb,
    estimated_cost  numeric(12, 2),

    -- Timestamps
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),

    -- Constraints
    constraint valid_date_range check (end_date is null or start_date is null or end_date >= start_date),
    constraint valid_budget     check (budget is null or budget >= 0)
);

comment on table public.trips is
    'A travel plan created by a user, optionally shared with group members.';
comment on column public.trips.itinerary     is 'AI-generated day-by-day itinerary stored as JSON.';
comment on column public.trips.interests     is 'Array of interest tags, e.g. {food, history, adventure}.';
comment on column public.trips.travel_style  is 'One of: adventure | luxury | backpacker | cultural | family | business';
comment on column public.trips.pace          is 'One of: relaxed | moderate | fast';


-- ============================================================
-- 3. TRIP MEMBERS
--    Allows multiple users to collaborate on a single trip.
-- ============================================================
create table if not exists public.trip_members (
    trip_id     uuid    not null references public.trips (id) on delete cascade,
    user_id     uuid    not null references public.profiles (id) on delete cascade,
    role        text    not null default 'viewer'
                        check (role in ('editor', 'viewer')),

    primary key (trip_id, user_id)
);

comment on table public.trip_members is
    'Associates users with trips they did not create (shared group trips).';
comment on column public.trip_members.role is
    'viewer = read-only access; editor = can update itinerary and details.';


-- ============================================================
-- 4. INDEXES
-- ============================================================
create index if not exists idx_trips_owner_id
    on public.trips (owner_id);

create index if not exists idx_trips_destination
    on public.trips (destination);

create index if not exists idx_trips_start_date
    on public.trips (start_date);

create index if not exists idx_trip_members_user_id
    on public.trip_members (user_id);


-- ============================================================
-- 5. AUTO-UPDATE updated_at TRIGGER
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at
    before update on public.trips
    for each row execute function public.set_updated_at();


-- ============================================================
-- 6. AUTO-PROFILE CREATION TRIGGER
--    Fires after a new user signs up via Supabase Auth,
--    creating a matching row in public.profiles.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer          -- runs as the table owner, bypassing RLS
set search_path = public
as $$
begin
    insert into public.profiles (id, email, full_name, avatar_url)
    values (
        new.id,
        new.email,
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'avatar_url'
    )
    on conflict (id) do update set
        email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
    return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();


-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles     enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;

-- ------------------------------------------------------------
-- Helper function: is the current user a member of a trip?
-- (security definer prevents policy recursion)
-- ------------------------------------------------------------
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
security definer
stable
as $$
    select exists (
        select 1
        from   public.trip_members
        where  trip_id = p_trip_id
        and    user_id = auth.uid()
    );
$$;

-- Helper: is the current user an editor of a trip?
create or replace function public.is_trip_editor(p_trip_id uuid)
returns boolean
language sql
security definer
stable
as $$
    select exists (
        select 1
        from   public.trip_members
        where  trip_id = p_trip_id
        and    user_id = auth.uid()
        and    role    = 'editor'
    );
$$;


-- ========================
-- 7a. PROFILES POLICIES
-- ========================

-- Authenticated users can view profiles (needed for member lookup and collaboration)
create policy "profiles: authenticated users can select"
    on public.profiles for select
    to authenticated
    using (true);

-- Users can update their own profile
create policy "profiles: owner can update"
    on public.profiles for update
    using (id = auth.uid())
    with check (id = auth.uid());


-- ========================
-- 7b. TRIPS POLICIES
-- ========================

-- Owners and members can read a trip
create policy "trips: owner or member can select"
    on public.trips for select
    using (
        owner_id = auth.uid()
        or public.is_trip_member(id)
    );

-- Only the owner can insert a new trip
create policy "trips: owner can insert"
    on public.trips for insert
    with check (owner_id = auth.uid());

-- Owner or editors can update a trip
create policy "trips: owner or editor can update"
    on public.trips for update
    using (
        owner_id = auth.uid()
        or public.is_trip_editor(id)
    )
    with check (
        owner_id = auth.uid()
        or public.is_trip_editor(id)
    );

-- Only the owner can delete a trip
create policy "trips: owner can delete"
    on public.trips for delete
    using (owner_id = auth.uid());


-- ========================
-- 7c. TRIP_MEMBERS POLICIES
-- ========================

-- Owners and existing members can see the member list
create policy "trip_members: owner or member can select"
    on public.trip_members for select
    using (
        public.is_trip_member(trip_id)
        or exists (
            select 1 from public.trips
            where id = trip_id and owner_id = auth.uid()
        )
    );

-- Only the trip owner can add members
create policy "trip_members: owner can insert"
    on public.trip_members for insert
    with check (
        exists (
            select 1 from public.trips
            where id = trip_id and owner_id = auth.uid()
        )
    );

-- Only the trip owner can change a member's role
create policy "trip_members: owner can update"
    on public.trip_members for update
    using (
        exists (
            select 1 from public.trips
            where id = trip_id and owner_id = auth.uid()
        )
    );

-- Only the trip owner can remove members
create policy "trip_members: owner can delete"
    on public.trip_members for delete
    using (
        exists (
            select 1 from public.trips
            where id = trip_id and owner_id = auth.uid()
        )
    );
