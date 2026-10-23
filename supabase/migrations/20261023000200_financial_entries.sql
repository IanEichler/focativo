-- Financeiro da clínica, fase 1: contas a receber por cliente.
--
-- Cada linha é uma parcela (ou um lançamento avulso). Nasce de duas formas:
--   1. contrato assinado: o plano de pagamento fica congelado no snapshot da
--      assinatura (contract_signatures.payment_plan) e vira parcelas quando o
--      status muda para SIGNED — gerar o contrato de novo nunca duplica nada;
--   2. lançamento manual pela equipe (sessão avulsa, contrato antigo, ajuste).
-- Já aceita saídas (kind = 'EXPENSE') para a fase de despesas. Parcela paga
-- nunca é apagada: o caminho é estornar (volta a pendente) ou cancelar.

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid,
  signature_id uuid references public.contract_signatures (id),
  kind text not null default 'INCOME' check (kind in ('INCOME', 'EXPENSE')),
  description text not null check (char_length(btrim(description)) between 2 and 200),
  category text check (category is null or char_length(btrim(category)) between 1 and 60),
  amount numeric(12, 2) not null check (amount > 0),
  due_date date not null,
  installment_number integer not null default 1 check (installment_number between 1 and 120),
  installment_count integer not null default 1 check (installment_count between 1 and 120),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELED')),
  payment_method text check (payment_method is null or char_length(btrim(payment_method)) between 1 and 200),
  paid_at date,
  notes text check (notes is null or char_length(notes) <= 1000),
  canceled_reason text check (canceled_reason is null or char_length(canceled_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_entries_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete restrict,
  constraint financial_entries_installment_check check (installment_number <= installment_count),
  constraint financial_entries_paid_check check ((status = 'PAID') = (paid_at is not null)),
  constraint financial_entries_signature_installment_key unique (signature_id, installment_number)
);

create index financial_entries_tenant_due_idx on public.financial_entries (tenant_id, due_date);
create index financial_entries_customer_idx on public.financial_entries (customer_id, due_date);
create index financial_entries_signature_idx on public.financial_entries (signature_id);
create index financial_entries_created_by_idx on public.financial_entries (created_by);

create trigger financial_entries_set_updated_at before update on public.financial_entries
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Permissões: financial.read já existe (OWNER, ADMIN, GERENTE)
-- -----------------------------------------------------------------------------

insert into public.permissions (code, module, description) values
  ('financial.write', 'financial', 'Lançar parcelas, dar baixa, estornar e cancelar no financeiro');

insert into public.role_permissions (role_code, permission_code)
select r.code, 'financial.write' from public.roles r where r.code in ('OWNER', 'ADMIN', 'GERENTE');

-- -----------------------------------------------------------------------------
-- RLS: leitura direta; toda escrita passa pelas RPCs abaixo
-- -----------------------------------------------------------------------------

alter table public.financial_entries enable row level security;

create policy financial_entries_select on public.financial_entries for select to authenticated
  using (tenant_id in (select private.readable_tenant_ids_with_permission('financial.read')));

revoke all on public.financial_entries from public, anon, authenticated;
grant select on public.financial_entries to authenticated;
grant select, insert, update on public.financial_entries to service_role;

-- -----------------------------------------------------------------------------
-- Plano de pagamento do contrato: validado na criação do snapshot (para que o
-- gatilho de assinatura nunca falhe) e imutável depois, como o session_plan.
-- -----------------------------------------------------------------------------

alter table public.contract_signatures add column payment_plan jsonb not null default '[]'::jsonb
  check (jsonb_typeof(payment_plan) = 'array' and jsonb_array_length(payment_plan) <= 120);

create function private.validate_contract_payment_plan() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_item jsonb;
  v_count integer := jsonb_array_length(new.payment_plan);
  v_index integer := 0;
begin
  if tg_op = 'UPDATE' then
    if new.payment_plan is distinct from old.payment_plan then
      raise exception 'signature_snapshot_immutable';
    end if;
    return new;
  end if;
  for v_item in select value from jsonb_array_elements(new.payment_plan) loop
    v_index := v_index + 1;
    if jsonb_typeof(v_item) <> 'object'
      or (v_item->>'number') is distinct from v_index::text
      or (v_item->>'count') is distinct from v_count::text
      or coalesce(v_item->>'dueDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(v_item->>'amount', '') !~ '^\d{1,10}(\.\d{1,2})?$'
      or (v_item->>'amount')::numeric <= 0
      or char_length(btrim(coalesce(v_item->>'description', ''))) not between 2 and 200
      or char_length(coalesce(v_item->>'paymentMethod', '')) > 200
    then
      raise exception 'invalid_payment_plan' using errcode = '22023';
    end if;
    perform (v_item->>'dueDate')::date;
  end loop;
  return new;
end $$;

create trigger validate_contract_payment_plan before insert or update on public.contract_signatures
  for each row execute function private.validate_contract_payment_plan();

-- security definer: quem assina é o serviço de assinatura (service_role), que não
-- escreve na timeline por conta própria. Uma falha aqui travaria a assinatura.
create function private.post_signed_contract_payments() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_item jsonb;
begin
  if new.status = 'SIGNED' and old.status <> 'SIGNED' then
    for v_item in select value from jsonb_array_elements(new.payment_plan) loop
      insert into public.financial_entries (
        tenant_id, customer_id, signature_id, kind, description, category, amount, due_date,
        installment_number, installment_count, payment_method, created_by
      ) values (
        new.tenant_id, new.customer_id, new.id, 'INCOME', btrim(v_item->>'description'), 'Contratos',
        (v_item->>'amount')::numeric, (v_item->>'dueDate')::date,
        (v_item->>'number')::integer, (v_item->>'count')::integer,
        nullif(btrim(coalesce(v_item->>'paymentMethod', '')), ''), new.created_by
      )
      on conflict (signature_id, installment_number) do nothing;
    end loop;
    if jsonb_array_length(new.payment_plan) > 0 then
      perform private.log_timeline_event(new.tenant_id, new.customer_id, 'financial.contract_installments_created',
        jsonb_build_object('signature_id', new.id, 'installments', jsonb_array_length(new.payment_plan)), 'SYSTEM');
    end if;
  end if;
  return new;
end $$;

create trigger post_signed_contract_payments after update on public.contract_signatures
  for each row execute function private.post_signed_contract_payments();

revoke all on function private.validate_contract_payment_plan(), private.post_signed_contract_payments()
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RPCs da equipe
-- -----------------------------------------------------------------------------

-- Lança um valor total em N parcelas mensais; centavos que sobram vão na 1ª.
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
  v_cents bigint;
  v_base bigint;
  v_amount numeric(12, 2);
  i integer;
begin
  if not private.has_tenant_permission(p_tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers where id = p_customer_id and tenant_id = p_tenant_id
  ) then
    raise exception 'not_found' using errcode = 'P0002', detail = 'customer_id';
  end if;
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
    v_amount := (case when i = 1 then v_base + v_cents % p_installments else v_base end)::numeric / 100;
    insert into public.financial_entries (
      tenant_id, customer_id, kind, description, category, amount, due_date,
      installment_number, installment_count, payment_method, notes, created_by
    ) values (
      p_tenant_id, p_customer_id, 'INCOME', btrim(p_description), nullif(btrim(coalesce(p_category, '')), ''), v_amount,
      (p_first_due_date + make_interval(months => i - 1))::date, i, p_installments,
      nullif(btrim(coalesce(p_payment_method, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), v_uid
    );
  end loop;

  if p_customer_id is not null then
    perform private.log_timeline_event(p_tenant_id, p_customer_id, 'financial.entry_created',
      jsonb_build_object('description', btrim(p_description), 'total', p_total, 'installments', p_installments));
  end if;
  return p_installments;
end;
$$;

-- Carrega a parcela travada e confere a permissão de escrita do tenant dela.
create or replace function private.lock_financial_entry(p_entry_id uuid)
returns public.financial_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  select * into v_entry from public.financial_entries where id = p_entry_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002', detail = 'entry_id';
  end if;
  if not private.has_tenant_permission(v_entry.tenant_id, 'financial.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_entry;
end;
$$;

create or replace function public.financial_entry_update(
  p_entry_id uuid,
  p_description text,
  p_amount numeric,
  p_due_date date,
  p_payment_method text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  perform private.require_user();
  v_entry := private.lock_financial_entry(p_entry_id);
  if v_entry.status <> 'PENDING' then
    raise exception 'entry_not_pending' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount >= 10000000000
    or p_due_date is null or char_length(btrim(coalesce(p_description, ''))) not between 2 and 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  update public.financial_entries
  set description = btrim(p_description), amount = p_amount, due_date = p_due_date,
      payment_method = nullif(btrim(coalesce(p_payment_method, '')), '')
  where id = p_entry_id;
end;
$$;

create or replace function public.financial_entry_pay(
  p_entry_id uuid,
  p_paid_at date,
  p_payment_method text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  perform private.require_user();
  v_entry := private.lock_financial_entry(p_entry_id);
  if v_entry.status <> 'PENDING' then
    raise exception 'entry_not_pending' using errcode = '22023';
  end if;
  if p_paid_at is null or p_paid_at > current_date + 1 then
    raise exception 'invalid_input' using errcode = '22023', detail = 'paid_at';
  end if;
  update public.financial_entries
  set status = 'PAID', paid_at = p_paid_at,
      payment_method = coalesce(nullif(btrim(coalesce(p_payment_method, '')), ''), payment_method)
  where id = p_entry_id;
  if v_entry.customer_id is not null then
    perform private.log_timeline_event(v_entry.tenant_id, v_entry.customer_id, 'financial.entry_paid',
      jsonb_build_object('entry_id', p_entry_id, 'description', v_entry.description, 'amount', v_entry.amount,
        'installment', v_entry.installment_number || '/' || v_entry.installment_count));
  end if;
end;
$$;

create or replace function public.financial_entry_unpay(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  perform private.require_user();
  v_entry := private.lock_financial_entry(p_entry_id);
  if v_entry.status <> 'PAID' then
    raise exception 'entry_not_paid' using errcode = '22023';
  end if;
  update public.financial_entries set status = 'PENDING', paid_at = null where id = p_entry_id;
  if v_entry.customer_id is not null then
    perform private.log_timeline_event(v_entry.tenant_id, v_entry.customer_id, 'financial.entry_payment_reversed',
      jsonb_build_object('entry_id', p_entry_id, 'description', v_entry.description, 'amount', v_entry.amount,
        'paid_at', v_entry.paid_at));
  end if;
end;
$$;

create or replace function public.financial_entry_cancel(p_entry_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.financial_entries;
begin
  perform private.require_user();
  v_entry := private.lock_financial_entry(p_entry_id);
  if v_entry.status <> 'PENDING' then
    raise exception 'entry_not_pending' using errcode = '22023';
  end if;
  update public.financial_entries
  set status = 'CANCELED', canceled_reason = nullif(left(btrim(coalesce(p_reason, '')), 500), '')
  where id = p_entry_id;
  if v_entry.customer_id is not null then
    perform private.log_timeline_event(v_entry.tenant_id, v_entry.customer_id, 'financial.entry_canceled',
      jsonb_build_object('entry_id', p_entry_id, 'description', v_entry.description, 'amount', v_entry.amount));
  end if;
end;
$$;

revoke all on function private.lock_financial_entry(uuid) from public, anon, authenticated;
revoke all on function public.financial_entry_create(uuid, uuid, text, numeric, date, integer, text, text, text) from public, anon;
revoke all on function public.financial_entry_update(uuid, text, numeric, date, text) from public, anon;
revoke all on function public.financial_entry_pay(uuid, date, text) from public, anon;
revoke all on function public.financial_entry_unpay(uuid) from public, anon;
revoke all on function public.financial_entry_cancel(uuid, text) from public, anon;
grant execute on function public.financial_entry_create(uuid, uuid, text, numeric, date, integer, text, text, text) to authenticated;
grant execute on function public.financial_entry_update(uuid, text, numeric, date, text) to authenticated;
grant execute on function public.financial_entry_pay(uuid, date, text) to authenticated;
grant execute on function public.financial_entry_unpay(uuid) to authenticated;
grant execute on function public.financial_entry_cancel(uuid, text) to authenticated;
