"use server";

import { requireTenantContext } from "@/domains/tenants/context";
import { searchVariants, type SearchParams, type SearchResultItem } from "../search";

export async function structuredSearchAction(params: SearchParams): Promise<SearchResultItem[]> {
  const context = await requireTenantContext();
  if (!context.can("catalog.read")) return [];
  const { rows } = await searchVariants(context, { ...params, limit: 15 });
  return rows;
}
