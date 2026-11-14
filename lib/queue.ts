import { normDesign } from "./inventory";
import { dueInfo, type DueRules } from "./due";
import { itemStage, type Order, type OrderStatus, type Product } from "./types";

export type QueueAction = "ready" | "stitch" | "send-unstitched" | "need-fabric" | "untracked";
export const ACTION_LABEL: Record<QueueAction, string> = {
  ready: "Size On Hand — no stitching",
  stitch: "Stitch from fabric On Hand",
  "send-unstitched": "Send fabric unstitched",
  "need-fabric": "Fabric needed — none On Hand",
  untracked: "Design not in inventory",
};

export type QueueLine = {
  order: Order;
  /** Position of the item on the order, so a stitching order can point back at it. */
  itemIndex: number;
  /** This item's own stage (the order's stage if none is recorded). */
  stage: OrderStatus;
  title: string;
  size: string;
  action: QueueAction;
  due: ReturnType<typeof dueInfo>;
};
export type QueueGroup = {
  key: string;
  name: string;
  product: Product | null;
  lines: QueueLine[];
  counts: Record<QueueAction, number>;
  fabricStart: number;
  fabricLeft: number;
  stitchBySize: [string, number][];
};

/** "xl" → "XL", "2XL" → "XXL", "Unstitched" stays. */
export function normSize(s: string | null | undefined) {
  const t = (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return "—";
  if (/UNSTITCH/.test(t)) return "Unstitched";
  if (t === "2XL") return "XXL";
  if (t === "XXXL") return "3XL";
  return t;
}

/**
 * Work out what the stitching unit has to do for these orders, against today's stock.
 * Pieces are served earliest due date first: a ready stitched piece of the right size is used
 * before fabric; fabric in stock is converted next; whatever is left is flagged as fabric needed.
 */
export function buildQueue(orders: Order[], products: Product[], rules: DueRules): QueueGroup[] {
  const byKey = new Map<string, Product>();
  for (const p of products) for (const n of [p.name, ...p.aliases]) byKey.set(normDesign(n), p);

  const groups = new Map<string, QueueGroup>();
  const pieces: { g: QueueGroup; line: Omit<QueueLine, "action"> }[] = [];
  for (const o of orders) {
    const due = dueInfo(o, rules);
    for (const [itemIndex, it] of (o.items ?? []).entries()) {
      const stage = itemStage(o, it);
      // Items already committed to dispatch (or further) need nothing from the stitching unit.
      if (stage === "checking" || stage === "ready") continue;
      const product = byKey.get(normDesign(it.title)) ?? null;
      const key = product?.id ?? "x:" + normDesign(it.title);
      let g = groups.get(key);
      if (!g) {
        g = {
          key,
          name: product?.name ?? it.title,
          product,
          lines: [],
          counts: { ready: 0, stitch: 0, "send-unstitched": 0, "need-fabric": 0, untracked: 0 },
          fabricStart: product?.in_stock ?? 0,
          fabricLeft: product?.in_stock ?? 0,
          stitchBySize: [],
        };
        groups.set(key, g);
      }
      const unstitchedTitle = /unstitched/i.test(it.title);
      for (let i = 0; i < Number(it.quantity || 1); i++) pieces.push({ g, line: { order: o, itemIndex, stage, title: it.title, size: unstitchedTitle ? "Unstitched" : normSize(it.size), due } });
    }
  }

  // Earliest due first decides who gets the stock that exists.
  pieces.sort((a, b) => a.line.due.days - b.line.due.days || a.line.order.placed_at.localeCompare(b.line.order.placed_at));
  const ready = new Map<string, Map<string, number>>();
  for (const p of products) ready.set(p.id, new Map(p.stitched.map((r) => [normSize(r.size), r.qty])));

  for (const { g, line } of pieces) {
    let action: QueueAction;
    if (!g.product) action = "untracked";
    else {
      const r = ready.get(g.product.id)!;
      if (line.size !== "Unstitched" && (r.get(line.size) ?? 0) > 0) {
        r.set(line.size, r.get(line.size)! - 1);
        action = "ready";
      } else if (g.fabricLeft > 0) {
        g.fabricLeft -= 1;
        action = line.size === "Unstitched" ? "send-unstitched" : "stitch";
      } else action = "need-fabric";
    }
    g.counts[action] += 1;
    g.lines.push({ ...line, action });
  }

  for (const g of groups.values()) {
    const m = new Map<string, number>();
    for (const l of g.lines) if (l.action === "stitch") m.set(l.size, (m.get(l.size) ?? 0) + 1);
    g.stitchBySize = [...m.entries()];
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
