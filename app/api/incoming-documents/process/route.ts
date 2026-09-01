import { NextResponse } from "next/server";
import { IncomingProductParseError } from "@/lib/incoming-products/types";
import { parseIncomingPurchaseDocument } from "@/lib/purchase-documents/parse-document";
import { processMultiStoreMatching } from "@/lib/purchase-documents/process-multi-store";
import type { ProductMatchResult } from "@/lib/product-matching/types";
import { getOperationalStores } from "@/lib/stores/operational-stores";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
function isPdf(file: File) { return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"); }
function isXml(file: File) { return file.type.includes("xml") || file.name.toLowerCase().endsWith(".xml"); }

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Autenticação necessária." }, { status: 401 });
    const formData = await request.formData(); const pdf = formData.get("pdf"); const xml = formData.get("xml");
    const supplierName = typeof formData.get("supplierName") === "string" ? String(formData.get("supplierName")) : null;
    const xmlFile = xml instanceof File ? xml : null; const pdfFile = pdf instanceof File ? pdf : null; const selected = xmlFile ?? pdfFile;
    if (!selected) return NextResponse.json({ error: "Envie um documento XML ou PDF." }, { status: 400 });
    if (selected.size > MAX_FILE_SIZE) return NextResponse.json({ error: "O documento deve ter no máximo 10 MB." }, { status: 413 });
    if (xmlFile && !isXml(xmlFile)) return NextResponse.json({ error: "O arquivo XML tem tipo inválido." }, { status: 400 });
    if (!xmlFile && pdfFile && !isPdf(pdfFile)) return NextResponse.json({ error: "O arquivo PDF tem tipo inválido." }, { status: 400 });
    const document = xmlFile
      ? await parseIncomingPurchaseDocument({ source: "xml", xml: await xmlFile.text(), supplierName })
      : await parseIncomingPurchaseDocument({ source: "pdf", buffer: Buffer.from(await pdfFile!.arrayBuffer()), filename: pdfFile!.name, supplierName });
    const stores = await getOperationalStores(user.id); const cciStore = stores.find((store) => store.provider === "cci");
    if (!cciStore) return NextResponse.json({ error: "Seu usuário não está vinculado a uma loja com catálogo CCI." }, { status: 409 });
    const multiStoreItems = await processMultiStoreMatching({ stores, userId: user.id, items: document.items });
    const matches = multiStoreItems.map((item) => {
      const store = item.stores.find((entry) => entry.provider === "cci");
      return store ? { item: item.item, status: store.status, method: store.method, aiCalled: store.matchingDebug.aiCalled, normalizedQuery: store.matchingDebug.normalizedQuery, parsedIntent: store.matchingDebug.parsedIntent, candidates: store.candidates } satisfies ProductMatchResult : null;
    }).filter((match): match is ProductMatchResult => match !== null);
    return NextResponse.json({ status: "review", source: document.source, documentKind: "purchase_order", provider: stores.length > 1 ? "multi_store" : "cci", storeId: cciStore.id, stores, supplier: document.supplier, itemCount: document.items.length, multiStoreItems, matches });
  } catch (error) {
    const message = error instanceof IncomingProductParseError || error instanceof Error ? error.message : "Não foi possível processar o documento.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
