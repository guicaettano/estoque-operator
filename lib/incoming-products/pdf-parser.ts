import pdf from "pdf-parse";
import { parsePdfWithOpenAI } from "@/lib/incoming-products/ai-pdf-parser";
import { normalizeIncomingProduct } from "@/lib/incoming-products/normalize";
import { IncomingProductParseError, type IncomingProduct } from "@/lib/incoming-products/types";

export interface PdfTextExtractor {
  extract(buffer: Buffer): Promise<string>;
}

type PdfTextItem = { str: string; transform: readonly number[] };
type PdfPageData = { getTextContent(options: { disableCombineTextItems: boolean }): Promise<{ items: PdfTextItem[] }> };

async function renderPdfWithColumns(page: PdfPageData): Promise<string> {
  const { items } = await page.getTextContent({ disableCombineTextItems: false });
  const rows = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const y = Math.round(item.transform[5] * 10) / 10;
    rows.set(y, [...(rows.get(y) ?? []), item]);
  }
  return [...rows.entries()]
    .sort(([firstY], [secondY]) => secondY - firstY)
    .map(([, row]) => row.sort((first, second) => first.transform[4] - second.transform[4]).map((item) => item.str).join("\t"))
    .join("\n");
}

export const embeddedPdfTextExtractor: PdfTextExtractor = {
  async extract(buffer) {
    const result = await pdf(buffer, { pagerender: renderPdfWithColumns });
    return result.text;
  },
};

// Deterministic line recognizers. New layouts can add recognizers without changing OCR/LLM adapters.
const PRODUCT_LINE = /^\s*(?<code>\S+)\s+(?<description>.+?)\s+(?<unit>UN|UND|UNID|PC|PÇ|KG|LT|CX)\s+(?<quantity>\d+(?:[.,]\d+)?)\s+(?<unitCost>\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:\.\d+)?)\s*(?:\d+(?:[.,]\d+)?)?\s*$/i;
const UNIT_IN_DESCRIPTION = /-(UND|UN|PC|PÇ|KG|LT|CX|KIT)\b/i;

function isHeaderOrSummary(line: string): boolean {
  return /código|descrição|preço|quantidade|valor|totais|itens|total da venda/i.test(line);
}

function parseOsiasOrderRow(columns: string[], previousDescription: string | null): IncomingProduct | null {
  if (!/^\d{4,}$/.test(columns[0] ?? "")) return null;
  const quantityIndex = columns.findIndex((column, index) => index > 0 && /^\d+(?:,\d+)?$/.test(column) && /^\d+(?:,\d+)$/.test(columns[index + 1] ?? "") && /^\d+(?:,\d+)$/.test(columns[index + 2] ?? "") && /^\d+(?:,\d+)$/.test(columns[index + 3] ?? ""));
  if (quantityIndex === -1) return null;
  const description = columns.slice(1, quantityIndex).join(" ") || previousDescription;
  if (!description) return null;
  return normalizeIncomingProduct({
    code: columns[0],
    description,
    unit: description.match(UNIT_IN_DESCRIPTION)?.[1] ?? null,
    quantity: columns[quantityIndex],
    unitCost: columns[quantityIndex + 1],
  });
}

function parseCurrencyQuoteRow(rawLine: string, columns: string[]): IncomingProduct | null {
  const visibleCode = columns[0];
  if (!visibleCode || !/^[A-Z0-9]{3,}$/i.test(visibleCode)) return null;
  const values = [...rawLine.matchAll(/R\s*\$?\s*([\d.]+,\d{2})/g)];
  if (values.length < 3) return null;
  const secondPrice = values[1];
  const quantity = rawLine.slice((secondPrice.index ?? 0) + secondPrice[0].length).match(/^\s*(\d+(?:,\d+)?)/)?.[1];
  const firstCurrencyColumn = columns.findIndex((column) => column === "R");
  const completeDescription = columns.slice(1, firstCurrencyColumn === -1 ? 2 : firstCurrencyColumn).join(" ");
  const [description, repeatedCode] = completeDescription.split(/\s+-\s+/, 3);
  const code = repeatedCode && repeatedCode.startsWith(visibleCode) ? repeatedCode : visibleCode;
  if (!quantity || !description) return null;
  return normalizeIncomingProduct({ code, description: description.trim(), unit: null, quantity, unitCost: secondPrice[1] });
}

export function parseProductsFromPdfText(text: string): IncomingProduct[] {
  const products: IncomingProduct[] = [];
  let previousDescription: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const columns = rawLine.split("\t").map((column) => column.trim()).filter(Boolean);
    const osiasProduct = parseOsiasOrderRow(columns, previousDescription);
    if (osiasProduct) {
      products.push(osiasProduct);
      previousDescription = null;
      continue;
    }
    const currencyProduct = parseCurrencyQuoteRow(rawLine, columns);
    if (currencyProduct) {
      products.push(currencyProduct);
      previousDescription = null;
      continue;
    }
    const unitIndex = columns.findIndex((column) => /^(UN|UND|UNID|PC|PÇ|KG|LT|CX)$/i.test(column));
    if (columns.length >= 8 && unitIndex >= 2 && columns[unitIndex + 2]) {
      try {
        products.push(normalizeIncomingProduct({
          code: columns[0],
          description: columns[1],
          unit: columns[unitIndex],
          quantity: columns[unitIndex + 1],
          unitCost: columns[unitIndex + 2],
        }));
        continue;
      } catch {
        // This row is not a product row. Let the generic recognizer try next.
      }
    }
    const match = rawLine.match(PRODUCT_LINE)?.groups;
    if (match) {
      products.push(normalizeIncomingProduct({
        code: match.code,
        description: match.description,
        unit: match.unit,
        quantity: match.quantity,
        unitCost: match.unitCost,
      }));
      previousDescription = null;
      continue;
    }
    const descriptionCandidate = columns.join(" ");
    const continuationUnit = descriptionCandidate.match(/(?:^|[-\s])(UND|UN|PC|PÇ|KG|LT|CX|KIT)$/i)?.[1];
    if (continuationUnit && products.length > 0 && products[products.length - 1].unit === null) {
      products[products.length - 1] = { ...products[products.length - 1], unit: continuationUnit.toUpperCase() };
    }
    if (descriptionCandidate.length > 8 && !isHeaderOrSummary(descriptionCandidate) && !/^=+$/.test(descriptionCandidate)) {
      previousDescription = descriptionCandidate;
    }
  }
  if (!products.length) throw new IncomingProductParseError("No product lines could be identified in this PDF layout");
  return products;
}

export async function parsePdf(buffer: Buffer, filename = "document.pdf", extractor: PdfTextExtractor = embeddedPdfTextExtractor): Promise<IncomingProduct[]> {
  try {
    const text = await extractor.extract(buffer);
    try {
      return parseProductsFromPdfText(text);
    } catch (error) {
      if (!(error instanceof IncomingProductParseError)) throw error;
      return await parsePdfWithOpenAI(buffer, filename);
    }
  } catch (error) {
    if (error instanceof IncomingProductParseError) throw error;
    throw new IncomingProductParseError("The PDF text could not be extracted");
  }
}
