-- Financeiro da clínica, fase 3: despesas, despesas fixas e fluxo de caixa.
--
-- Despesas usam a mesma financial_entries (kind = 'EXPENSE', sem cliente), com
-- as mesmas RPCs de editar/dar baixa/estornar/cancelar. Despesa fixa (aluguel,
-- luz) é um modelo em financial_recurring_expenses: vira uma parcela por mês,
-- criada de forma idempotente até o fim do mês seguinte — na criação e pela
-- varredura do serviço de jobs. Meses mais distantes só aparecem como
-- projeção no fluxo de caixa, sem gravar nada.

create table public.financial_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 2 and 200),
  category text check (category is null or char_length(btrim(category)) between 1 and 60),
  amount numeric(12, 2) not null check (amount > 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  starts_on date not null check (extract(day from starts_on) = 1),
  ends_on date check (ends_on is null or ends_on >= starts_on),
  payment_method text check (payment_method is null or char_length(btrim(payment_method)) between 1 and 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_recurring_expenses_tenant_idx on public.financial_recurring_expenses (tenant_id);
create index financial_recurring_expenses_created_by_idx on public.financial_recurring_expenses (created_by);

create trigger financial_recurring_expenses_set_updated_at before update on public.financial_recurring_expenses
  for each row execute function private.set_updated_at();

alter table public.financial_recurring_expenses enable row level security;
create policy financial_recurring_expenses_select on public.financial_recurring_expenses for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('financial.read')));
revoke all on public.financial_recurring_expenses from public, anon, authenticated;
grant select on public.financial_recurring_expenses to authenticated;
grant select, insert, update on public.financial_recurring_expenses to service_role;

alter table public.financial_entries
  add column recurring_id uuid references public.financial_recurring_expenses (id),
  add constraint financial_entries_recurring_due_key unique (recurring_id, due_date),
  add constraint financial_entries_expense_customer_check check (kind = 'INCOME' or customer_id is null);
create index financial_entries_recurring_idx on public.financial_entries (recurring_id);
create index financial_entries_tenant_paid_idx on public.financial_entries (tenant_id, paid_at) where status = 'PAID';

-- -----------------------------------------------------------------------------
-- Parcelamento compartilhado por receitas e despesas
-- -----------------------------------------------------------------------------

-- Divide um total em N parcelas mensais; centavos que sobram vão na 1ª.
create or replace function private.insert_financial_installments(
  p_tenant_id uuid,
  p_kind text,
  p_customer_id uuid,
  p_description text,
  p_category text,
  p_total numeric,
  p_first_due_date date,
  p_installments integer,
  p_payment_method text,
  p_notes text,
  p_created_by uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cents bigint;
  v_base bigint;
  i integer;
begin
  if p_total is null or p_total <= 0 or p_total <> round(p_total, 2) or p_total >= 10000000000
    or p_installments is null or p_installments not between 1 and 120 or p_first_due_date is null
    or char_length(btrim(coalesce(p_description, ''))) not between 2 and 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_cents := (p_total * 100)::bigint;
  v_base := v_cents / p_installments;
  if v_base = 0 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'installments';
  end if;

  for i in 1..p_installments loop
    insert into public.financial_entries (
      tenant_id, customer_id, kind, description, category, amount, due_date,
      installment_number, installment_count, payment_method, notes, created_by
    ) values (
      p_tenant_id, p_customer_id, p_kind, btrim(p_description), nullif(btrim(coalesce(p_category, '')), ''),
      (case when i = 1 then v_base + v_cents % p_installments else v_base end)::numeric / 100,
      (p_first_due_date + make_interval(months => i - 1))::date, i, p_installments,
      nullif(btrim(coalesce(p_payment_method, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), p_created_by
    );
  end loop;
  return p_installments;
end;
$$;

create or replace function public.financial_entry_create(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_description text,
  p_total numeric,
  p_first_due_date date,
  p_installments integer default 1,
  p_payment_method text default null,
  p_category text default null,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_count integer;
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and tenant_id = p_tenant_id
  ) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'customer_id';
  end if;

  v_count := private.insert_financial_installments(p_tenant_id, 'INCOME', p_customer_id, p_description, p_category,
    p_total, p_first_due_date, p_installments, p_payment_method, p_notes, v_uid);

  if p_customer_id is not null then
    perform private.log_timeline_event(p_tenant_id, p_customer_id, 'financial.entry_created',
      jsonb_build_object('description', btrim(p_description), 'total', p_total, 'installments', p_installments));
  end if;
  return v_count;
end;
$$;

create or replace function public.financial_expense_create(
  p_tenant_id uuid,
  p_description text,
  p_total numeric,
  p_first_due_date date,
  p_installments integer default 1,
  p_category text default null,
  p_payment_method text default null,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.insert_financial_installments(p_tenant_id, 'EXPENSE', null, p_description, p_category,
    p_total, p_first_due_date, p_installments, p_payment_method, p_notes, v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- Despesas fixas
-- -----------------------------------------------------------------------------

-- Dia de vencimento dentro do mês, limitado ao último dia (31 em fevereiro = 28/29).
create or replace function private.recurring_due_date(p_month date, p_day integer)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_month)::date
    + (least(p_day, extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer) - 1))::date;
$$;

-- Cria as parcelas da despesa fixa de starts_on até p_until (inclusive), sem duplicar.
create or replace function private.materialize_recurring_expense(p_recurring_id uuid, p_until date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recurring public.financial_recurring_expenses;
  v_month date;
  v_inserted integer := 0;
  v_rows integer;
begin
  select * into v_recurring from public.financial_recurring_expenses where id = p_recurring_id for update;
  if not found then
    return 0;
  end if;
  for v_month in
    select generate_series(v_recurring.starts_on, date_trunc('month', least(p_until, coalesce(v_recurring.ends_on, p_until)))::date,
      interval '1 month')::date
  loop
    insert into public.financial_entries (
      tenant_id, kind, description, category, amount, due_date, payment_method, recurring_id, created_by
    ) values (
      v_recurring.tenant_id, 'EXPENSE', v_recurring.description, v_recurring.category, v_recurring.amount,
      private.recurring_due_date(v_month, v_recurring.day_of_month), v_recurring.payment_method, v_recurring.id,
      v_recurring.created_by
    )
    on conflict (recurring_id, due_date) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;
  return v_inserted;
end;
$$;

-- Hoje no fuso da clínica.
create or replace function private.tenant_today(p_tenant_id uuid)
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone coalesce((select timezone from public.tenants where id = p_tenant_id), 'America/Cuiaba'))::date;
$$;

create or replace function public.financial_recurring_create(
  p_tenant_id uuid,
  p_description text,
  p_amount numeric,
  p_day_of_month integer,
  p_first_month date,
  p_category text default null,
  p_payment_method text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_user();
  v_id uuid;
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount >= 10000000000
    or p_day_of_month is null or p_day_of_month not between 1 and 31 or p_first_month is null
    or char_length(btrim(coalesce(p_description, ''))) not between 2 and 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.financial_recurring_expenses (
    tenant_id, description, category, amount, day_of_month, starts_on, payment_method, created_by
  ) values (
    p_tenant_id, btrim(p_description), nullif(btrim(coalesce(p_category, '')), ''), p_amount, p_day_of_month,
    date_trunc('month', p_first_month)::date, nullif(btrim(coalesce(p_payment_method, '')), ''), v_uid
  )
  returning id into v_id;

  perform private.materialize_recurring_expense(v_id,
    (date_trunc('month', private.tenant_today(p_tenant_id)) + interval '2 months - 1 day')::date);
  return v_id;
end;
$$;

-- Encerra a despesa fixa no mês atual: parcelas futuras ainda em aberto são canceladas.
create or replace function public.financial_recurring_end(p_recurring_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recurring public.financial_recurring_expenses;
  v_today date;
begin
  perform private.require_user();
  select * into v_recurring from public.financial_recurring_expenses where id = p_recurring_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'recurring_id';
  end if;
  if not private.has_tenant_permission(v_recurring.tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_today := private.tenant_today(v_recurring.tenant_id);
  update public.financial_recurring_expenses
  set ends_on = greatest(starts_on, date_trunc('month', v_today)::date)
  where id = p_recurring_id and (ends_on is null or ends_on > date_trunc('month', v_today)::date);
  update public.financial_entries
  set status = 'CANCELED', canceled_reason = 'Despesa fixa encerrada.'
  where recurring_id = p_recurring_id and status = 'PENDING'
    and due_date >= (date_trunc('month', v_today) + interval '1 month')::date;
end;
$$;

-- Caminho de job (service_role): mantém as despesas fixas criadas até o fim do mês seguinte.
create or replace function public.financial_recurring_materialize_sweep()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recurring record;
  v_total integer := 0;
begin
  if (select auth.uid()) is not null then
    raise exception 'forbidden' using errcode = '42501', detail = 'service_only';
  end if;
  for v_recurring in
    select id, tenant_id from public.financial_recurring_expenses
    where ends_on is null or ends_on >= date_trunc('month', private.tenant_today(tenant_id))::date
  loop
    v_total := v_total + private.materialize_recurring_expense(v_recurring.id,
      (date_trunc('month', private.tenant_today(v_recurring.tenant_id)) + interval '2 months - 1 day')::date);
  end loop;
  return v_total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fluxo de caixa por mês: realizado (pagamentos) e em aberto (vencimentos),
-- mais a projeção das despesas fixas nos meses ainda não criados.
-- -----------------------------------------------------------------------------

create or replace function public.financial_cash_flow(p_tenant_id uuid, p_from date, p_to date)
returns table (
  month date,
  income_paid numeric,
  expense_paid numeric,
  income_open numeric,
  expense_open numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.read') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + interval '5 years' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  return query
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  ),
  paid as (
    select date_trunc('month', e.paid_at)::date as month,
      sum(e.amount) filter (where e.kind = 'INCOME') as income,
      sum(e.amount) filter (where e.kind = 'EXPENSE') as expense
    from public.financial_entries e
    where e.tenant_id = p_tenant_id and e.status = 'PAID' and e.paid_at between date_trunc('month', p_from)::date and p_to
    group by 1
  ),
  pending as (
    select date_trunc('month', e.due_date)::date as month,
      sum(e.amount) filter (where e.kind = 'INCOME') as income,
      sum(e.amount) filter (where e.kind = 'EXPENSE') as expense
    from public.financial_entries e
    where e.tenant_id = p_tenant_id and e.status = 'PENDING' and e.due_date between date_trunc('month', p_from)::date and p_to
    group by 1
  ),
  projected as (
    select m.month, sum(r.amount) as expense
    from months m
    join public.financial_recurring_expenses r
      on r.tenant_id = p_tenant_id and r.starts_on <= m.month and (r.ends_on is null or r.ends_on >= m.month)
    where not exists (
      select 1 from public.financial_entries e
      where e.recurring_id = r.id and date_trunc('month', e.due_date)::date = m.month
    )
    group by m.month
  )
  select m.month,
    coalesce(paid.income, 0)::numeric,
    coalesce(paid.expense, 0)::numeric,
    coalesce(pending.income, 0)::numeric,
    (coalesce(pending.expense, 0) + coalesce(projected.expense, 0))::numeric
  from months m
  left join paid on paid.month = m.month
  left join pending on pending.month = m.month
  left join projected on projected.month = m.month
  order by m.month;
end;
$$;

revoke all on function private.insert_financial_installments(uuid, text, uuid, text, text, numeric, date, integer, text, text, uuid),
  private.recurring_due_date(date, integer), private.materialize_recurring_expense(uuid, date), private.tenant_today(uuid)
  from public, anon, authenticated;
revoke all on function public.financial_expense_create(uuid, text, numeric, date, integer, text, text, text) from public, anon;
revoke all on function public.financial_recurring_create(uuid, text, numeric, integer, date, text, text) from public, anon;
revoke all on function public.financial_recurring_end(uuid) from public, anon;
revoke all on function public.financial_recurring_materialize_sweep() from public, anon, authenticated;
revoke all on function public.financial_cash_flow(uuid, date, date) from public, anon;
grant execute on function public.financial_expense_create(uuid, text, numeric, date, integer, text, text, text) to authenticated;
grant execute on function public.financial_recurring_create(uuid, text, numeric, integer, date, text, text) to authenticated;
grant execute on function public.financial_recurring_end(uuid) to authenticated;
grant execute on function public.financial_recurring_materialize_sweep() to service_role;
grant execute on function public.financial_cash_flow(uuid, date, date) to authenticated;
