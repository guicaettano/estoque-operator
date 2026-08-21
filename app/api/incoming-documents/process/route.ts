import { NextRequest, NextResponse } from "next/server";
import { parsePdf } from "@/lib/incoming-products/pdf-parser";
import { parseNfeXml } from "@/lib/incoming-products/xml-parser";
import { IncomingProductParseError } from "@/lib/incoming-products/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isPdf(file: File) { return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"); }
function isXml(file: File) { return file.type.includes("xml") || file.name.toLowerCase().endsWith(".xml"); }

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const formData = await request.formData();
    const pdf = formData.get("pdf");
    const xml = formData.get("xml");
    const xmlFile = xml instanceof File ? xml : null;
    const pdfFile = pdf instanceof File ? pdf : null;
    const selected = xmlFile ?? pdfFile;
    if (!selected) return NextResponse.json({ error: "Send an XML or PDF document" }, { status: 400 });
    if (selected.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Document must be at most 10 MB" }, { status: 413 });
    if (xmlFile && !isXml(xmlFile)) return NextResponse.json({ error: "XML file has an invalid type" }, { status: 400 });
    if (!xmlFile && pdfFile && !isPdf(pdfFile)) return NextResponse.json({ error: "PDF file has an invalid type" }, { status: 400 });

    const products = xmlFile
      ? parseNfeXml(await xmlFile.text())
      : await parsePdf(Buffer.from(await pdfFile!.arrayBuffer()), pdfFile!.name);
    return NextResponse.json({ status: "review", source: xmlFile ? "xml" : "pdf", products });
  } catch (error) {
    const message = error instanceof IncomingProductParseError ? error.message : "The document could not be processed";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
