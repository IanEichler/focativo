export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  path: string;
  isActive: boolean;
}

/** Ordena a árvore em profundidade e calcula o caminho "Pai › Filho". */
export function flattenCategoryTree(
  rows: { id: string; name: string; parent_id: string | null; is_active: boolean; sort_order: number }[],
): CategoryOption[] {
  const children = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const list = children.get(row.parent_id) ?? [];
    list.push(row);
    children.set(row.parent_id, list);
  }
  const result: CategoryOption[] = [];
  const visit = (parentId: string | null, depth: number, prefix: string) => {
    const list = (children.get(parentId) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"),
    );
    for (const row of list) {
      const path = prefix ? `${prefix} › ${row.name}` : row.name;
      result.push({ id: row.id, name: row.name, parentId: row.parent_id, depth, path, isActive: row.is_active });
      if (depth < 3) visit(row.id, depth + 1, path);
    }
  };
  visit(null, 0, "");
  return result;
}
