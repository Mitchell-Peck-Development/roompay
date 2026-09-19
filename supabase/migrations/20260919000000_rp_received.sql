-- =============================================================================
-- RoomPay — how much of each statement has been received
--
-- Lets the calendar feed tell "Paid" from "Overdue". When the owner marks a
-- payment received on their device, the app sends that statement's running
-- total here: one number per statement, nothing about who paid or how.
--
-- Apply after 20260918000000_rp_schema.sql. Safe to run more than once.
-- =============================================================================

alter table rp.statements
  add column if not exists received_cents bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'statements_received_cents_range'
      and conrelid = 'rp.statements'::regclass
  ) then
    alter table rp.statements
      add constraint statements_received_cents_range
      check (received_cents between 0 and 100000000000);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- set_received: the owner's running total for one statement. Needs the write
-- key. Only a real change bumps the revision (which calendar feeds use to
-- update events in place).
-- -----------------------------------------------------------------------------
create or replace function rp.set_received(
  p_token_hash     text,
  p_write_key_hash text,
  p_period         text,
  p_kind           text,
  p_received_cents bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link     rp.links%rowtype;
  v_stmt     rp.statements%rowtype;
  v_revision integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_write_key_hash is null or p_write_key_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_period is null or p_kind is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_received_cents is null or p_received_cents not between 0 and 100000000000 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_link from rp.links l where l.token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_link.write_key_hash <> p_write_key_hash then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_stmt from rp.statements s
  where s.link_id = v_link.id and s.period = p_period and s.kind = p_kind
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_stmt.received_cents is distinct from p_received_cents then
    update rp.statements s
    set received_cents = p_received_cents, revision = s.revision + 1, updated_at = now()
    where s.id = v_stmt.id
    returning s.revision into v_revision;
  else
    v_revision := v_stmt.revision;
  end if;

  return jsonb_build_object('ok', true, 'received_cents', p_received_cents, 'revision', v_revision);
end;
$$;

-- -----------------------------------------------------------------------------
-- view: same as before, now including received_cents per statement.
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
          'received_cents', s.received_cents,
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

revoke execute on function rp.set_received(text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function rp.set_received(text, text, text, text, bigint) to anon, authenticated, service_role;
