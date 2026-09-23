-- Vitalia 3: equipos de salud, consentimiento y validación en servidor.
-- Requiere Vitalia 2. Para copiar/pegar desde cualquier versión usa supabase/INSTALAR_VITALIA.sql.
begin;

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
