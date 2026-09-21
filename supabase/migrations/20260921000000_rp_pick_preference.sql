-- =============================================================================
-- RoomPay — a catch-up pick only becomes the link's preference when it can be
--
-- rp.pick keeps the roommate's choice as the link's preferred plan, which new
-- months inherit. A catch-up now offers the household's usual schedules beside
-- the owner's own installments. Picking a usual schedule should carry on into
-- their months; picking the installments ('catchup' — a plan no month has)
-- shouldn't wipe out the preference they already had.
--
-- Apply after 20260919000000_rp_received.sql. Safe to run more than once.
-- =============================================================================

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

  -- A pick becomes the link's default for later months only if months can have that plan: the
  -- catch-up's own installments ('catchup', CATCHUP_PLAN_KEY in packages/core) exist on no month.
  if p_kind = 'monthly' or p_plan <> 'catchup' then
    update rp.links l
    set preferred_plan = p_plan, updated_at = now()
    where l.id = v_stmt.link_id and l.preferred_plan is distinct from p_plan;
  end if;

  return jsonb_build_object('ok', true, 'chosen_plan', p_plan, 'revision', v_revision);
end;
$$;

revoke execute on function rp.pick(text, text, text, text) from public, anon, authenticated;
grant execute on function rp.pick(text, text, text, text) to anon, authenticated, service_role;
