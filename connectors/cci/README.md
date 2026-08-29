# CCI Connector (V0)

Connector local e **estritamente read-only** entre o CCI/Firebird 2.5 e o estoque-operator.

```text
CCI / Firebird local -- SELECT (read-only) --> connector TypeScript
connector TypeScript -- HTTPS + Bearer token --> Next.js Route Handler
Next.js -- service role no servidor --> Supabase / erp_products
```

O frontend existente continua sendo a única interface. A aplicação hospedada nunca abre o caminho local do banco CCI.

## Proteções da V0

- A consulta Firebird é uma constante que começa com `SELECT` e é validada antes da execução.
- A transação Firebird usa `readOnly: true` e `READ COMMITTED`.
- Não há escrita, DDL ou procedure contra o CCI.
- A conexão é sempre encerrada em `finally`.
- O token é hasheado com SHA-256 no Supabase e vinculado a uma única loja.
- A service role fica somente no backend; ela nunca vai para o PC do connector.
- Os lotes têm no máximo 500 produtos e o upsert é idempotente.
- Produtos ausentes em um lote não são removidos.

## Requisitos

- Windows no mesmo PC/rede do Firebird 2.5.
- Node.js 20 ou superior (Node 22 LTS recomendado).
- Acesso de leitura ao Firebird na porta configurada.
- Migration `20260828000000_create_cci_connector.sql` aplicada.

O driver `node-firebird` é puro JavaScript, não exige `fbclient.dll`, funciona em Windows/Node 20+ e implementa os protocolos 10–13 do Firebird 2.5.

## 1. Aplicar a migration

Execute `supabase/migrations/20260828000000_create_cci_connector.sql` no Supabase. Ela cria `stores`, `store_members`, `erp_products`, `cci_connector_credentials`, índices e RLS.

Para criar a loja inicial no SQL Editor, troque o UUID do usuário e execute:

```sql
with new_store as (
  insert into public.stores (name, created_by)
  values ('RR Motos', 'UUID_DO_USUARIO_DO_SUPABASE')
  returning id, created_by
)
insert into public.store_members (store_id, user_id, role)
select id, created_by, 'owner' from new_store
returning store_id;
```

Guarde o `store_id` retornado.

## 2. Criar uma credencial da instalação

No computador de desenvolvimento/backend, configure `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SEU_SEGREDO_SERVER_SIDE
CCI_STORE_ID=UUID_DA_LOJA
```

Execute `npm run cci:create-token`. O comando grava apenas o hash e mostra o token uma única vez. Copie-o para o PC do CCI. Não coloque a service role nesse PC.

## 3. Configurar no PC do CCI

Na raiz do repositório, execute:

```powershell
npm install
Copy-Item connectors\cci\.env.example connectors\cci\.env
```

Preencha `connectors\cci\.env`:

```dotenv
CCI_FIREBIRD_HOST=localhost
CCI_FIREBIRD_PORT=3050
CCI_FIREBIRD_DATABASE=C:\RepleisConta\DADOS
CCI_FIREBIRD_USER=SEU_USUARIO_SOMENTE_LEITURA
CCI_FIREBIRD_PASSWORD=SUA_SENHA
CCI_FIREBIRD_ENCODING=WIN1252
CCI_STORE_ID=UUID_DA_LOJA
CCI_SYNC_URL=https://estoque-operator.vercel.app/api/integrations/cci/sync
CCI_CONNECTOR_TOKEN=TOKEN_GERADO
CCI_BATCH_SIZE=500
CCI_REQUEST_TIMEOUT_MS=30000
```

O `.env` é ignorado pelo Git. Prefira também um usuário Firebird com somente `SELECT` em `CADASTRODESCRICAO`, criando uma segunda barreira além da transação read-only.

## 4. Executar

```powershell
npm run cci:sync
```

Senha e token nunca são escritos no log.

## 5. Verificar

```sql
select *
from public.erp_products
where provider = 'cci'
order by synced_at desc
limit 10;
```

Executar novamente atualiza a mesma linha por chave externa; não cria duplicatas.

## Limitações e próximos passos

- Execução manual; ainda não é `.exe` nem Windows Service.
- Sync unidirecional CCI → estoque-operator; nunca escreve no CCI.
- Não exclui automaticamente produtos ausentes.
- Não usa IA, embeddings ou vector database.
- `searchErpProducts` oferece busca textual determinística, sempre isolada por loja.
- Futuramente, a credencial pode ganhar rotação/expiração e telemetria por instalação.
