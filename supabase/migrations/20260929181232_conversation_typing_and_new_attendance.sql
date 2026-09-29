-- Presence expires automatically if a worker stops before its cleanup.
alter table public.conversations
  add column ai_typing_until timestamptz,
  add column ai_session_started_at timestamptz;

-- Keep the full customer history, but start a fresh AI context after closure.
create function private.reset_attendance_state()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status then
    new.ai_typing_until := null;
    if old.status = 'CLOSED' then
      new.ai_session_started_at := now();
      new.responsible_user_id := null;
    end if;
    if new.status = 'CLOSED' or old.status = 'CLOSED' then
      delete from public.ai_conversation_states where conversation_id = new.id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.reset_attendance_state() from public, anon, authenticated;
create trigger conversations_reset_attendance
before update of status on public.conversations
for each row execute function private.reset_attendance_state();
