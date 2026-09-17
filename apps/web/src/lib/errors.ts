/**
 * Tradução de erros do banco/serviços para mensagens compreensíveis.
 * As RPCs lançam mensagens-código estáveis (ex.: 'forbidden'); nunca exibimos
 * detalhes internos do Postgres ao usuário.
 */

export const DB_ERROR_MESSAGES = {
  not_authenticated: "Sua sessão expirou. Entre novamente para continuar.",
  forbidden: "Você não tem permissão para realizar esta ação.",
  not_found: "Registro não encontrado ou indisponível.",
  invalid_input: "Alguns dados informados são inválidos. Revise e tente novamente.",
  invalid_role: "Papel de usuário inválido.",
  role_hierarchy: "Seu papel não permite atribuir ou alterar este nível de acesso.",
  cannot_modify_self: "Você não pode alterar o seu próprio acesso por aqui.",
  last_owner: "A empresa precisa ter pelo menos um proprietário ativo.",
  already_member: "Este usuário já faz parte da empresa ou possui convite pendente.",
  user_not_found: "Não encontramos uma conta com este e-mail.",
  tenant_limit_reached: "Você atingiu o limite de empresas criadas por conta.",
  slug_unavailable: "Não foi possível gerar um identificador para a empresa. Tente outro nome.",
  append_only: "Registros de auditoria não podem ser alterados.",
  // Catálogo
  invalid_reference: "Categoria, marca ou fornecedor inválido para esta empresa.",
  sku_taken: "Já existe um produto ativo com este SKU.",
  barcode_taken: "Já existe um produto ativo com este código de barras.",
  name_taken: "Já existe um registro com este nome.",
  in_use: "Este registro está em uso e não pode ser excluído. Você pode desativá-lo.",
  product_archived: "Este produto está arquivado e não pode ser alterado.",
  product_has_stock: "Zere o estoque (e as reservas) antes desta alteração.",
  last_variant: "O produto precisa ter pelo menos uma variação ativa.",
  category_cycle: "Uma categoria não pode ficar dentro dela mesma.",
  category_depth: "Categorias podem ter no máximo 3 níveis.",
  invalid_attribute_value: "Valor incompatível com o tipo da característica.",
  // Estoque
  invalid_quantity: "Quantidade inválida. Use valores positivos com até 3 casas decimais.",
  insufficient_stock:
    "Não há quantidade disponível suficiente. O estoque pode ter mudado — atualizamos os números para você.",
  insufficient_lot_stock: "O lote selecionado não tem quantidade suficiente.",
  lot_required: "Este produto controla lotes: informe o lote.",
  lots_not_tracked: "Este produto não controla lotes.",
  lot_mismatch: "Já existe um lote com este código e outra data de validade.",
  lot_expired: "Não é possível dar entrada em lote vencido.",
  below_reserved: "A quantidade contada é menor que a quantidade reservada. Cancele reservas antes de ajustar.",
  no_change: "A quantidade contada é igual à atual — nenhum ajuste necessário.",
  idempotency_conflict: "Esta operação já foi registrada com outros dados. Recarregue a página e tente novamente.",
} as const;

export type DbErrorCode = keyof typeof DB_ERROR_MESSAGES;

export const GENERIC_ERROR_MESSAGE = "Não foi possível concluir a operação. Tente novamente em instantes.";

export interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export function isDbErrorCode(value: unknown): value is DbErrorCode {
  return typeof value === "string" && value in DB_ERROR_MESSAGES;
}

export function dbErrorCode(error: PostgrestLikeError | null | undefined): DbErrorCode | null {
  return error && isDbErrorCode(error.message) ? error.message : null;
}

export function toUserMessage(error: PostgrestLikeError | null | undefined): string {
  const code = dbErrorCode(error);
  if (code) return DB_ERROR_MESSAGES[code];
  if (error?.code === "42501") return DB_ERROR_MESSAGES.forbidden;
  // Escritas diretas (RLS): violações de unicidade e referência
  if (error?.code === "23505") return DB_ERROR_MESSAGES.name_taken;
  if (error?.code === "23503") return DB_ERROR_MESSAGES.in_use;
  return GENERIC_ERROR_MESSAGE;
}

/** Estado padrão retornado por Server Actions usadas com useActionState. */
export type ActionState<Field extends string = string> =
  | { status: "idle" }
  | { status: "success"; message?: string; id?: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Partial<Record<Field, string[]>>;
      /** Valores enviados (nunca senhas) para repopular o formulário após o reset do React. */
      values?: Partial<Record<Field, string>>;
    };

export const IDLE: ActionState = { status: "idle" };
