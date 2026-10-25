-- Financeiro da clínica, fase 4: relatório do período.
--
-- Tudo pelo regime de caixa (dia do pagamento), exceto a inadimplência, que
-- olha o que venceu no período até ontem e quanto disso continua em aberto.
-- Procedimento: atendimento da agenda usa o nome do serviço; parcela de
-- contrato e lançamento manual usam a descrição (nome do pacote/procedimento).

create or replace function public.financial_report(p_tenant_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_due_until date;
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + interval '5 years' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_today := private.tenant_today(p_tenant_id);
  v_due_until := least(p_to, v_today - 1);

  return jsonb_build_object(
    'income', (
      select coalesce(sum(amount), 0) from public.financial_entries
      where tenant_id = p_tenant_id and kind = 'INCOME' and status = 'PAID' and paid_at between p_from and p_to
    ),
    'expense', (
      select coalesce(sum(amount), 0) from public.financial_entries
      where tenant_id = p_tenant_id and kind = 'EXPENSE' and status = 'PAID' and paid_at between p_from and p_to
    ),
    'by_procedure', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'count', count) order by amount desc, label), '[]'::jsonb)
      from (
        select coalesce(s.name, e.description) as label, sum(e.amount) as amount, count(*) as count
        from public.financial_entries e
        left join public.agenda_appointments a on a.id = e.appointment_id
        left join public.agenda_services s on s.id = a.service_id
        where e.tenant_id = p_tenant_id and e.kind = 'INCOME' and e.status = 'PAID' and e.paid_at between p_from and p_to
        group by 1
      ) grouped
    ),
    'by_method', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'count', count) order by amount desc, label), '[]'::jsonb)
      from (
        select coalesce(nullif(btrim(payment_method), ''), 'Não informado') as label, sum(amount) as amount, count(*) as count
        from public.financial_entries
        where tenant_id = p_tenant_id and kind = 'INCOME' and status = 'PAID' and paid_at between p_from and p_to
        group by 1
      ) grouped
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'amount', amount, 'count', count) order by amount desc, label), '[]'::jsonb)
      from (
        select coalesce(nullif(btrim(category), ''), 'Sem categoria') as label, sum(amount) as amount, count(*) as count
        from public.financial_entries
        where tenant_id = p_tenant_id and kind = 'EXPENSE' and status = 'PAID' and paid_at between p_from and p_to
        group by 1
      ) grouped
    ),
    'delinquency', (
      select jsonb_build_object(
        'due', coalesce(sum(amount), 0),
        'overdue', coalesce(sum(amount) filter (where status = 'PENDING'), 0),
        'overdue_count', count(*) filter (where status = 'PENDING')
      )
      from public.financial_entries
      where tenant_id = p_tenant_id and kind = 'INCOME' and status <> 'CANCELED'
        and due_date between p_from and v_due_until
    )
  );
end;
$$;

revoke all on function public.financial_report(uuid, date, date) from public, anon;
grant execute on function public.financial_report(uuid, date, date) to authenticated;
