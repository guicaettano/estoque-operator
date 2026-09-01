# CCI Connector

Pacote independente, local e **estritamente read-only** para sincronizar o catálogo do CCI/Firebird 2.5 com o estoque-operator.

```text
CCI / Firebird local -- SELECT --> CCI Connector -- HTTPS --> estoque-operator
```

Ele não contém Next.js, Supabase SDK, TagPlus ou service role. No PC da loja, copie somente esta pasta `connectors/cci`.

## Requisitos

- Windows x86 com Node.js 20 ou superior.
- Acesso ao Firebird 2.5 e permissão de leitura em `CADASTRODESCRICAO`.
- Token de connector já criado para a loja no backend.

`node-firebird` é puro JavaScript e não exige `fbclient.dll`; o pacote usa apenas `node-firebird`, `typescript` e os tipos Node para evitar dependências nativas desnecessárias em Windows x86.

## Instalação no PC do CCI

**Não execute `npm ci` na raiz do `estoque-operator` nesse PC.** Ela instala o app Next.js completo e dependências que podem exigir Node mais novo.

Copie a pasta `connectors/cci` para o PC da loja. Em PowerShell:

```powershell
cd connectors\cci
Copy-Item .env.example .env
notepad .env
npm ci
npm run sync
```

O comando `npm run sync` compila o TypeScript com `tsc` e executa `node dist/index.js`; não usa `tsx`, `esbuild`, Supabase SDK nem dependências do projeto raiz.

## Configuração

Preencha o arquivo `.env` copiado de `.env.example`:

```dotenv
CCI_FIREBIRD_HOST=localhost
CCI_FIREBIRD_PORT=3050
CCI_FIREBIRD_DATABASE=C:\RepleisConta\DADOS
CCI_FIREBIRD_USER=SYSDBA
CCI_FIREBIRD_PASSWORD=SUA_SENHA
CCI_FIREBIRD_ENCODING=WIN1252
CCI_STORE_ID=UUID_DA_LOJA
CCI_SYNC_URL=https://estoque-operator.vercel.app/api/integrations/cci/sync
CCI_CONNECTOR_TOKEN=TOKEN_GERADO
CCI_BATCH_SIZE=500
CCI_REQUEST_TIMEOUT_MS=30000
```

O `.env` não é enviado ao Git. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` neste PC.

## Segurança e funcionamento

- Abre uma transação Firebird com `readOnly: true` e `READ COMMITTED`.
- Executa somente a consulta `SELECT` fixa em `CADASTRODESCRICAO`; a consulta também é validada contra comandos de escrita.
- Normaliza produtos e envia batches de no máximo 500 itens por `fetch` nativo do Node 20.
- Usa `Authorization: Bearer <CCI_CONNECTOR_TOKEN>`.
- Fecha a conexão Firebird mesmo quando ocorre erro.
- Não executa `UPDATE`, `INSERT`, `DELETE`, DDL ou procedures no CCI.

Para uma defesa adicional, use um usuário Firebird com somente `SELECT` na tabela de produtos.

## Verificação local

Antes do primeiro sync real, você pode validar o pacote sem tocar no Firebird:

```powershell
npm run typecheck
npm test
```

Após sincronizar, verifique no Supabase:

```sql
select *
from public.erp_products
where provider = 'cci'
order by synced_at desc
limit 10;
```
