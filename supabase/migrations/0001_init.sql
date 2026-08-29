-- Cairn phase 1: accounts, trips, money.
-- Money is integer minor units (bigint). No numeric, no float, anywhere.
-- Currency is per-expense; balances net per currency.

-- ---------------------------------------------------------------- profiles
-- Deliberately holds NO contact details. Email lives only in auth.users,
-- which is not readable by other users.
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table trips (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 100),
  base_currency char(3) not null,           -- display default only; expenses carry their own
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now()
);

create table trip_members (
  trip_id   uuid not null references trips(id) on delete cascade,
  user_id   uuid not null references profiles(id),
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index on trip_members (user_id);

create table trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references trips(id) on delete cascade,
  token       text not null unique
                default replace(gen_random_uuid()::text,'-','')
                      || replace(gen_random_uuid()::text,'-',''),
  email       text,                          -- optional: null = open link
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_by uuid references profiles(id),
  accepted_at timestamptz
);

-- ---------------------------------------------------------------- expenses
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  description  text not null check (length(trim(description)) between 1 and 200),
  currency     char(3) not null,
  amount_minor bigint not null check (amount_minor > 0),
  spent_at     date not null default current_date,
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  unique (id, trip_id)                       -- target for the composite FKs below
);
create index on expenses (trip_id, spent_at desc);

-- paid_by as {user: amount}. Several payers per bill.
create table expense_payers (
  expense_id   uuid not null,
  trip_id      uuid not null,
  user_id      uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  primary key (expense_id, user_id),
  foreign key (expense_id, trip_id) references expenses(id, trip_id) on delete cascade,
  -- payer must be a member of that trip. Enforced by the database, not by app code.
  foreign key (trip_id, user_id)   references trip_members(trip_id, user_id)
);

-- shares as {user: amount}. This map is the truth, whatever the UI called the split.
create table expense_shares (
  expense_id   uuid not null,
  trip_id      uuid not null,
  user_id      uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  primary key (expense_id, user_id),
  foreign key (expense_id, trip_id) references expenses(id, trip_id) on delete cascade,
  foreign key (trip_id, user_id)   references trip_members(trip_id, user_id)
);

-- payers and shares must each sum to the bill total. Deferred so one
-- transaction can write header + lines in any order.
create function assert_expense_balanced(eid uuid) returns void
language plpgsql as $$
declare total bigint; p bigint; s bigint;
begin
  select amount_minor into total from expenses where id = eid;
  if total is null then return; end if;              -- expense was deleted
  select coalesce(sum(amount_minor),0) into p from expense_payers where expense_id = eid;
  select coalesce(sum(amount_minor),0) into s from expense_shares where expense_id = eid;
  if p <> total then raise exception 'payers sum % <> total % (expense %)', p, total, eid; end if;
  if s <> total then raise exception 'shares sum % <> total % (expense %)', s, total, eid; end if;
end $$;

create function tg_expense_balanced() returns trigger language plpgsql as $$
begin perform assert_expense_balanced(new.id); return null; end $$;
create function tg_expense_line_balanced() returns trigger language plpgsql as $$
begin perform assert_expense_balanced(coalesce(new.expense_id, old.expense_id)); return null; end $$;

create constraint trigger expenses_balanced after insert or update on expenses
  deferrable initially deferred for each row execute function tg_expense_balanced();
create constraint trigger expense_payers_balanced after insert or update or delete on expense_payers
  deferrable initially deferred for each row execute function tg_expense_line_balanced();
create constraint trigger expense_shares_balanced after insert or update or delete on expense_shares
  deferrable initially deferred for each row execute function tg_expense_line_balanced();

-- ------------------------------------------------------------- settlements
-- The RECIPIENT confirms. Anyone can claim they paid; only `to_user` can say it arrived.
create table settlements (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references trips(id) on delete cascade,
  from_user    uuid not null,
  to_user      uuid not null,
  currency     char(3) not null,
  amount_minor bigint not null check (amount_minor > 0),
  note         text,
  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references profiles(id),
  reference    text,                          -- optional: UPI ref, bank ref, "cash"
  check (from_user <> to_user),
  check ((confirmed_at is null) = (confirmed_by is null)),
  foreign key (trip_id, from_user) references trip_members(trip_id, user_id),
  foreign key (trip_id, to_user)   references trip_members(trip_id, user_id)
);
create index on settlements (trip_id);

-- Confirmation is a state change only the recipient may make. Enforced here so
-- there is no path — RPC, REST, or otherwise — that lets the sender self-confirm.
create function tg_settlement_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- recording a receipt you yourself received is self-confirming
    if auth.uid() = new.to_user then
      new.confirmed_at := now(); new.confirmed_by := new.to_user;
    else
      new.confirmed_at := null; new.confirmed_by := null;
    end if;
    return new;
  end if;
  if old.confirmed_at is not null then
    raise exception 'confirmed settlements are immutable';
  end if;
  if new.confirmed_at is not null and auth.uid() <> old.to_user then
    raise exception 'only the recipient can confirm a settlement';
  end if;
  -- nothing else about the claim may change on confirm
  if (new.from_user, new.to_user, new.currency, new.amount_minor, new.trip_id)
     is distinct from (old.from_user, old.to_user, old.currency, old.amount_minor, old.trip_id) then
    raise exception 'settlement amounts are immutable';
  end if;
  new.confirmed_by := case when new.confirmed_at is null then null else auth.uid() end;
  return new;
end $$;
create trigger settlement_guard before insert or update on settlements
  for each row execute function tg_settlement_guard();

create function confirm_settlement(sid uuid, ref text default null) returns settlements
language sql security definer set search_path = public as $$
  update settlements set confirmed_at = now(), reference = coalesce(ref, reference)
  where id = sid and to_user = auth.uid() and confirmed_at is null
  returning *;
$$;

-- ------------------------------------------------------------- RLS
-- SECURITY DEFINER helpers: policies on trip_members cannot query trip_members.
create function is_trip_member(t uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = t and user_id = auth.uid());
$$;

create function shares_a_trip(u uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trip_members a join trip_members b using (trip_id)
    where a.user_id = auth.uid() and b.user_id = u);
$$;

create function is_trip_owner(t uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from trip_members
                 where trip_id = t and user_id = auth.uid() and role = 'owner');
$$;

create function can_edit_expense(eid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from expenses e where e.id = eid
                 and (e.created_by = auth.uid() or is_trip_owner(e.trip_id)));
$$;

alter table profiles       enable row level security;
alter table trips          enable row level security;
alter table trip_members   enable row level security;
alter table trip_invites   enable row level security;
alter table expenses       enable row level security;
alter table expense_payers enable row level security;
alter table expense_shares enable row level security;
alter table settlements    enable row level security;

-- profiles: yourself, plus the display name of people you actually travel with.
create policy p_sel on profiles for select using (id = auth.uid() or shares_a_trip(id));
create policy p_ins on profiles for insert with check (id = auth.uid());
create policy p_upd on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- trips
create policy t_sel on trips for select using (is_trip_member(id));
create policy t_ins on trips for insert with check (created_by = auth.uid());
create policy t_upd on trips for update using (is_trip_owner(id)) with check (is_trip_owner(id));
create policy t_del on trips for delete using (is_trip_owner(id));

-- members: owner manages; you may remove yourself. Joining goes through accept_invite.
create policy tm_sel on trip_members for select using (is_trip_member(trip_id));
create policy tm_ins on trip_members for insert with check (is_trip_owner(trip_id));
create policy tm_del on trip_members for delete
  using (is_trip_owner(trip_id) or user_id = auth.uid());

create policy ti_sel on trip_invites for select using (is_trip_member(trip_id));
create policy ti_ins on trip_invites for insert
  with check (is_trip_member(trip_id) and created_by = auth.uid());
create policy ti_del on trip_invites for delete using (is_trip_member(trip_id));

-- expenses: any member may log one, for any combination of members.
-- created_by is taken from the session and cannot be forged.
create policy e_sel on expenses for select using (is_trip_member(trip_id));
create policy e_ins on expenses for insert
  with check (is_trip_member(trip_id) and created_by = auth.uid());
-- editing someone else's entry is a quiet way to change what you owe, so it is
-- the person who logged it, or the trip owner. Widen this if you'd rather.
create policy e_upd on expenses for update
  using (created_by = auth.uid() or is_trip_owner(trip_id))
  with check (is_trip_member(trip_id) and created_by = auth.uid());
create policy e_del on expenses for delete
  using (created_by = auth.uid() or is_trip_owner(trip_id));

-- lines follow the header: anyone in the trip can read them, only the person
-- who logged the expense (or the owner) can change who paid and who owes.
create policy ep_sel on expense_payers for select using (is_trip_member(trip_id));
create policy ep_wri on expense_payers for all
  using (can_edit_expense(expense_id)) with check (can_edit_expense(expense_id));
create policy es_sel on expense_shares for select using (is_trip_member(trip_id));
create policy es_wri on expense_shares for all
  using (can_edit_expense(expense_id)) with check (can_edit_expense(expense_id));

-- settlements: either party may record one; the trigger decides confirmation.
create policy s_sel on settlements for select using (is_trip_member(trip_id));
create policy s_ins on settlements for insert with check (
  is_trip_member(trip_id) and created_by = auth.uid()
  and auth.uid() in (from_user, to_user));
create policy s_upd on settlements for update
  using (auth.uid() = to_user) with check (auth.uid() = to_user);
create policy s_del on settlements for delete
  using (confirmed_at is null and auth.uid() in (from_user, to_user));

-- ------------------------------------------------------------- invites
create function accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv trip_invites;
begin
  select * into inv from trip_invites where token = invite_token;
  if inv is null or inv.expires_at < now() or inv.accepted_at is not null then
    raise exception 'invite is not valid';
  end if;
  if inv.email is not null
     and lower(inv.email) <> (select lower(email) from auth.users where id = auth.uid()) then
    raise exception 'invite is not valid';   -- same message: do not leak who it was for
  end if;
  insert into trip_members (trip_id, user_id) values (inv.trip_id, auth.uid())
    on conflict do nothing;
  update trip_invites set accepted_by = auth.uid(), accepted_at = now()
    where id = inv.id and email is not null;   -- open links stay reusable until expiry
  return inv.trip_id;
end $$;

-- new signup -> profile row; trip creator -> owner membership
create function tg_new_user() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function tg_new_user();

create function tg_trip_owner() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into trip_members (trip_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger on_trip_created after insert on trips
  for each row execute function tg_trip_owner();
