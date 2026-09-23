-- Vitalia 2 · Apply first to a staging Supabase project with a verified backup.
-- Transactional and non-destructive to clinical records. Existing role assignments
-- are preserved and MUST be reviewed: this migration cannot verify credentials.
-- Supports the original app's public tables with UUID identities and numeric scores.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', email text, role text not null default 'patient',
  onboarding_done boolean not null default false, age numeric, sex text, weight numeric,
  height numeric, body_fat numeric, risk_hta boolean default false, risk_dm2 boolean default false,
  risk_dislipidemia boolean default false, timezone text not null default 'America/Santiago'
);
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists timezone text not null default 'America/Santiago';
alter table public.profiles add column if not exists body_fat numeric;
alter table public.profiles add column if not exists onboarding_done boolean not null default false;

create table if not exists public.doctor_patients (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id),
  patient_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.pillar_records (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  date date not null, pillar text not null, data jsonb not null, score numeric,
  created_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), doctor_id uuid not null references public.profiles(id),
  patient_id uuid not null references public.profiles(id), title text not null, description text,
  instructions text, task_type text not null default 'general', frequency text not null default 'daily',
  days_of_week integer[], task_time time, start_date date not null, end_date date,
  active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.tasks add column if not exists active_periods jsonb;
alter table public.tasks add column if not exists archived_at timestamptz;
alter table public.tasks add column if not exists measurement_unit text;
create table if not exists public.task_completions (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id),
  patient_id uuid not null references public.profiles(id), completion_date date not null,
  completed boolean not null default false, completed_at timestamptz
);
alter table public.task_completions add column if not exists note text;
alter table public.task_completions add column if not exists measurement_value numeric;

-- Fail rather than choose/delete conflicting historical records automatically.
do $$ begin
  if exists(select 1 from public.doctor_patients group by patient_id having count(*) > 1) then
    raise exception 'Resolve multiple physician relationships per patient before applying Vitalia 2';
  end if;
  if exists(select 1 from public.pillar_records group by user_id,date,pillar having count(*) > 1) then
    raise exception 'Resolve duplicate daily pillar records before applying Vitalia 2';
  end if;
  if exists(select 1 from public.task_completions group by task_id,completion_date having count(*) > 1) then
    raise exception 'Resolve duplicate task completions before applying Vitalia 2';
  end if;
end $$;
create unique index if not exists vitalia_one_doctor on public.doctor_patients(patient_id);
create unique index if not exists vitalia_daily_pillar on public.pillar_records(user_id,date,pillar);
create unique index if not exists vitalia_daily_completion on public.task_completions(task_id,completion_date);
create index if not exists vitalia_doctor_patients on public.doctor_patients(doctor_id,patient_id);
create index if not exists vitalia_tasks_patient on public.tasks(patient_id,start_date);
create index if not exists vitalia_completions_patient_date on public.task_completions(patient_id,completion_date);

-- Do not invent past pause history. Legacy NULL periods remain explicitly unknown.
create table if not exists private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid, entity text not null, entity_id text, action text not null,
  before_value jsonb, after_value jsonb, occurred_at timestamptz not null default now()
);
revoke all on private.audit_events from public,anon,authenticated;
create or replace function private.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.audit_events(actor_id,entity,entity_id,action,before_value,after_value)
  values(auth.uid(),tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id'),tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if; return new;
end $$;
revoke all on function private.audit_change() from public,anon,authenticated;

create or replace function private.is_doctor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='doctor');
$$;
create or replace function private.can_access(patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid()=patient or (private.is_doctor() and exists(
    select 1 from public.doctor_patients where doctor_id=auth.uid() and patient_id=patient));
$$;
create or replace function private.today_for(person uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.profiles where id=person),'America/Santiago'))::date;
$$;
revoke all on function private.is_doctor(),private.can_access(uuid),private.today_for(uuid) from public,anon,authenticated;
grant execute on function private.is_doctor(),private.can_access(uuid) to authenticated;

-- Remove legacy permissive policies on these tables. RLS policies OR together;
-- adding strict policies while leaving permissive policies would not protect data.
do $$ declare p record; t text; begin
  for t in select unnest(array['profiles','doctor_patients','pillar_records','tasks','task_completions','goals']) loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('revoke all on public.%I from anon, authenticated',t);
      for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
        execute format('drop policy %I on public.%I',p.policyname,t);
      end loop;
    end if;
  end loop;
end $$;
grant select on public.profiles,public.doctor_patients to authenticated;
grant select,insert,update on public.pillar_records,public.task_completions to authenticated;
grant select,insert on public.tasks to authenticated;
create policy vitalia_profiles_read on public.profiles for select to authenticated using (private.can_access(id));
create policy vitalia_relationship_read on public.doctor_patients for select to authenticated
  using (patient_id=auth.uid() or (doctor_id=auth.uid() and private.is_doctor()));
create policy vitalia_pillars_read on public.pillar_records for select to authenticated using (private.can_access(user_id));
create policy vitalia_pillars_insert on public.pillar_records for insert to authenticated with check (user_id=auth.uid());
create policy vitalia_pillars_update on public.pillar_records for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy vitalia_tasks_read on public.tasks for select to authenticated using (private.can_access(patient_id));
create policy vitalia_tasks_insert on public.tasks for insert to authenticated
  with check (doctor_id=auth.uid() and private.is_doctor() and private.can_access(patient_id));
create policy vitalia_completions_read on public.task_completions for select to authenticated using (private.can_access(patient_id));
create policy vitalia_completions_insert on public.task_completions for insert to authenticated
  with check (patient_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and t.patient_id=auth.uid()));
create policy vitalia_completions_update on public.task_completions for update to authenticated
  using (patient_id=auth.uid()) with check (patient_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and t.patient_id=auth.uid()));

create or replace function public.vitalia_status() returns integer
language sql stable security invoker set search_path = '' as $$ select 2; $$;
create or replace function public.vitalia_doctors() returns table(id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.full_name from public.profiles p where p.role='doctor' and auth.uid() is not null order by p.full_name;
$$;
create or replace function public.vitalia_patients() returns setof public.profiles
language sql stable security invoker set search_path = '' as $$
  select p.* from public.profiles p join public.doctor_patients r on r.patient_id=p.id
  where r.doctor_id=auth.uid() and private.is_doctor() order by p.full_name;
$$;

-- A trigger owns profile creation. No browser insert/update permission on profiles.
-- Metadata role is deliberately ignored. Existing trigger conflicts abort the
-- migration/registration rather than granting metadata-based roles.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name,email,role,onboarding_done,timezone)
  values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),120),new.email,'patient',false,'America/Santiago')
  on conflict(id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public,anon,authenticated;

create or replace function public.vitalia_save_profile(payload jsonb, selected_doctor uuid default null, change_doctor boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me public.profiles; result public.profiles; old_doctor uuid; today date;
begin
  select * into me from public.profiles where id=auth.uid() for update;
  if me.id is null then raise exception 'Missing profile' using errcode='42501'; end if;
  if length(trim(coalesce(payload->>'full_name','')))=0 or length(payload->>'full_name')>120 then raise exception 'Invalid name'; end if;
  if (payload->>'age')::numeric not between 1 and 120 or (payload->>'weight')::numeric not between 1 and 500
    or (payload->>'height')::numeric not between 30 and 260 or (payload->>'body_fat')::numeric not between 1 and 80 then raise exception 'Invalid profile values'; end if;
  if change_doctor then
    if me.role <> 'patient' then raise exception 'Only a patient can choose a doctor' using errcode='42501'; end if;
    if selected_doctor is not null and not exists(select 1 from public.profiles where id=selected_doctor and role='doctor') then raise exception 'Doctor unavailable'; end if;
    select doctor_id into old_doctor from public.doctor_patients where patient_id=me.id;
    if old_doctor is distinct from selected_doctor then
      today := private.today_for(me.id);
      -- End the old professional's active plans today, preserving historical access
      -- for the patient. The old professional loses read access immediately.
      update public.tasks set active=false,
        active_periods=(select jsonb_agg(case when el->>'to' is null then el||jsonb_build_object('to',today) else el end)
          from jsonb_array_elements(coalesce(active_periods,jsonb_build_array(jsonb_build_object('from',today,'to',null)))) el)
        where patient_id=me.id and doctor_id=old_doctor and active=true;
      delete from public.doctor_patients where patient_id=me.id;
      if selected_doctor is not null then insert into public.doctor_patients(doctor_id,patient_id) values(selected_doctor,me.id); end if;
    end if;
  end if;
  update public.profiles set full_name=trim(payload->>'full_name'),
    age=(payload->>'age')::numeric,weight=(payload->>'weight')::numeric,
    height=(payload->>'height')::numeric,body_fat=(payload->>'body_fat')::numeric,onboarding_done=true
  where id=me.id returning * into result;
  return to_jsonb(result);
end $$;

create or replace function public.vitalia_task_status(target_task uuid, action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare task public.tasks; periods jsonb; today date;
begin
  select * into task from public.tasks where id=target_task for update;
  if task.id is null or not private.is_doctor() or not private.can_access(task.patient_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if action not in ('pause','resume','archive') then raise exception 'Invalid action'; end if;
  if task.archived_at is not null then raise exception 'Task already archived'; end if;
  today := private.today_for(task.patient_id);
  -- Legacy pause dates cannot be reconstructed. Start known periods today only.
  periods := coalesce(task.active_periods,case when task.active then jsonb_build_array(jsonb_build_object('from',today,'to',null)) else '[]'::jsonb end);
  if action='resume' then
    if task.end_date < today then raise exception 'Task has ended'; end if;
    if not exists(select 1 from jsonb_array_elements(periods) el where el->>'to' is null) then
      periods := periods || jsonb_build_array(jsonb_build_object('from',greatest(today,task.start_date),'to',null));
    end if;
  else
    select coalesce(jsonb_agg(case when el->>'to' is null then el||jsonb_build_object('to',today) else el end),'[]'::jsonb) into periods from jsonb_array_elements(periods) el;
  end if;
  update public.tasks set active=(action='resume'),active_periods=periods,
    archived_at=case when action='archive' then now() else archived_at end
  where id=task.id returning * into task;
  return to_jsonb(task);
end $$;

-- Server validation: a modified browser cannot bypass scheduling or field rules.
create or replace function private.validate_task() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if length(trim(new.title))=0 or length(new.title)>160 or length(new.description)>1000 or length(new.instructions)>1000 then raise exception 'Invalid task text'; end if;
  if new.start_date is null or new.start_date < private.today_for(new.patient_id) or new.end_date < new.start_date then raise exception 'Invalid task dates'; end if;
  if new.task_type not in ('medication','exercise','measurement','appointment','nutrition','general') or new.frequency not in ('daily','weekdays','weekly','once') then raise exception 'Invalid task type/frequency'; end if;
  if new.frequency='weekly' and (coalesce(array_length(new.days_of_week,1),0)=0 or not new.days_of_week <@ array[1,2,3,4,5,6,7]) then raise exception 'Invalid weekdays'; end if;
  if new.task_type='measurement' and length(trim(coalesce(new.measurement_unit,'')))=0 then raise exception 'Measurement unit required'; end if;
  new.active := true; new.archived_at := null;
  new.active_periods := jsonb_build_array(jsonb_build_object('from',new.start_date,'to',null));
  return new;
end $$;
drop trigger if exists vitalia_validate_task on public.tasks;
create trigger vitalia_validate_task before insert on public.tasks for each row execute function private.validate_task();

create or replace function private.validate_completion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare task public.tasks; day_number integer;
begin
  select * into task from public.tasks where id=new.task_id;
  if task.patient_id is distinct from auth.uid() or new.patient_id is distinct from task.patient_id then raise exception 'Not authorized' using errcode='42501'; end if;
  if tg_op='UPDATE' and (new.task_id<>old.task_id or new.patient_id<>old.patient_id or new.completion_date<>old.completion_date) then raise exception 'Cannot move a completion'; end if;
  if new.completion_date <> private.today_for(new.patient_id) then raise exception 'Only today can be updated'; end if;
  if new.completion_date < task.start_date or new.completion_date > task.end_date then raise exception 'Outside schedule'; end if;
  if task.active_periods is null then
    if not task.active or task.archived_at is not null then raise exception 'Inactive task'; end if;
  elsif not exists(select 1 from jsonb_array_elements(task.active_periods) p where new.completion_date >= (p->>'from')::date and (p->>'to' is null or new.completion_date <= (p->>'to')::date)) then raise exception 'Inactive date'; end if;
  day_number := extract(isodow from new.completion_date);
  if (task.frequency='weekdays' and day_number>5) or (task.frequency='weekly' and not day_number=any(task.days_of_week)) or (task.frequency='once' and task.start_date<>new.completion_date) then raise exception 'Not scheduled'; end if;
  if length(new.note)>1000 then raise exception 'Note too long'; end if;
  if new.completed and task.task_type='measurement' and (new.measurement_value is null or new.measurement_value::text in ('NaN','Infinity','-Infinity')) then raise exception 'Measurement required'; end if;
  new.completed_at := case when new.completed then now() else null end;
  return new;
end $$;
drop trigger if exists vitalia_validate_completion on public.task_completions;
create trigger vitalia_validate_completion before insert or update on public.task_completions for each row execute function private.validate_completion();

-- Protect even against other legacy SECURITY DEFINER profile writers accepting a
-- client-provided role. Admin role changes must use a trusted database connection.
create or replace function private.guard_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and ((tg_op='UPDATE' and new.role is distinct from old.role) or (tg_op='INSERT' and new.role<>'patient')) then
    raise exception 'Role assignments require an administrator' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists vitalia_guard_role on public.profiles;
create trigger vitalia_guard_role before insert or update on public.profiles for each row execute function private.guard_profile_role();

do $$ declare t text; begin
  foreach t in array array['profiles','doctor_patients','tasks','task_completions','pillar_records'] loop
    execute format('drop trigger if exists vitalia_audit on public.%I',t);
    execute format('create trigger vitalia_audit after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
  end loop;
end $$;
revoke all on function private.validate_task(),private.validate_completion(),private.guard_profile_role() from public,anon,authenticated;
revoke all on function public.vitalia_status(),public.vitalia_doctors(),public.vitalia_patients(),public.vitalia_save_profile(jsonb,uuid,boolean),public.vitalia_task_status(uuid,text) from public,anon,authenticated;
grant execute on function public.vitalia_status(),public.vitalia_doctors(),public.vitalia_patients(),public.vitalia_save_profile(jsonb,uuid,boolean),public.vitalia_task_status(uuid,text) to authenticated;
commit;
