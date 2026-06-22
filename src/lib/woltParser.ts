import type { ParsedLineItem, ParsedOrder } from "./types";

// Parser for the text you get when you copy a Wolt order receipt and paste it.
//
// The receipt layout is line-based. After a line that just says "Items", each
// product is a block of:
//   <name>
//   <unit price>        e.g. 4.69
//   <quantity>          e.g. ×1   (the multiplication sign or a plain "x")
//   <line total>        e.g. 4.69
// optionally followed by:
//   Substitution for:
//   <original item name>
//
// Fees ("Bag charge") follow the same block shape. The tail of the receipt
// contains "Delivery ... <amount>", "Service fee" / amount, and
// "Total sum" / "€amount".
//
// The parser is deliberately tolerant: missing prices/quantities don't throw,
// they just produce nulls/defaults so the user can fix them in the preview.

const FEE_NAMES = new Set(["bag charge"]);

function isPriceLine(line: string): boolean {
  return /^€?\s*\d{1,6}([.,]\d{1,2})?$/.test(line.trim());
}

function parsePrice(line: string): number | null {
  const m = line.replace(/€/g, "").trim().replace(",", ".");
  const n = Number.parseFloat(m);
  return Number.isFinite(n) ? n : null;
}

function isQtyLine(line: string): boolean {
  return /^[×x*]\s*\d+$/i.test(line.trim());
}

function parseQty(line: string): number {
  const m = line.trim().match(/\d+/);
  return m ? Number.parseInt(m[0], 10) : 1;
}

function firstMatch(lines: string[], re: RegExp): string | null {
  for (const line of lines) {
    const m = line.match(re);
    if (m) return (m[1] ?? "").trim() || null;
  }
  return null;
}

/** Last number that appears on a line, e.g. "Delivery 67 Triq ... 0.00" -> 0.00 */
function trailingAmount(line: string): number | null {
  const m = line.replace(",", ".").match(/(\d+(?:\.\d{1,2})?)\s*$/);
  return m ? Number.parseFloat(m[1]) : null;
}

export function parseWoltReceipt(raw: string): ParsedOrder {
  const allLines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, " ").trim())
    .filter((l) => l.length > 0);

  const order: ParsedOrder = {
    shopName: allLines[0] ?? null,
    shopAddress: null,
    orderNumber: firstMatch(allLines, /your order number:\s*(.+)/i),
    woltOrderId: firstMatch(allLines, /order id:\s*(\S+)/i),
    placedAt: firstMatch(allLines, /order placed:\s*(.+)/i),
    deliveredAt: firstMatch(allLines, /order delivered:\s*(.+)/i),
    deliveryAddress: firstMatch(allLines, /delivered to:\s*(.+)/i),
    items: [],
    subtotal: null,
    serviceFee: null,
    deliveryFee: null,
    bagCharge: null,
    total: null,
    currency: "EUR",
    rawText: raw,
  };

  // Shop address: the line after the shop name, unless it's already a known field.
  if (allLines[1] && !/^(\+|order|your|delivered|delivery)/i.test(allLines[1])) {
    order.shopAddress = allLines[1];
  }

  // Items section starts after the first standalone "Items" line.
  const itemsIdx = allLines.findIndex((l) => /^items$/i.test(l));
  const start = itemsIdx >= 0 ? itemsIdx + 1 : 0;

  let i = start;
  while (i < allLines.length) {
    const line = allLines[i];

    if (/^total sum/i.test(line)) {
      // "Total sum" then "€91.75" on the next line (or amount on same line).
      order.total = trailingAmount(line) ?? parsePrice(allLines[i + 1] ?? "");
      i += 2;
      continue;
    }

    if (/^service fee/i.test(line)) {
      order.serviceFee = trailingAmount(line) ?? parsePrice(allLines[i + 1] ?? "");
      i += isPriceLine(allLines[i + 1] ?? "") ? 2 : 1;
      continue;
    }

    if (/^delivery/i.test(line)) {
      // "Delivery 67 Triq ir-Rebbiegħa  0.00"  (amount may be on next line).
      // Note: the amount can be 0.00, which is falsy — compare against null.
      const inline = trailingAmount(line);
      if (inline !== null) {
        order.deliveryFee = inline;
        i += 1;
      } else if (isPriceLine(allLines[i + 1] ?? "")) {
        order.deliveryFee = parsePrice(allLines[i + 1]);
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    // Otherwise: a product (or fee) block. Name is the current line.
    const name = line;
    i += 1;

    let unitPrice: number | null = null;
    if (isPriceLine(allLines[i] ?? "")) {
      unitPrice = parsePrice(allLines[i]);
      i += 1;
    }

    let quantity = 1;
    if (isQtyLine(allLines[i] ?? "")) {
      quantity = parseQty(allLines[i]);
      i += 1;
    }

    let lineTotal: number | null = null;
    if (isPriceLine(allLines[i] ?? "")) {
      lineTotal = parsePrice(allLines[i]);
      i += 1;
    }

    let substitutionFor: string | null = null;
    if (/^substitution for:?$/i.test(allLines[i] ?? "")) {
      substitutionFor = (allLines[i + 1] ?? "").trim() || null;
      i += 2;
    }

    const isFee = FEE_NAMES.has(name.toLowerCase());
    if (isFee) {
      order.bagCharge = lineTotal ?? unitPrice;
    }

    const item: ParsedLineItem = {
      name,
      unitPrice,
      quantity,
      lineTotal,
      substitutionFor,
      isFee,
    };
    order.items.push(item);
  }

  // Subtotal = sum of non-fee line totals (fallback to unit*qty).
  const productTotals = order.items
    .filter((it) => !it.isFee)
    .map((it) => it.lineTotal ?? (it.unitPrice != null ? it.unitPrice * it.quantity : 0));
  order.subtotal = productTotals.length
    ? Math.round(productTotals.reduce((a, b) => a + b, 0) * 100) / 100
    : null;

  return order;
}

/** Normalise a product name for de-duplication & matching. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, " ")
    .trim();
}
