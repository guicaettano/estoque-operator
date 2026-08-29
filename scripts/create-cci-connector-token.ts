import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const storeId = readArgument("--store-id") ?? process.env.CCI_STORE_ID;
  const label = readArgument("--label") ?? "CCI Connector";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!storeId || !supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Defina CCI_STORE_ID, NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const token = `cci_${randomBytes(32).toString("base64url")}`;

  const tokenHash = createHash("sha256")
    .update(token, "utf8")
    .digest("hex");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase
    .from("cci_connector_credentials")
    .insert({
      store_id: storeId,
      label,
      token_hash: tokenHash,
    });

  if (error) {
    throw new Error(
      `Não foi possível criar a credencial: ${error.message}`
    );
  }

  console.log(
    "Credencial criada. Copie o token agora; ele não será exibido novamente:\n"
  );

  console.log(token);
}

function readArgument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

main().catch((error) => {
  console.error("\nErro ao criar credencial CCI:");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});