-- Execute in Supabase SQL Editor as administrator AFTER the chat migration.
-- Mandatory: hourly cleanup also runs while nobody opens the app.
create extension if not exists pg_cron;
select cron.schedule('vitalia-chat-retention','0 * * * *','select private.prune_chat();');
select jobid,jobname,schedule,active from cron.job where jobname='vitalia-chat-retention';
