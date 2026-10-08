-- Apply after 202610070001_chat_ranking.sql. Repeatable.
begin;
create table if not exists private.doctor_registration_settings (
  singleton boolean primary key default true check(singleton),
  code_hash bytea not null
);
insert into private.doctor_registration_settings(singleton,code_hash)
  values(true,sha256(convert_to('santa$maria','UTF8'))) on conflict(singleton) do nothing;
create table if not exists private.doctor_signup_approvals (user_id uuid primary key);
revoke all on private.doctor_registration_settings,private.doctor_signup_approvals from public,anon,authenticated;
alter table private.doctor_registration_settings enable row level security;
alter table private.doctor_signup_approvals enable row level security;

create or replace function private.validate_doctor_signup()
returns trigger language plpgsql security definer set search_path='' as $$
declare requested text:=coalesce(new.raw_user_meta_data->>'requested_role','patient');
begin
  if requested not in ('patient','doctor') then
    raise exception 'Invalid registration role' using errcode='22023';
  end if;
  if requested='doctor' then
    if char_length(coalesce(new.raw_user_meta_data->>'doctor_code','')) not between 1 and 100
      or not exists(select 1 from private.doctor_registration_settings
        where code_hash=sha256(convert_to(coalesce(new.raw_user_meta_data->>'doctor_code',''),'UTF8'))) then
      raise exception 'Invalid doctor registration code' using errcode='22023';
    end if;
    insert into private.doctor_signup_approvals(user_id) values(new.id);
  end if;
  -- The code is not retained in Auth metadata, tokens or exported profiles.
  new.raw_user_meta_data:=coalesce(new.raw_user_meta_data,'{}'::jsonb)-'doctor_code';
  return new;
end;
$$;
drop trigger if exists vitalia_validate_doctor_signup on auth.users;
create trigger vitalia_validate_doctor_signup before insert on auth.users
  for each row execute function private.validate_doctor_signup();

create or replace function private.guard_profile_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null and ((tg_op='UPDATE' and new.role is distinct from old.role)
    or (tg_op='INSERT' and new.role<>'patient')) then
    if tg_op='UPDATE' and old.role='patient' and new.role='doctor' then
      delete from private.doctor_signup_approvals where user_id=new.id;
      if found then return new; end if;
    end if;
    raise exception 'Role assignments require an administrator' using errcode='42501';
  end if;
  return new;
end;
$$;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.profiles(id,full_name,email,role,onboarding_done,timezone)
  values(new.id,left(coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),120),
    new.email,'patient',false,'America/Santiago') on conflict(id) do nothing;
  if exists(select 1 from private.doctor_signup_approvals where user_id=new.id) then
    update public.profiles set role='doctor' where id=new.id;
    delete from private.doctor_signup_approvals where user_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_doctor_signup(),private.guard_profile_role(),public.handle_new_user()
  from public,anon,authenticated;

create or replace function public.vitalia_chat_contacts(search_text text default '', page_offset integer default 0)
returns jsonb language sql stable security definer set search_path='' as $$
with contacts as (
  select p.id,p.full_name,p.role,r.patient_id,r.doctor_id,
    (auth.uid()=r.doctor_id and coalesce(last_message.sender_id=r.patient_id,false)) as pending_reply
  from public.doctor_patients r
  join public.profiles p on p.id=case when r.patient_id=auth.uid() then r.doctor_id else r.patient_id end
  left join lateral (
    select m.sender_id from private.chat_messages m where m.patient_id=r.patient_id and m.doctor_id=r.doctor_id
    order by m.seq desc limit 1
  ) last_message on true
  where private.chat_allowed(r.patient_id,r.doctor_id)
    and translate(lower(p.full_name),'áéíóúüñ','aeiouun') like
      '%'||translate(lower(left(coalesce(search_text,''),100)),'áéíóúüñ','aeiouun')||'%'
), page as (
  select * from contacts order by pending_reply desc,full_name,id limit 31 offset greatest(0,coalesce(page_offset,0))
)
select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by pending_reply desc,full_name,id)
  from (select * from page order by pending_reply desc,full_name,id limit 30) p),'[]'::jsonb),
  'has_more',(select count(*)>30 from page));
$$;
revoke all on function public.vitalia_chat_contacts(text,integer) from public,anon,authenticated;
grant execute on function public.vitalia_chat_contacts(text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
