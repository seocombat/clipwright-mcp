import { BASE_OFFER, isPaidEntry, priceEntry, priceListFor, type PriceEntry } from "@clipwright/core";

import type { CreateServerOptions } from "./server.js";

export const BASE_PRICES: readonly PriceEntry[] = priceListFor(BASE_OFFER);

const paidTools = (list: readonly PriceEntry[]): Set<string | null> => new Set(list.filter(isPaidEntry).map((entry) => entry.tool));

export function knownPrices(answer: { readonly prices: readonly unknown[] }): readonly PriceEntry[] | undefined {
  const list = answer.prices.flatMap((entry) => {
    const parsed = priceEntry.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  const sold = paidTools(list);
  return [...paidTools(BASE_PRICES)].every((tool) => sold.has(tool)) ? Object.freeze(list) : undefined;
}

export const sellsExplainer = (prices: readonly { tool: string | null; variant: string | null }[]): boolean =>
  prices.some((entry) => entry.tool === "make_faceless" && entry.variant?.startsWith("explainer") === true);

export function offeredBy(prices: readonly PriceEntry[]): Required<Omit<CreateServerOptions, "fileAccess">> {
  const sells = (tool: string): boolean => prices.some((entry) => entry.tool === tool);
  const ownAgent = sells("render_film");
  return { prices, ownAgent, explainer: sellsExplainer(prices), adGuide: ownAgent && sells("render_edit"), facelessDiy: ownAgent && sells("render_cut") };
}
