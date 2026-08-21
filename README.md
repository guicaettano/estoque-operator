# Estoque Operator

Fluxo de entrada de mercadorias com processamento de PDF/XML, revisão de custos e distribuição por loja. O sistema funciona integralmente em modo local, sem depender do OAuth do TagPlus.

## Configuração

1. Crie `.env.local` e preencha as variáveis do Supabase. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` ou `TAGPLUS_CLIENT_SECRET`.
2. Defina `PRODUCT_PROVIDER=local` para executar sem credenciais TagPlus.
3. Execute no Supabase, pela ordem, as migrations em `supabase/migrations/`.
4. Configure o Supabase Auth conforme a seção abaixo.
5. Execute `npm install` e `npm run dev`.

## Modo local

Com `PRODUCT_PROVIDER=local`, a tela `/entrada` processa documentos, mantém a revisão e confirma as entradas no Supabase. Nenhuma rota desse fluxo chama o TagPlus.

As tabelas criadas são:

- `product_catalog`: catálogo local por usuário, já preparado para `external_id` e `sync_status` futuros.
- `incoming_entries`: cabeçalho e estado da entrada confirmada.
- `incoming_entry_items`: itens revisados, preço, lucro, distribuição e vínculo com o catálogo.

Após confirmar uma entrada, consulte o histórico em `/entradas`.

## Autenticação Supabase

A aplicação usa autenticação por e-mail e senha, sessão SSR em cookies e renovação de sessão pelo `proxy.ts`. As páginas `/` e `/entrada` são privadas; a API de processamento também valida o usuário no servidor.

No painel do Supabase:

1. Em **Authentication > URL Configuration**, defina **Site URL** como `http://localhost:3000` durante o desenvolvimento e adicione `http://localhost:3000/**` às Redirect URLs.
2. Em **Authentication > Email Templates > Confirm signup**, troque o link do botão por:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

3. Em `.env.local`, preencha `NEXT_PUBLIC_SUPABASE_URL` e uma destas chaves públicas: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (recomendada para projetos novos) ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legada). Preencha também `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
4. Abra `http://localhost:3000/login`. Você pode criar uma conta pela própria tela ou criar o usuário em **Authentication > Users** no painel.

O Auth do Supabase usa o schema interno `auth` e não exige uma migration própria. A migration deste repositório cria somente a tabela usada pela conexão TagPlus e precisa ser executada em um projeto no qual sua conta tenha permissão de escrita.

Após o usuário autenticar-se pelo Supabase, abra:

```text
GET http://localhost:3000/api/integrations/tagplus/connect
```

Depois da autorização, consulte:

```text
GET http://localhost:3000/api/integrations/tagplus/products
```

## Entrada de fornecedor

Abra `http://localhost:3000/entrada`, envie o PDF e, quando disponível, o XML da NF-e, depois selecione **Processar**. O XML tem prioridade e é lido de forma estruturada; o PDF é tratado por um extrator de texto e parser determinístico de linhas. Revise nome, código, unidade, custo, preço, lucro e a distribuição. Ao selecionar **Confirmar entrada**, os dados são validados e persistidos no Supabase.

Esta etapa não envia produtos ao TagPlus. Ela mantém somente os dados estruturados da entrada e o nome do arquivo de origem no Supabase, sem armazenar o PDF/XML.

PDFs com texto usam primeiro parsers locais e determinísticos. Quando nenhum layout é reconhecido, `OPENAI_API_KEY` habilita um fallback de leitura visual/OCR com saída estruturada; nesse caso o PDF é enviado à API da OpenAI e não é armazenado pela aplicação. O modelo pode ser alterado por `OPENAI_DOCUMENT_MODEL`.

## API TagPlus

O OAuth e as rotas existentes continuam preservados. Quando o suporte liberar o acesso, configure `PRODUCT_PROVIDER=tagplus` e mantenha as variáveis `TAGPLUS_*`. O domínio usa a interface `ProductProvider`, portanto a integração externa fica restrita ao adapter `TagPlusProductProvider`; nenhuma regra de entrada precisa ser reescrita.

- `GET https://api.tagplus.com.br/authorize`: Authorization Code, `scope=read:produtos`, `state`.
- `POST https://api.tagplus.com.br/oauth2/token`: troca de código e refresh em `application/x-www-form-urlencoded`.
- `GET https://api.tagplus.com.br/produtos`: `Authorization: Bearer …` e `X-Api-Version: 2.0`.

O guia público descreve `/produtos` como uma coleção, mas não publica o esquema de seus campos. A rota retorna cada objeto como recebido, sem inventar campos.

## Verificação

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```
