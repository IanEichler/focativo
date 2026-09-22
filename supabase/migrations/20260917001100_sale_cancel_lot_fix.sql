-- =============================================================================
-- FASE 4 · Correção: sale_cancel falhava com 'lot_required' para produtos que
-- controlam lote.
--
-- RETURN é um delta físico positivo; private.apply_stock_movement exige saber
-- em qual lote a mercadoria volta quando o produto rastreia lotes (mesma regra
-- de ENTRY). A implementação original de sale_cancel nunca informava o lote.
-- Descoberto ao vivo, pelo teste end-to-end contra o Supabase Cloud real
-- (venda de "Multivitamínico Diário", produto com controle de lote).
--
-- Correção: devolve a cada lote exatamente a quantidade que ele forneceu na
-- venda original (rastreada em stock_movement_lots pela movimentação SALE com
-- reference_type='sale'/reference_id=<venda>), preservando a proporção entre
-- lotes quando o FEFO consumiu de mais de um. Produtos sem controle de lote
-- continuam com uma única movimentação RETURN sem lote.
-- =============================================================================

create or replace function public.sale_cancel(p_sale_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
  v_lot_portion record;
  v_returned numeric;
begin
  perform private.require_user();
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.has_tenant_permission(v_sale.tenant_id, 'sales.write') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sale.canceled_at is not null then
    raise exception 'invalid_input' using errcode = '22023', detail = 'already_canceled';
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id loop
    v_returned := 0;

    for v_lot_portion in
      select sml.lot_id, -sml.quantity_delta as quantity
      from public.stock_movements sm
      join public.stock_movement_lots sml on sml.movement_id = sm.id
      where sm.tenant_id = v_sale.tenant_id and sm.reference_type = 'sale' and sm.reference_id = p_sale_id
        and sm.variant_id = v_item.variant_id and sm.type = 'SALE'
      order by sml.lot_id
    loop
      perform private.apply_stock_movement(
        p_tenant_id => v_sale.tenant_id,
        p_variant_id => v_item.variant_id,
        p_type => 'RETURN',
        p_quantity => v_lot_portion.quantity,
        p_origin => 'SALE',
        p_lot_id => v_lot_portion.lot_id,
        p_reference_type => 'sale',
        p_reference_id => p_sale_id,
        p_audit_action => 'sale.item_returned'
      );
      v_returned := v_returned + v_lot_portion.quantity;
    end loop;

    -- Produto sem controle de lote: nenhuma linha em stock_movement_lots, devolve tudo de uma vez.
    if v_returned = 0 then
      perform private.apply_stock_movement(
        p_tenant_id => v_sale.tenant_id,
        p_variant_id => v_item.variant_id,
        p_type => 'RETURN',
        p_quantity => v_item.quantity,
        p_origin => 'SALE',
        p_reference_type => 'sale',
        p_reference_id => p_sale_id,
        p_audit_action => 'sale.item_returned'
      );
    end if;
  end loop;

  update public.sales set canceled_at = now(), canceled_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_sale_id;

  if v_sale.customer_id is not null then
    perform private.log_timeline_event(v_sale.tenant_id, v_sale.customer_id, 'sale.canceled',
      jsonb_build_object('sale_id', p_sale_id, 'reason', p_reason));
  end if;
end;
$$;
