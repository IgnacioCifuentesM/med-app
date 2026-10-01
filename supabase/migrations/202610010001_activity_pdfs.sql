-- Run after Vitalia 3 in the Supabase SQL Editor. Repeatable; preserves existing tasks.
begin;
alter table public.tasks add column if not exists attachment_path text;
alter table public.tasks add column if not exists attachment_name text;
alter table public.tasks add column if not exists attachment_size bigint;
create index if not exists vitalia_tasks_pdf_path on public.tasks(attachment_path) where attachment_path is not null;
alter table public.tasks drop constraint if exists vitalia_task_pdf;
alter table public.tasks add constraint vitalia_task_pdf check (
  (attachment_path is null and attachment_name is null and attachment_size is null)
  or (attachment_path is not null and attachment_name is not null and attachment_size is not null
    and attachment_path = doctor_id::text || '/' || patient_id::text || '/' || id::text || '.pdf'
    and length(trim(attachment_name)) between 1 and 255
    and lower(right(attachment_name,4)) = '.pdf'
    and attachment_size between 1 and 10485760)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('activity-pdfs','activity-pdfs',false,10485760,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];

-- Unattached uploads are visible only to their author. Attached guides follow the care team.
create or replace function private.activity_pdf_access(object_name text, cleanup boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when exists(select 1 from public.tasks t where t.attachment_path=object_name) then
      not cleanup and exists(select 1 from public.tasks t where t.attachment_path=object_name and private.can_access(t.patient_id))
    else private.is_doctor() and split_part(object_name,'/',1)=auth.uid()::text
  end;
$$;
revoke all on function private.activity_pdf_access(text,boolean) from public,anon,authenticated;
grant execute on function private.activity_pdf_access(text,boolean) to authenticated;

drop policy if exists vitalia_pdf_upload on storage.objects;
create policy vitalia_pdf_upload on storage.objects for insert to authenticated with check (
  bucket_id='activity-pdfs' and private.is_doctor()
  and split_part(name,'/',1)=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  and exists(select 1 from public.doctor_patients r
    where r.doctor_id=auth.uid() and r.patient_id::text=split_part(name,'/',2))
);
drop policy if exists vitalia_pdf_read on storage.objects;
create policy vitalia_pdf_read on storage.objects for select to authenticated
using(bucket_id='activity-pdfs' and private.activity_pdf_access(name));
drop policy if exists vitalia_pdf_cleanup on storage.objects;
create policy vitalia_pdf_cleanup on storage.objects for delete to authenticated
using(bucket_id='activity-pdfs' and private.activity_pdf_access(name,true));

-- Restrictive guards also protect this bucket if another app installed broad Storage policies.
drop policy if exists vitalia_pdf_guard_read on storage.objects;
create policy vitalia_pdf_guard_read on storage.objects as restrictive for select to authenticated
using(bucket_id<>'activity-pdfs' or (auth.uid() is not null and private.activity_pdf_access(name)));
drop policy if exists vitalia_pdf_guard_insert on storage.objects;
create policy vitalia_pdf_guard_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'activity-pdfs' or (
  auth.uid() is not null and private.is_doctor() and split_part(name,'/',1)=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
  and exists(select 1 from public.doctor_patients r where r.doctor_id=auth.uid() and r.patient_id::text=split_part(name,'/',2))
));
drop policy if exists vitalia_pdf_guard_update on storage.objects;
create policy vitalia_pdf_guard_update on storage.objects as restrictive for update to authenticated
using(bucket_id<>'activity-pdfs') with check(bucket_id<>'activity-pdfs');
drop policy if exists vitalia_pdf_guard_delete on storage.objects;
create policy vitalia_pdf_guard_delete on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'activity-pdfs' or (auth.uid() is not null and private.activity_pdf_access(name,true)));
drop policy if exists vitalia_pdf_guard_anon on storage.objects;
create policy vitalia_pdf_guard_anon on storage.objects as restrictive for all to anon
using(bucket_id<>'activity-pdfs') with check(bucket_id<>'activity-pdfs');

create or replace function private.check_task_pdf() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.attachment_path is not null and not exists(
    select 1 from storage.objects o where o.bucket_id='activity-pdfs' and o.name=new.attachment_path
  ) then raise exception 'PDF upload missing'; end if;
  return new;
end;
$$;
revoke all on function private.check_task_pdf() from public,anon,authenticated;
drop trigger if exists vitalia_check_task_pdf on public.tasks;
create trigger vitalia_check_task_pdf before insert on public.tasks for each row execute function private.check_task_pdf();
commit;
