# Estoque Operator

Fluxo de entrada de mercadorias com Next.js, TypeScript e Supabase. O projeto preserva a integração TagPlus e mantém o CCI estritamente somente leitura.

## Configuração web

1. Crie `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`, a chave pública do Supabase e `SUPABASE_SERVICE_ROLE_KEY` somente no servidor.
2. Defina `PRODUCT_PROVIDER=local` para operar sem OAuth do TagPlus.
3. Aplique, em ordem, as migrations de `supabase/migrations/`.
4. Execute `npm install` e `npm run dev`.

Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, `TAGPLUS_CLIENT_SECRET`, `OPENAI_API_KEY` ou tokens do connector em variáveis `NEXT_PUBLIC_*`.

## PC do CCI

No PC Windows legado, copie somente a pasta `connectors/cci`. **Não execute `npm ci` na raiz do estoque-operator nesse PC.** O connector possui `package.json`, `package-lock.json` e dependências próprios, compatíveis com Node.js 20 x86:

```powershell
cd connectors\cci
npm ci
npm run sync
```

Consulte `connectors/cci/README.md` para a configuração do `.env`. O connector abre transação read-only no Firebird 2.5, executa somente `SELECT` e envia batches por HTTPS.

## Autenticação Supabase

A aplicação usa e-mail/senha, sessão SSR em cookies e renovação em `proxy.ts`. Configure a Site URL e as Redirect URLs no painel do Supabase. Para confirmação de cadastro, use:

```html
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

As páginas privadas e APIs validam o usuário no servidor. O `store_id` do piloto é resolvido pela associação mais antiga em `store_members`; toda consulta ao ERP também restringe `provider = 'cci'`.

## Pedido OSIAS e matching CCI

Em `/entrada`, envie o PDF digital OSIAS. O adapter local detecta `OSIAS MOTO PECAS`, lê a tabela sem OCR e extrai os 28 itens do pedido 1604673. O fluxo então:

1. normaliza descrição preservando números e termos do domínio;
2. recupera candidatos somente da loja atual e provider CCI;
3. calcula score determinístico com similaridade, tokens, referência e penalidades de conflito;
4. usa fast path para referência exata ou match forte;
5. chama o reranker de IA apenas em casos ambíguos e somente com os candidatos recuperados;
6. mostra Top 3, busca manual, “Produto novo” e “Ignorar”;
7. persiste a decisão no Supabase, sem alterar estoque, custo, preço ou produto no CCI.

`OPENAI_API_KEY` habilita o reranker; `OPENAI_MATCHING_MODEL` permite trocar o modelo. Sem chave, em timeout, erro HTTP ou saída inválida, o ranking determinístico continua funcionando.

Em desenvolvimento, “Debug do matching” mostra query normalizada, scores, uso de IA e ranking final, sem secrets.

## Benchmark deterministic vs hybrid

Preencha `tests/fixtures/osias-matching-ground-truth.json` sem inventar equivalências:

```json
{
  "55022": "external_id_correto_no_cci",
  "52191": "outro_external_id_correto"
}
```

Configure `MATCH_BENCHMARK_STORE_ID` em `.env.local` e execute:

```bash
npm run matching:benchmark
```

O comando consulta o catálogo real e imprime Top1Accuracy e Top3Recall para o ranking determinístico e para o híbrido. Com o gabarito vazio, ele encerra sem publicar números fictícios.

## Fluxo genérico e TagPlus

O fluxo anterior de XML/PDF genérico, revisão de custos e distribuição continua disponível. O XML tem prioridade. PDFs não reconhecidos tentam primeiro parsers locais; `OPENAI_API_KEY` pode habilitar o fallback visual existente. A integração TagPlus e suas rotas OAuth permanecem inalteradas.

### Sincronização completa do catálogo TagPlus

Após conectar a conta TagPlus, configure em `.env.local` o UUID da respectiva loja em `TAGPLUS_CATALOG_STORE_ID` e execute:

```powershell
npm run tagplus:sync-catalog
```

O comando usa exclusivamente `GET /produtos` do TagPlus, pagina o catálogo até a última página e faz upsert idempotente em `erp_products` por `store_id`, `provider` e `external_id`. Ele não exclui produtos ausentes e não envia qualquer escrita ao TagPlus. Ao terminar, informa páginas, itens buscados, itens persistidos, duração e a cobertura atual de CCI/TagPlus. Execute a indexação de embeddings separadamente somente se ela for necessária para o matching semântico.

## Distribuição inteligente multi-loja

Depois de aplicar `20260829175027_intelligent_multi_store_allocation.sql`, cada integração TagPlus existente recebe uma loja operacional `R&R AUTOPEÇAS`; a loja sincronizada pelo connector continua sendo a loja CCI. O pedido OSIAS consulta os dois catálogos em modo leitura e só calcula uma distribuição quando o operador pressiona **Sugerir distribuição** ou **Refinar com IA**.

O baseline determinístico considera estoque, giro e cobertura quando disponíveis. Atualmente, o connector CCI sincroniza somente `CADASTRODESCRICAO`, e o OAuth TagPlus solicita apenas o escopo de produtos. Assim, vendas de 7/30/90 dias e última venda permanecem `null` e a interface identifica os dados como limitados. Não amplie escopos nem invente consultas ao Firebird sem validar o esquema real e obter autorização.

`OPENAI_ALLOCATION_MODEL` permite escolher o modelo da sugestão; sem ele, usa-se o modelo de matching configurado. A IA é opcional, recebe apenas métricas normalizadas, não é chamada com uma única loja elegível nem quando todas as lojas têm dados de baixa qualidade. Timeout, erro ou resposta inválida retornam ao baseline. Pesos e limites ficam centralizados em `lib/inventory-allocation/config.ts`.

Ao concluir, a aplicação persiste `InventoryUpdatePlan` e alocações por loja no Supabase, incluindo quantidade sugerida, quantidade aceita, custos, preços e se a sugestão foi alterada. Essa confirmação **não escreve no Firebird nem no TagPlus**; ela apenas prepara o plano para uma futura etapa de execução explícita.

## Verificação

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Matching híbrido de produtos

O matching de CCI e TagPlus usa o mesmo pipeline: extração determinística da intenção, retrieval exato/lexical/semântico, regras estruturadas de conflito, Top 15 e reranking opcional por IA. O tipo da peça e conflitos explícitos de aplicação têm prioridade sobre semântica. Na ausência de OpenAI, pgvector ou embeddings, o fluxo continua com regras lexicais e estruturadas.

A migration `20260829200000_hybrid_product_matching.sql` habilita pgvector, adiciona `search_text`, `embedding vector(512)` e `embedding_updated_at` a `erp_products`, e cria a RPC `match_erp_products` isolada obrigatoriamente por `store_id` e `provider`. O modelo padrão é `text-embedding-3-small`, reduzido para 512 dimensões.

Embeddings são gerados somente no projeto server-side, nunca no connector CCI. Depois de configurar `MATCH_INDEX_STORE_ID` e `MATCH_INDEX_PROVIDER` no `.env.local`, execute:

```powershell
npm run matching:index-embeddings
```

O comando é idempotente e processa somente produtos sem embedding atual. O sync CCI e o cache progressivo dos candidatos TagPlus atualizam `search_text`; quando esse texto muda, a migration invalida o embedding antigo. Falhas de embedding não interrompem o sync nem o processamento do PDF.

Para reproduzir o caso real de regressão no catálogo TagPlus sem enviar dados à OpenAI:

```powershell
npm run matching:benchmark-tagplus
```
