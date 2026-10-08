-- VITALIA 3 · Copiar TODO en Supabase > SQL Editor y ejecutar.
-- Instalación/actualización atómica. Conserva datos e historial.
-- No cambia contraseñas ni asigna roles profesionales.
begin;
-- Vitalia 2 · Apply first to a staging Supabase project with a verified backup.
-- Transactional and non-destructive to clinical records. Existing role assignments
-- are preserved and MUST be reviewed: this migration cannot verify credentials.
-- Supports the original app's public tables with UUID identities and numeric scores.

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
  if exists(select 1 from public.pillar_records group by user_id,date,pillar having count(*) > 1) then
    raise exception 'Resolve duplicate daily pillar records before applying Vitalia 2';
  end if;
  if exists(select 1 from public.task_completions group by task_id,completion_date having count(*) > 1) then
    raise exception 'Resolve duplicate task completions before applying Vitalia 2';
  end if;
end $$;
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

-- Vitalia 3: equipos de salud, consentimiento y validación en servidor.
-- Requiere Vitalia 2. Para copiar/pegar desde cualquier versión usa supabase/INSTALAR_VITALIA.sql.

drop index if exists public.vitalia_one_doctor;
-- Older installations may have a UNIQUE(patient_id) constraint with another name.
do $$ declare entry record; begin
  for entry in
    select c.conname from pg_constraint c
    where c.conrelid='public.doctor_patients'::regclass and c.contype='u'
      and c.conkey=array[(select attnum from pg_attribute where attrelid='public.doctor_patients'::regclass and attname='patient_id')]::smallint[]
  loop execute format('alter table public.doctor_patients drop constraint %I',entry.conname); end loop;
end $$;
create unique index if not exists vitalia_doctor_patient_pair on public.doctor_patients(doctor_id,patient_id);

drop policy if exists vitalia_tasks_insert on public.tasks;
create policy vitalia_tasks_insert on public.tasks for insert to authenticated
with check (
  doctor_id=auth.uid() and private.is_doctor()
  and exists(select 1 from public.doctor_patients r where r.doctor_id=auth.uid() and r.patient_id=tasks.patient_id)
  and exists(select 1 from public.profiles p where p.id=tasks.patient_id and p.role='patient')
);

create table if not exists public.sharing_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  doctor_id uuid not null references public.profiles(id),
  text_version text not null,
  accepted_text text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.sharing_consents enable row level security;
revoke all on public.sharing_consents from public,anon,authenticated;
grant select on public.sharing_consents to authenticated;
drop policy if exists vitalia_consents_read on public.sharing_consents;
create policy vitalia_consents_read on public.sharing_consents for select to authenticated using(patient_id=auth.uid());
create unique index if not exists vitalia_open_consent on public.sharing_consents(patient_id,doctor_id) where revoked_at is null;

create table if not exists public.profile_measurements (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  weight numeric, height numeric, body_fat numeric,
  source text not null default 'profile'
);
alter table public.profile_measurements enable row level security;
revoke all on public.profile_measurements from public,anon,authenticated;
grant select on public.profile_measurements to authenticated;
drop policy if exists vitalia_measurements_read on public.profile_measurements;
create policy vitalia_measurements_read on public.profile_measurements for select to authenticated using(private.can_access(patient_id));
create index if not exists vitalia_measurements_patient on public.profile_measurements(patient_id,recorded_at desc);
-- The baseline is dated today; no past measurements are invented.
insert into public.profile_measurements(patient_id,weight,height,body_fat,source)
select p.id,p.weight,p.height,p.body_fat,'baseline' from public.profiles p
where p.role='patient' and (p.weight is not null or p.height is not null or p.body_fat is not null)
and not exists(select 1 from public.profile_measurements m where m.patient_id=p.id);

create or replace function private.capture_measurement() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role='patient' and (new.weight,new.height,new.body_fat) is distinct from (old.weight,old.height,old.body_fat) then
    insert into public.profile_measurements(patient_id,weight,height,body_fat) values(new.id,new.weight,new.height,new.body_fat);
  end if;
  return new;
end $$;
drop trigger if exists vitalia_capture_measurement on public.profiles;
create trigger vitalia_capture_measurement after update on public.profiles for each row execute function private.capture_measurement();

-- Each professional manages only their own indications, even in a shared team.
create or replace function public.vitalia_task_status(target_task uuid, action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task public.tasks; periods jsonb; today date;
begin
  select * into task from public.tasks where id=target_task for update;
  if task.id is null or task.doctor_id is distinct from auth.uid() or not private.is_doctor() or not private.can_access(task.patient_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  if action is null or action not in ('pause','resume','archive') then raise exception 'Invalid action'; end if;
  if task.archived_at is not null then raise exception 'Task already archived'; end if;
  today:=private.today_for(task.patient_id);
  periods:=coalesce(task.active_periods,case when task.active then jsonb_build_array(jsonb_build_object('from',today,'to',null)) else '[]'::jsonb end);
  if action='resume' then
    if task.end_date<today then raise exception 'Task has ended'; end if;
    if not exists(select 1 from jsonb_array_elements(periods) el where el->>'to' is null) then
      periods:=periods||jsonb_build_array(jsonb_build_object('from',greatest(today,task.start_date),'to',null));
    end if;
  else
    select coalesce(jsonb_agg(case when el->>'to' is null then el||jsonb_build_object('to',today) else el end),'[]'::jsonb) into periods from jsonb_array_elements(periods) el;
  end if;
  update public.tasks set active=(action='resume'),active_periods=periods,
    archived_at=case when action='archive' then now() else archived_at end where id=task.id returning * into task;
  return to_jsonb(task);
end $$;

-- Remove the obsolete single-doctor writer so older clients cannot replace a team.
drop function if exists public.vitalia_save_profile(jsonb,uuid,boolean);
create or replace function public.vitalia_save_profile_v3(
  payload jsonb, selected_doctors uuid[] default null, consent_version text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles; result public.profiles; doctor uuid; value numeric; field text; today date;
  selected uuid[]; consent_text constant text := 'Acepto compartir mi perfil, registros de hábitos, mediciones y plan de actividades con los profesionales seleccionados. Puedo retirar su acceso desde mi perfil.';
begin
  select * into me from public.profiles where id=auth.uid() for update;
  if me.id is null then raise exception 'Missing profile' using errcode='42501'; end if;
  if length(trim(coalesce(payload->>'full_name','')))=0 or length(payload->>'full_name')>120 then raise exception 'Invalid name'; end if;
  foreach field in array array['age','weight','height','body_fat'] loop
    value:=(payload->>field)::numeric;
    if value is not null and (value::text in ('NaN','Infinity','-Infinity')
      or (field='age' and (value<1 or value>120 or value<>trunc(value)))
      or (field='weight' and (value<1 or value>500))
      or (field='height' and (value<30 or value>260))
      or (field='body_fat' and (value<1 or value>80))) then raise exception 'Invalid profile values'; end if;
  end loop;
  if selected_doctors is not null then
    if me.role<>'patient' then raise exception 'Only patients can choose doctors' using errcode='42501'; end if;
    if array_position(selected_doctors,null) is not null or cardinality(selected_doctors)>50 then raise exception 'Invalid doctor selection'; end if;
    select coalesce(array_agg(distinct d),'{}'::uuid[]) into selected from unnest(selected_doctors) d;
    if exists(select 1 from unnest(selected) d where not exists(select 1 from public.profiles p where p.id=d and p.role='doctor')) then raise exception 'Doctor unavailable'; end if;
    -- New links and existing links without recorded consent require explicit acceptance.
    if exists(select 1 from unnest(selected) d where not exists(select 1 from public.sharing_consents c where c.patient_id=me.id and c.doctor_id=d and c.revoked_at is null)) and consent_version is distinct from '2026-09-v1' then
      raise exception 'Consent required' using errcode='22023';
    end if;
    today:=private.today_for(me.id);
    update public.tasks t set active=false,
      active_periods=(select coalesce(jsonb_agg(case when el->>'to' is null then el||jsonb_build_object('to',today) else el end),'[]'::jsonb)
        from jsonb_array_elements(coalesce(t.active_periods,jsonb_build_array(jsonb_build_object('from',t.start_date,'to',null)))) el)
      where t.patient_id=me.id and t.active=true and t.doctor_id in
        (select r.doctor_id from public.doctor_patients r where r.patient_id=me.id and not(r.doctor_id=any(selected)));
    update public.sharing_consents set revoked_at=now() where patient_id=me.id and revoked_at is null and not(doctor_id=any(selected));
    delete from public.doctor_patients where patient_id=me.id and not(doctor_id=any(selected));
    foreach doctor in array selected loop
      insert into public.doctor_patients(patient_id,doctor_id) values(me.id,doctor) on conflict(doctor_id,patient_id) do nothing;
      insert into public.sharing_consents(patient_id,doctor_id,text_version,accepted_text)
        select me.id,doctor,'2026-09-v1',consent_text
        where not exists(select 1 from public.sharing_consents c where c.patient_id=me.id and c.doctor_id=doctor and c.revoked_at is null);
    end loop;
  end if;
  update public.profiles set full_name=trim(payload->>'full_name'),age=(payload->>'age')::numeric,
    weight=(payload->>'weight')::numeric,height=(payload->>'height')::numeric,body_fat=(payload->>'body_fat')::numeric,onboarding_done=true
    where id=me.id returning * into result;
  return to_jsonb(result);
end $$;

create or replace function private.pillar_values(pillar text, data jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare keys text[]; result jsonb:='{}'; i integer;
begin
  if jsonb_typeof(data)<>'array' then return coalesce(data->'values',data); end if;
  keys:=case pillar when 'nutricion' then array['portions','quality','water'] when 'actividad' then array['steps','minutes','intensity']
    when 'sueno' then array['hours','quality','bedtime'] when 'sustancias' then array['cigarettes','alcohol']
    when 'estres' then array['stress','minutes'] when 'conexion' then array['connection','minutes'] end;
  if keys is null then return null; end if;
  for i in 1..cardinality(keys) loop result:=result||jsonb_build_object(keys[i],data->(i-1)); end loop;
  return result;
end $$;

create or replace function private.pillar_score(pillar text, data jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare v jsonb:=private.pillar_values(pillar,data); spec jsonb; entry jsonb; n numeric;
begin
  spec:=case pillar
    when 'nutricion' then '[["portions",0,10],["quality",1,10],["water",0,12]]'::jsonb
    when 'actividad' then '[["steps",0,100000],["minutes",0,600],["intensity",1,10]]'::jsonb
    when 'sueno' then '[["hours",0,24],["quality",1,10]]'::jsonb
    when 'sustancias' then '[["cigarettes",0,100],["alcohol",0,30]]'::jsonb
    when 'estres' then '[["stress",1,10],["minutes",0,180]]'::jsonb
    when 'conexion' then '[["connection",1,10],["minutes",0,600]]'::jsonb end;
  if spec is null or jsonb_typeof(v)<>'object' then return null; end if;
  for entry in select * from jsonb_array_elements(spec) loop
    if coalesce(v->>(entry->>0),'') !~ '^[0-9]+([.][0-9]+)?$' then return null; end if;
    n:=(v->>(entry->>0))::numeric;
    if n<(entry->>1)::numeric or n>(entry->>2)::numeric then return null; end if;
  end loop;
  if length(coalesce(v->>'note',''))>1000 then return null; end if;
  return round(case pillar
    when 'nutricion' then (least(100,(v->>'portions')::numeric/5*100)+((v->>'quality')::numeric-1)/9*100)/2
    when 'actividad' then (least(100,(v->>'steps')::numeric/8000*100)+least(100,(v->>'minutes')::numeric/30*100))/2
    when 'sueno' then ((v->>'quality')::numeric-1)/9*100
    when 'sustancias' then (greatest(0,100-(v->>'cigarettes')::numeric/20*100)+greatest(0,100-(v->>'alcohol')::numeric/10*100))/2
    when 'estres' then 100-((v->>'stress')::numeric-1)/9*100
    when 'conexion' then ((v->>'connection')::numeric-1)/9*100 end);
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end $$;

create or replace function private.validate_pillar() returns trigger
language plpgsql security definer set search_path='' as $$
declare today date; v jsonb;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Not authorized' using errcode='42501'; end if;
  today:=private.today_for(new.user_id);
  if new.date<today-29 or new.date>today then raise exception 'Only the last 30 days can be updated' using errcode='22023'; end if;
  if tg_op='UPDATE' and (new.user_id<>old.user_id or new.date<>old.date or new.pillar<>old.pillar) then raise exception 'Cannot move a record'; end if;
  if new.data->>'version' is distinct from '2' or jsonb_typeof(new.data->'values') is distinct from 'object' then raise exception 'Invalid record format'; end if;
  new.score:=private.pillar_score(new.pillar,new.data);
  v:=new.data->'values';
  if new.score is null or (coalesce(v->>'bedtime','')<>'' and v->>'bedtime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid pillar values' using errcode='22023'; end if;
  return new;
end $$;
drop trigger if exists vitalia_validate_pillar on public.pillar_records;
create trigger vitalia_validate_pillar before insert or update on public.pillar_records for each row execute function private.validate_pillar();

create or replace function public.vitalia_patient_page(
  search_text text default '', activity_filter text default 'all', page_offset integer default 0, page_size integer default 10
) returns jsonb language sql stable security definer set search_path='' as $$
with roster as (
  select p.*,private.today_for(p.id) as today from public.profiles p
  join public.doctor_patients r on r.patient_id=p.id
  where r.doctor_id=auth.uid() and private.is_doctor()
), daily as (
  select r.user_id,r.date,round(avg(private.pillar_score(r.pillar,r.data))) as score
  from public.pillar_records r join roster p on p.id=r.user_id
  where r.date between p.today-29 and p.today group by r.user_id,r.date
), summaries as (
  select to_jsonb(p)-'today' as profile,p.id,p.full_name,p.email,
    max(d.date) as last,
    coalesce(max(d.date)<=p.today-3,true) as inactive,
    jsonb_build_object('score',round(avg(d.score) filter(where d.date>=p.today-6)),
      'days',count(d.score) filter(where d.date>=p.today-6)) as summary
  from roster p left join daily d on d.user_id=p.id
  group by p.id,p.full_name,p.email,p.today,to_jsonb(p)
), filtered as (
  select * from summaries
  where translate(lower(full_name||' '||coalesce(email,'')),'áéíóúüñ','aeiouun')
    like '%'||translate(lower(coalesce(search_text,'')),'áéíóúüñ','aeiouun')||'%'
  and (activity_filter='all' or (activity_filter='followup' and inactive) or (activity_filter='active' and not inactive))
), page as (
  select * from filtered order by inactive desc,full_name,id
  limit greatest(1,least(coalesce(page_size,10),50)) offset greatest(0,coalesce(page_offset,0))
)
select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object('profile',profile,'last',last,'inactive',inactive,'summary',summary) order by inactive desc,full_name,id) from page),'[]'::jsonb),
  'total',(select count(*) from filtered),
  'total_patients',(select count(*) from summaries),
  'followup_count',(select count(*) from summaries where inactive));
$$;

create or replace function public.vitalia_status() returns integer
language sql stable security invoker set search_path='' as $$ select 3; $$;

do $$ declare t text; begin
  foreach t in array array['sharing_consents','profile_measurements'] loop
    execute format('drop trigger if exists vitalia_audit on public.%I',t);
    execute format('create trigger vitalia_audit after insert or update or delete on public.%I for each row execute function private.audit_change()',t);
  end loop;
end $$;
revoke all on function private.capture_measurement(),private.pillar_values(text,jsonb),private.pillar_score(text,jsonb),private.validate_pillar() from public,anon,authenticated;
revoke all on function public.vitalia_save_profile_v3(jsonb,uuid[],text),public.vitalia_patient_page(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.vitalia_save_profile_v3(jsonb,uuid[],text),public.vitalia_patient_page(text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';

commit;
