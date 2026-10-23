-- Atendimento confirmado vira cobrança no Financeiro.
--
-- Quando um agendamento passa a CONFIRMED ou COMPLETED, nasce uma parcela em
-- aberto para a cliente com o preço do serviço e vencimento no dia do
-- atendimento (fuso da clínica). A baixa ("recebi, no Pix") usa o fluxo
-- normal do Financeiro. Cancelado ou falta cancela a cobrança ainda em
-- aberto; cobrança paga nunca é tocada. Ficam de fora sessões de contrato
-- assinado (já cobradas pelas parcelas do contrato) e serviços sem preço.

alter table public.financial_entries
  add column appointment_id uuid references public.agenda_appointments (id),
  add constraint financial_entries_appointment_key unique (appointment_id);
create index financial_entries_appointment_idx on public.financial_entries (appointment_id);

create or replace function private.appointment_financial_charge(p_appointment public.agenda_appointments)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service public.agenda_services;
  v_local timestamp;
begin
  if p_appointment.origin is not distinct from 'contract_signature' then
    return;
  end if;
  select * into v_service from public.agenda_services where id = p_appointment.service_id;
  if not found or v_service.price <= 0 then
    return;
  end if;
  v_local := p_appointment.starts_at at time zone coalesce(
    (select timezone from public.tenants where id = p_appointment.tenant_id), 'America/Cuiaba');

  insert into public.financial_entries (
    tenant_id, customer_id, kind, description, category, amount, due_date, appointment_id, created_by
  ) values (
    p_appointment.tenant_id, p_appointment.customer_id, 'INCOME',
    left(v_service.name, 180) || ' · ' || to_char(v_local, 'DD/MM HH24:MI'), 'Atendimentos',
    v_service.price, v_local::date, p_appointment.id, p_appointment.created_by
  )
  on conflict (appointment_id) do update
    -- Reconfirmado depois de uma falta: a cobrança cancelada volta a ficar em aberto.
    set status = 'PENDING', canceled_reason = null
    where public.financial_entries.status = 'CANCELED';
end;
$$;

create or replace function private.sync_appointment_financial_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('CONFIRMED', 'COMPLETED')
    and (tg_op = 'INSERT' or old.status not in ('CONFIRMED', 'COMPLETED')) then
    perform private.appointment_financial_charge(new);
  elsif tg_op = 'UPDATE' and new.status in ('CANCELED', 'NO_SHOW') and old.status is distinct from new.status then
    update public.financial_entries
    set status = 'CANCELED',
        canceled_reason = case when new.status = 'NO_SHOW' then 'Cliente faltou ao atendimento.' else 'Atendimento cancelado.' end
    where appointment_id = new.id and status = 'PENDING';
  end if;
  return new;
end;
$$;

create trigger sync_appointment_financial_charge
  after insert or update of status on public.agenda_appointments
  for each row execute function private.sync_appointment_financial_charge();

revoke all on function private.appointment_financial_charge(public.agenda_appointments),
  private.sync_appointment_financial_charge() from public, anon, authenticated;

-- Agendamentos já confirmados entram agora (concluídos antigos não: provavelmente já foram pagos).
select private.appointment_financial_charge(a)
from public.agenda_appointments a
where a.status = 'CONFIRMED';
