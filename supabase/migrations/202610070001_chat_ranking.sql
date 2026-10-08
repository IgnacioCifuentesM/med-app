-- Apply after 202610010003_weekly_scores.sql. Repeatable.
begin;
create table if not exists private.chat_messages (
  seq bigint generated always as identity primary key,
  id uuid not null unique,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (sender_id in (patient_id, doctor_id))
);
create index if not exists vitalia_chat_pair on private.chat_messages(patient_id,doctor_id,seq desc);
create index if not exists vitalia_chat_expiry on private.chat_messages(created_at);
create index if not exists vitalia_chat_sender on private.chat_messages(sender_id,created_at desc);
alter table private.chat_messages enable row level security;
revoke all on private.chat_messages from public,anon,authenticated;
revoke all on sequence private.chat_messages_seq_seq from public,anon,authenticated;

create or replace function private.chat_allowed(patient uuid, doctor uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() in (patient,doctor) and exists (
    select 1 from public.doctor_patients r
    join public.profiles p on p.id=r.patient_id and p.role='patient'
    join public.profiles d on d.id=r.doctor_id and d.role='doctor'
    where r.patient_id=patient and r.doctor_id=doctor
  );
$$;

create or replace function private.prune_chat_pair(patient uuid, doctor uuid)
returns void language sql security definer set search_path='' as $$
  delete from private.chat_messages m
  where m.patient_id=patient and m.doctor_id=doctor
    and m.created_at < now()-interval '72 hours'
    and m.seq not in (select x.seq from private.chat_messages x
      where x.patient_id=patient and x.doctor_id=doctor order by x.seq desc limit 2);
$$;

create or replace function private.prune_chat()
returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
  delete from private.chat_messages m
  where m.created_at < now()-interval '72 hours'
    and m.seq not in (select x.seq from private.chat_messages x
      where x.patient_id=m.patient_id and x.doctor_id=m.doctor_id order by x.seq desc limit 2);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create or replace function private.chat_unlink()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from private.chat_messages where patient_id=old.patient_id and doctor_id=old.doctor_id;
  return old;
end;
$$;
drop trigger if exists vitalia_chat_unlink on public.doctor_patients;
create trigger vitalia_chat_unlink after delete on public.doctor_patients
  for each row execute function private.chat_unlink();

create or replace function public.vitalia_chat_contacts(search_text text default '', page_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
with contacts as (
  select p.id,p.full_name,p.role,r.patient_id,r.doctor_id
  from public.doctor_patients r
  join public.profiles p on p.id=case when r.patient_id=auth.uid() then r.doctor_id else r.patient_id end
  where private.chat_allowed(r.patient_id,r.doctor_id)
    and translate(lower(p.full_name),'áéíóúüñ','aeiouun') like
      '%'||translate(lower(left(coalesce(search_text,''),100)),'áéíóúüñ','aeiouun')||'%'
), page as (
  select * from contacts order by full_name,id limit 31 offset greatest(0,coalesce(page_offset,0))
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by full_name,id)
  from (select * from page order by full_name,id limit 30) p),'[]'::jsonb),
  'has_more',(select count(*)>30 from page));
$$;

create or replace function public.vitalia_chat_messages(patient uuid, doctor uuid, before_seq bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not coalesce(private.chat_allowed(patient,doctor),false) then
    raise exception 'Chat not authorized' using errcode='42501';
  end if;
  perform private.prune_chat_pair(patient,doctor);
  with page as (
    select * from private.chat_messages where patient_id=patient and doctor_id=doctor
      and (before_seq is null or seq<before_seq) order by seq desc limit 51
  ), shown as (select * from page order by seq desc limit 50)
  select jsonb_build_object('items',coalesce((select jsonb_agg(
    jsonb_build_object('id',id,'seq',seq::text,'sender_id',sender_id,'body',body,'created_at',created_at)
    order by seq) from shown),'[]'::jsonb),'has_more',(select count(*)>50 from page)) into result;
  return result;
end;
$$;

create or replace function public.vitalia_send_chat(patient uuid, doctor uuid, message_id uuid, message_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved private.chat_messages; clean text:=btrim(message_body);
begin
  -- Serializes sends from the same user for rate limiting and duplicate retries.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  -- Keep the relationship locked until the send commits, including concurrent unlink.
  perform 1 from public.doctor_patients where patient_id=patient and doctor_id=doctor for key share;
  if not coalesce(private.chat_allowed(patient,doctor),false) then
    raise exception 'Chat not authorized' using errcode='42501';
  end if;
  if message_id is null or clean is null or char_length(clean) not between 1 and 2000 then
    raise exception 'Invalid chat message' using errcode='22023';
  end if;
  select * into saved from private.chat_messages where id=message_id;
  if found then
    if saved.sender_id<>auth.uid() or saved.patient_id<>patient or saved.doctor_id<>doctor or saved.body<>clean then
      raise exception 'Chat not authorized' using errcode='42501';
    end if;
  else
    if (select count(*) from private.chat_messages where sender_id=auth.uid()
      and created_at>=now()-interval '1 minute')>=10
      or (select count(*) from private.chat_messages where sender_id=auth.uid()
        and created_at>=now()-interval '24 hours')>=200 then
      raise exception 'Chat rate limit exceeded' using errcode='22023';
    end if;
    insert into private.chat_messages(id,patient_id,doctor_id,sender_id,body)
      values(message_id,patient,doctor,auth.uid(),clean) returning * into saved;
  end if;
  perform private.prune_chat_pair(patient,doctor);
  return jsonb_build_object('id',saved.id,'seq',saved.seq::text,'sender_id',saved.sender_id,
    'body',saved.body,'created_at',saved.created_at);
end;
$$;

create or replace function public.vitalia_my_weekly_rank()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare anchor date:=private.today_for(auth.uid()); result jsonb;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='patient') then
    raise exception 'Ranking not authorized' using errcode='42501';
  end if;
  -- Everyone is compared over the same calendar dates, using the caller's current week.
  with scores as (
    select p.id,(private.weekly_summary(p.id,anchor)->>'score')::integer as score
    from public.profiles p where p.role='patient'
  ), ranked as (
    select id,score,rank() over(order by score desc) as position,
      count(*) over(partition by score)>1 as tied from scores where score is not null
  ) select jsonb_build_object('position',position,'score',score,'tied',tied) into result
    from ranked where id=auth.uid();
  return coalesce(result,jsonb_build_object('position',null,'score',null,'tied',false))
    || jsonb_build_object('start',anchor-(extract(isodow from anchor)::integer-1),
      'end',anchor-(extract(isodow from anchor)::integer-1)+6);
end;
$$;
revoke all on function private.chat_allowed(uuid,uuid),private.prune_chat_pair(uuid,uuid),
  private.prune_chat(),private.chat_unlink() from public,anon,authenticated;
revoke all on function public.vitalia_chat_contacts(text,integer),public.vitalia_chat_messages(uuid,uuid,bigint),
  public.vitalia_send_chat(uuid,uuid,uuid,text),public.vitalia_my_weekly_rank() from public,anon,authenticated;
grant execute on function public.vitalia_chat_contacts(text,integer),public.vitalia_chat_messages(uuid,uuid,bigint),
  public.vitalia_send_chat(uuid,uuid,uuid,text),public.vitalia_my_weekly_rank() to authenticated;
-- No chat bodies are copied into the historical audit log.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('vitalia-chat-retention','0 * * * *','select private.prune_chat();');
  else
    raise notice 'Run supabase/ACTIVAR_LIMPIEZA_CHAT.sql to enable hourly cleanup.';
  end if;
end $$;
notify pgrst,'reload schema';
commit;
