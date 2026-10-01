-- Run after Vitalia 3. Repeatable; no changes to pillar scores.
begin;
create table if not exists public.daily_energy (
  patient_id uuid not null references public.profiles(id),
  date date not null,
  value smallint not null check (value between 0 and 10),
  primary key(patient_id,date)
);
alter table public.daily_energy enable row level security;
revoke all on public.daily_energy from public,anon,authenticated;
grant select,insert,update on public.daily_energy to authenticated;
drop policy if exists vitalia_energy_read on public.daily_energy;
create policy vitalia_energy_read on public.daily_energy for select to authenticated using(private.can_access(patient_id));
drop policy if exists vitalia_energy_insert on public.daily_energy;
create policy vitalia_energy_insert on public.daily_energy for insert to authenticated with check(patient_id=auth.uid());
drop policy if exists vitalia_energy_update on public.daily_energy;
create policy vitalia_energy_update on public.daily_energy for update to authenticated using(patient_id=auth.uid()) with check(patient_id=auth.uid());
create or replace function private.check_energy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=new.patient_id and role='patient')
    or new.date not between private.today_for(new.patient_id)-29 and private.today_for(new.patient_id)
    then raise exception 'Only the last 30 days'; end if;
  if tg_op='UPDATE' and (new.patient_id,new.date) is distinct from (old.patient_id,old.date)
    then raise exception 'Invalid energy record'; end if;
  return new;
end;
$$;
revoke all on function private.check_energy() from public,anon,authenticated;
drop trigger if exists vitalia_check_energy on public.daily_energy;
create trigger vitalia_check_energy before insert or update on public.daily_energy for each row execute function private.check_energy();

create table if not exists public.education_posts (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id),
  week_start date not null check(extract(isodow from week_start)=1),
  pillar text not null check(pillar in ('nutricion','actividad','sueno','sustancias','estres','conexion')),
  title text not null check(length(trim(title)) between 1 and 160),
  content text not null check(length(trim(content)) between 1 and 12000),
  published boolean not null default false,
  unique(doctor_id,pillar,week_start)
);
alter table public.education_posts enable row level security;
revoke all on public.education_posts from public,anon,authenticated;
grant select,insert,update on public.education_posts to authenticated;
drop policy if exists vitalia_education_read on public.education_posts;
create policy vitalia_education_read on public.education_posts for select to authenticated using (
  (doctor_id=auth.uid() and private.is_doctor())
  or (published and week_start <= (select (now() at time zone p.timezone)::date from public.profiles p where p.id=auth.uid())
    and exists(select 1 from public.doctor_patients r where r.patient_id=auth.uid() and r.doctor_id=education_posts.doctor_id))
);
drop policy if exists vitalia_education_insert on public.education_posts;
create policy vitalia_education_insert on public.education_posts for insert to authenticated with check(doctor_id=auth.uid() and private.is_doctor());
drop policy if exists vitalia_education_update on public.education_posts;
create policy vitalia_education_update on public.education_posts for update to authenticated using(doctor_id=auth.uid() and private.is_doctor()) with check(doctor_id=auth.uid() and private.is_doctor());
commit;
