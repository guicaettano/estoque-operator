import { XMLParser } from "fast-xml-parser";
import { normalizeIncomingProduct } from "@/lib/incoming-products/normalize";
import { IncomingProductParseError, type IncomingProduct } from "@/lib/incoming-products/types";

type XmlObject = Record<string, unknown>;

function findValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const object = value as XmlObject;
  if (key in object) return object[key];
  for (const child of Object.values(object)) {
    const result = findValue(child, key);
    if (result !== undefined) return result;
  }
  return undefined;
}

export function parseNfeXml(xml: string): IncomingProduct[] {
  let document: unknown;
  try {
    document = new XMLParser({ ignoreAttributes: false, trimValues: true }).parse(xml);
  } catch {
    throw new IncomingProductParseError("The XML document could not be parsed");
  }
  const details = findValue(document, "det");
  const items = Array.isArray(details) ? details : details ? [details] : [];
  const products = items.map((item) => {
    const product = findValue(item, "prod") as XmlObject | undefined;
    if (!product) throw new IncomingProductParseError("An NF-e item does not contain a prod element");
    return normalizeIncomingProduct({
      code: stringValue(product.cProd),
      description: stringValue(product.xProd),
      unit: stringValue(product.uCom),
      quantity: numberValue(product.qCom),
      unitCost: numberValue(product.vUnCom),
    });
  });
  if (!products.length) throw new IncomingProductParseError("No NF-e product items were found in the XML");
  return products;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined;
}
