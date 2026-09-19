-- =============================================================================
-- RoomPay share links — schema "rp"
--
-- Target: the Apps Portal Supabase project (shared with other apps' schemas).
--
-- What lives here: opt-in share links. When someone publishes a month from
-- RoomPay, a snapshot of that month's numbers is stored under a random link so
-- a roommate can open it. There are no accounts and nothing here identifies a
-- person: labels are arbitrary text, and there are no payment details.
--
-- Access model: the two tables have RLS enabled with NO policies and NO grants.
-- Everything goes through the SECURITY DEFINER functions below, each of which
-- checks a SHA-256 hash of a secret the caller must already hold:
--   * the link token  (lives in the roommate's URL)      -> read, pick a plan
--   * the write key   (never leaves the owner's device)  -> publish, unpublish, revoke
-- RoomPay's server hashes both before calling, so raw secrets never reach this
-- database. It connects with the project's *publishable* key — no service role.
--
-- Because the functions are callable with a public key, they defend themselves:
-- strict input checks, a 32 KB payload cap, 40 statements per link, months and
-- due dates kept within two years of today (so nothing lives forever), a
-- circuit breaker on new links, a hard ceiling on total storage, and expiry.
--
-- AFTER APPLYING — one manual step:
--   Dashboard -> Project Settings -> API -> "Exposed schemas" -> add  rp
--
-- Safe to run more than once.
-- =============================================================================

create schema if not exists rp;

-- One durable link per roommate. Months are published into it.
create table if not exists rp.links (
  id              uuid primary key default gen_random_uuid(),
  token_hash      text not null,
  write_key_hash  text not null,
  household_label text not null default '',
  roommate_label  text not null default '',
  preferred_plan  text,                       -- the roommate's last pick; new months inherit it
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  constraint links_token_hash_key unique (token_hash),
  constraint links_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint links_write_key_hash_format check (write_key_hash ~ '^[0-9a-f]{64}$'),
  constraint links_household_label_len check (char_length(household_label) <= 80),
  constraint links_roommate_label_len check (char_length(roommate_label) <= 80),
  constraint links_preferred_plan_len check (preferred_plan is null or char_length(preferred_plan) <= 64)
);

create index if not exists links_expires_at_idx on rp.links (expires_at);
create index if not exists links_created_at_idx on rp.links (created_at);

-- One row per published month (or move-in catch-up) under a link. `payload` is a
-- snapshot computed on the owner's device; nothing here does arithmetic on it.
create table if not exists rp.statements (
  id           uuid primary key default gen_random_uuid(),
  link_id      uuid not null references rp.links (id) on delete cascade,
  period       text not null,
  kind         text not null,
  payload      jsonb not null,
  chosen_plan  text,
  chosen_at    timestamptz,
  revision     integer not null default 1,     -- becomes SEQUENCE in the calendar feed
  last_due_on  date not null,
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint statements_link_period_kind_key unique (link_id, period, kind),
  constraint statements_period_format check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint statements_kind_check check (kind in ('monthly', 'catchup')),
  constraint statements_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint statements_payload_size check (octet_length(payload::text) <= 32768),
  constraint statements_chosen_plan_len check (chosen_plan is null or char_length(chosen_plan) <= 64)
);

alter table rp.links enable row level security;
alter table rp.statements enable row level security;

-- -----------------------------------------------------------------------------
-- Past this much stored statement data, publish() only accepts edits to what
-- already exists — nothing new — so a flood can't grow the shared database
-- without bound. Legitimate use is a few KB per month per roommate.
-- -----------------------------------------------------------------------------
create or replace function rp.storage_ceiling_bytes() returns bigint
language sql
stable
set search_path = ''
as $$ select 512::bigint * 1024 * 1024 $$;

-- -----------------------------------------------------------------------------
-- publish: create the link on first use, otherwise require its write key;
-- upsert the statement; roll the expiry forward.
-- -----------------------------------------------------------------------------
create or replace function rp.publish(
  p_token_hash      text,
  p_write_key_hash  text,
  p_household_label text,
  p_roommate_label  text,
  p_period          text,
  p_kind            text,
  p_payload         jsonb,
  p_last_due_on     date
) returns jsonb
language plpgsql
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_link      rp.links%rowtype;
  v_revision  integer;
  v_max_due   date;
  v_expires   timestamptz;
  v_start     date;
  v_this      date := date_trunc('month', now())::date;
  v_full      boolean;
  v_household text := coalesce(p_household_label, '');
  v_roommate  text := coalesce(p_roommate_label, '');
  c_invalid   constant jsonb := jsonb_build_object('ok', false, 'error', 'invalid');
begin
  -- Separate checks on purpose: SQL doesn't promise to short-circuit OR, and
  -- jsonb_array_length() raises on anything that isn't an array.
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return c_invalid; end if;
  if p_write_key_hash is null or p_write_key_hash !~ '^[0-9a-f]{64}$' then return c_invalid; end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then return c_invalid; end if;
  if p_kind is null or p_kind not in ('monthly', 'catchup') then return c_invalid; end if;
  if p_last_due_on is null then return c_invalid; end if;
  -- Months within two years of today, and due dates near their month: this is
  -- what bounds how long anything can be kept alive.
  v_start := to_date(p_period || '-01', 'YYYY-MM-DD');
  if v_start < (v_this - interval '24 months')::date then return c_invalid; end if;
  if v_start > (v_this + interval '24 months')::date then return c_invalid; end if;
  if p_last_due_on < v_start - 31 then return c_invalid; end if;
  if p_last_due_on > (v_start + interval '13 months')::date then return c_invalid; end if;
  if char_length(v_household) > 80 or char_length(v_roommate) > 80 then return c_invalid; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then return c_invalid; end if;
  if octet_length(p_payload::text) > 32768 then return c_invalid; end if;
  if jsonb_typeof(p_payload -> 'plans') is distinct from 'array' then return c_invalid; end if;
  if jsonb_array_length(p_payload -> 'plans') not between 1 and 12 then return c_invalid; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_payload -> 'plans') as p
    where jsonb_typeof(p.value -> 'key') is distinct from 'string'
       or char_length(p.value ->> 'key') not between 1 and 64
  ) then
    return c_invalid;
  end if;

  v_full := pg_catalog.pg_total_relation_size('rp.statements') > rp.storage_ceiling_bytes();

  select * into v_link from rp.links l where l.token_hash = p_token_hash for update;

  if not found then
    if v_full then return jsonb_build_object('ok', false, 'error', 'busy'); end if;
    -- Circuit breaker: brand-new links are the only thing a stranger could use
    -- to fill this table, so cap how fast they can appear.
    if (select count(*) from rp.links l where l.created_at > now() - interval '1 hour') >= 300 then
      return jsonb_build_object('ok', false, 'error', 'busy');
    end if;

    insert into rp.links (token_hash, write_key_hash, household_label, roommate_label, expires_at)
    values (p_token_hash, p_write_key_hash, v_household, v_roommate, now() + interval '14 days')
    on conflict (token_hash) do nothing;

    select * into v_link from rp.links l where l.token_hash = p_token_hash for update;
  end if;

  if v_link.write_key_hash <> p_write_key_hash then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  if v_full and not exists (
    select 1 from rp.statements x
    where x.link_id = v_link.id and x.period = p_period and x.kind = p_kind
  ) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into rp.statements as s (link_id, period, kind, payload, last_due_on)
  values (v_link.id, p_period, p_kind, p_payload, p_last_due_on)
  on conflict (link_id, period, kind) do update set
    payload     = excluded.payload,
    last_due_on = excluded.last_due_on,
    revision    = s.revision + 1,
    updated_at  = now(),
    -- Keep the roommate's pick only while that plan still exists.
    chosen_plan = case when exists (
                    select 1 from jsonb_array_elements(excluded.payload -> 'plans') as p
                    where p.value ->> 'key' = s.chosen_plan
                  ) then s.chosen_plan end,
    chosen_at   = case when exists (
                    select 1 from jsonb_array_elements(excluded.payload -> 'plans') as p
                    where p.value ->> 'key' = s.chosen_plan
                  ) then s.chosen_at end
  returning s.revision into v_revision;

  -- Keep the newest 40 statements per link.
  delete from rp.statements d
  where d.link_id = v_link.id
    and d.id in (
      select x.id from rp.statements x
      where x.link_id = v_link.id
      order by x.period desc, x.kind desc
      offset 40
    );

  -- A link lives 60 days past its last due date, so one that's in use never
  -- lapses and an abandoned one cleans itself up.
  select max(x.last_due_on) into v_max_due from rp.statements x where x.link_id = v_link.id;
  v_expires := greatest(
    (v_max_due + 60)::timestamp at time zone 'UTC',
    now() + interval '14 days'
  );

  update rp.links l
  set household_label = v_household,
      roommate_label  = v_roommate,
      updated_at      = now(),
      expires_at      = v_expires
  where l.id = v_link.id;

  -- Opportunistic cleanup, so expiry works even without pg_cron.
  delete from rp.links l
  where l.id in (
    select x.id from rp.links x
    where x.expires_at < now() and x.id <> v_link.id
    limit 50
  );

  return jsonb_build_object('ok', true, 'revision', v_revision, 'expires_at', v_expires);
end;
$$;

-- -----------------------------------------------------------------------------
-- unpublish: remove one statement. Needs the write key.
-- -----------------------------------------------------------------------------
create or replace function rp.unpublish(
  p_token_hash     text,
  p_write_key_hash text,
  p_period         text,
  p_kind           text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link    rp.links%rowtype;
  v_deleted integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_write_key_hash is null or p_write_key_hash !~ '^[0-9a-f]{64}$'
     or p_period is null or p_kind is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_link from rp.links l where l.token_hash = p_token_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_link.write_key_hash <> p_write_key_hash then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from rp.statements s
  where s.link_id = v_link.id and s.period = p_period and s.kind = p_kind;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true, 'deleted', v_deleted > 0);
end;
$$;

-- -----------------------------------------------------------------------------
-- revoke: delete the link and everything under it. Needs the write key.
-- -----------------------------------------------------------------------------
create or replace function rp.revoke(
  p_token_hash     text,
  p_write_key_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link rp.links%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_write_key_hash is null or p_write_key_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_link from rp.links l where l.token_hash = p_token_hash for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_link.write_key_hash <> p_write_key_hash then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  delete from rp.links l where l.id = v_link.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- view: what the link token unlocks. Never returns either hash.
-- -----------------------------------------------------------------------------
create or replace function rp.view(p_token_hash text) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_link rp.links%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_link from rp.links l
  where l.token_hash = p_token_hash and l.expires_at > now();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'link', jsonb_build_object(
      'id', v_link.id,
      'household_label', v_link.household_label,
      'roommate_label', v_link.roommate_label,
      'preferred_plan', v_link.preferred_plan,
      'expires_at', v_link.expires_at
    ),
    'statements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'period', s.period,
          'kind', s.kind,
          'payload', s.payload,
          'chosen_plan', s.chosen_plan,
          'chosen_at', s.chosen_at,
          'revision', s.revision,
          'published_at', s.published_at,
          'updated_at', s.updated_at
        )
        order by s.period desc, s.kind desc
      )
      from rp.statements s
      where s.link_id = v_link.id
    ), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- pick: the roommate chooses how they'd like to pay. The link token is enough.
-- The choice also becomes the link's default for months published later.
-- -----------------------------------------------------------------------------
create or replace function rp.pick(
  p_token_hash text,
  p_period     text,
  p_kind       text,
  p_plan       text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stmt     rp.statements%rowtype;
  v_revision integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_period is null or p_kind is null
     or p_plan is null or char_length(p_plan) not between 1 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select s.* into v_stmt
  from rp.statements s
  join rp.links l on l.id = s.link_id
  where l.token_hash = p_token_hash
    and l.expires_at > now()
    and s.period = p_period
    and s.kind = p_kind
  for update of s;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not exists (
    select 1 from jsonb_array_elements(v_stmt.payload -> 'plans') as p
    where p.value ->> 'key' = p_plan
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Only a real change bumps the revision, so calendars aren't churned.
  if v_stmt.chosen_plan is distinct from p_plan then
    update rp.statements s
    set chosen_plan = p_plan, chosen_at = now(), revision = s.revision + 1, updated_at = now()
    where s.id = v_stmt.id
    returning s.revision into v_revision;
  else
    v_revision := v_stmt.revision;
  end if;

  update rp.links l
  set preferred_plan = p_plan, updated_at = now()
  where l.id = v_stmt.link_id and l.preferred_plan is distinct from p_plan;

  return jsonb_build_object('ok', true, 'chosen_plan', p_plan, 'revision', v_revision);
end;
$$;

-- -----------------------------------------------------------------------------
-- purge_expired: housekeeping. service_role only.
-- -----------------------------------------------------------------------------
create or replace function rp.purge_expired() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from rp.links l where l.expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges. Functions are executable by PUBLIC by default, so that is
-- revoked explicitly (any function added to this schema later needs the same).
-- -----------------------------------------------------------------------------
revoke all on schema rp from public;
grant usage on schema rp to anon, authenticated, service_role;

revoke all on all tables in schema rp from public, anon, authenticated;
grant all on all tables in schema rp to service_role;

revoke execute on all functions in schema rp from public, anon, authenticated;

grant execute on function rp.publish(text, text, text, text, text, text, jsonb, date) to anon, authenticated, service_role;
grant execute on function rp.unpublish(text, text, text, text) to anon, authenticated, service_role;
grant execute on function rp.revoke(text, text) to anon, authenticated, service_role;
grant execute on function rp.view(text) to anon, authenticated, service_role;
grant execute on function rp.pick(text, text, text, text) to anon, authenticated, service_role;
grant execute on function rp.purge_expired() to service_role;

-- -----------------------------------------------------------------------------
-- Daily purge, if pg_cron is installed. publish() also purges as it goes, so
-- this is a tidy-up rather than a requirement.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rp-purge-expired', '17 4 * * *', 'select rp.purge_expired()');
  end if;
end;
$$;
