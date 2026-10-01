-- Apply after Vitalia 3. Keeps historical records; new movement entries use data.version=3.
begin;
create or replace function private.movement_number(v jsonb, field text, maximum numeric)
returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
  if coalesce(v->>field,'') !~ '^[0-9]+([.][0-9]+)?$' then return null; end if;
  n:=(v->>field)::numeric;
  if n<0 or n>maximum then return null; end if;
  return n;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end;
$$;

create or replace function private.validate_pillar() returns trigger
language plpgsql security definer set search_path='' as $$
declare today date; v jsonb;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Not authorized' using errcode='42501'; end if;
  today:=private.today_for(new.user_id);
  if new.date<today-29 or new.date>today then raise exception 'Only the last 30 days can be updated' using errcode='22023'; end if;
  if tg_op='UPDATE' and (new.user_id<>old.user_id or new.date<>old.date or new.pillar<>old.pillar) then raise exception 'Cannot move a record'; end if;
  if jsonb_typeof(new.data->'values') is distinct from 'object' then raise exception 'Invalid record format'; end if;
  v:=new.data->'values';
  if new.pillar='actividad' and new.data->>'version'='3' then
    if private.movement_number(v,'steps',100000) is null
      or private.movement_number(v,'cardio_minutes',600) is null
      or coalesce(private.movement_number(v,'intensity',10),0)<1
      or jsonb_typeof(v->'strength') is distinct from 'boolean'
      or length(coalesce(v->>'note',''))>1000 then raise exception 'Invalid pillar values' using errcode='22023'; end if;
    -- A single day cannot store a weekly movement score.
    new.score:=null;
  else
    if new.data->>'version' is distinct from '2' then raise exception 'Invalid record format'; end if;
    new.score:=private.pillar_score(new.pillar,new.data);
    if new.score is null or (coalesce(v->>'bedtime','')<>'' and v->>'bedtime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid pillar values' using errcode='22023'; end if;
  end if;
  return new;
end;
$$;

create or replace function private.weekly_summary(patient uuid, anchor date)
returns jsonb language sql stable set search_path='' as $$
with dates as (
  select anchor-(extract(isodow from anchor)::integer-1) as start
), records as (
  select r.*,private.pillar_values(r.pillar,r.data) as v
  from public.pillar_records r cross join dates d
  where r.user_id=patient and r.date between d.start and anchor
), movement as (
  select round(avg(least(100,private.movement_number(v,'steps',100000)/7500*100))
      filter(where private.movement_number(v,'steps',100000) is not null)) as steps_score,
    sum(private.movement_number(v,'cardio_minutes',600)) as cardio_minutes,
    case when count(*) filter(where jsonb_typeof(v->'strength')='boolean')>0
      then count(*) filter(where v->'strength'='true'::jsonb) else null end as strength_days
  from records where pillar='actividad'
), movement_score as (
  select case when steps_score is not null and cardio_minutes is not null and strength_days is not null
    then round((steps_score+round(least(100,cardio_minutes/150*100))+round(least(100,strength_days::numeric/3*100)))/3)
    else null end as score
  from movement
), pillars as (
  select pillar,round(avg(private.pillar_score(pillar,data))) as score
  from records where pillar<>'actividad' group by pillar
  union all select 'actividad',score from movement_score
)
select jsonb_build_object(
  'score',(select round(avg(score)) from pillars),
  'days',(select count(distinct date) from records),
  'elapsedDays',extract(isodow from anchor)::integer,
  'coverage',(select count(score) from pillars),
  'start',(select start from dates),
  'activity',(select jsonb_build_object('score',s.score,'stepsScore',m.steps_score,'cardioMinutes',m.cardio_minutes,'strengthDays',m.strength_days) from movement m cross join movement_score s)
);
$$;

create or replace function public.vitalia_patient_page_weekly(
  search_text text default '', activity_filter text default 'all', page_offset integer default 0, page_size integer default 10
) returns jsonb language sql stable security definer set search_path='' as $$
with roster as (
  select p.*,private.today_for(p.id) as today from public.profiles p
  join public.doctor_patients r on r.patient_id=p.id
  where r.doctor_id=auth.uid() and private.is_doctor()
), summaries as (
  select to_jsonb(p)-'today' as profile,p.id,p.full_name,p.email,
    last_record.date as last,
    coalesce(last_record.date<=p.today-3,true) as inactive,
    private.weekly_summary(p.id,p.today) as summary
  from roster p left join lateral (
    select max(r.date) as date from public.pillar_records r where r.user_id=p.id and r.date between p.today-29 and p.today
  ) last_record on true
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
revoke all on function private.movement_number(jsonb,text,numeric),private.weekly_summary(uuid,date),private.validate_pillar() from public,anon,authenticated;
revoke all on function public.vitalia_patient_page_weekly(text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.vitalia_patient_page_weekly(text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
