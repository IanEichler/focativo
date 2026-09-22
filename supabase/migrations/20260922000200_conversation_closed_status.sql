-- Novo status de conversa: "encerrado" (finalizar atendimento). Em arquivo
-- próprio porque ALTER TYPE ... ADD VALUE não pode ser usado na mesma
-- transação em que o valor novo é referenciado — a função que usa 'CLOSED'
-- fica na migration seguinte.
alter type public.conversation_status add value 'CLOSED';
