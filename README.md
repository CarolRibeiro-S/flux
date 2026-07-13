# Flux

Flux é um aplicativo web (mobile-first) para **registro de despesas por foto de nota fiscal** e **geração de relatórios de reembolso**. O usuário fotografa o recibo, uma IA extrai os dados automaticamente, e as despesas confirmadas podem ser agrupadas em lotes de reembolso com PDF pronto para envio.

## O que o sistema faz

### 1. Captura de despesas por foto
- Na tela inicial, o usuário tira uma foto (ou envia uma imagem) da nota fiscal/recibo.
- A imagem é enviada para o Supabase Storage (bucket `receipts`).

### 2. Extração automática de dados com IA
- Após o upload, a imagem é enviada para a API da Anthropic (Claude), que analisa a foto e extrai:
  - Nome do estabelecimento
  - CNPJ do emitente
  - Valor total
  - Data da despesa
  - Categoria sugerida (alimentação, transporte, hospedagem, material ou outros)
- A despesa é criada no banco com status `pendente_revisao`. Se a IA não conseguir retornar um JSON válido, o texto bruto da resposta é salvo mesmo assim, para não perder a extração.

### 3. Revisão e confirmação
- Antes de virar uma despesa "oficial", o usuário revisa os dados extraídos em um formulário (pode corrigir estabelecimento, CNPJ, valor, data e categoria).
- Ao confirmar, o status muda para `confirmado`.
- Também é possível descartar a despesa, o que apaga o registro e a imagem associada no Storage.

### 4. Histórico de despesas
- Lista todas as despesas confirmadas do usuário, agrupadas por mês, com total geral e total por mês.
- Cada despesa mostra ícone/cor da categoria, estabelecimento, valor e data.
- Uma tela de detalhe mostra a foto da nota e todos os campos extraídos, com opção de editar.

### 5. Lotes de reembolso
- O usuário seleciona despesas confirmadas (que ainda não estão em nenhum lote) manualmente ou por período (data inicial/final).
- Ao gerar, o sistema cria um lote (`reimbursement_batches`) com período, valor total e status `aberto`, e vincula as despesas selecionadas a esse lote.
- A tela de reembolsos lista todos os lotes do usuário com período, valor total e status (**Aberto**, **Enviado**, **Pago**).

### 6. Geração de PDF do reembolso
- A partir de um lote, o sistema monta um PDF (via `pdf-lib`) contendo:
  - Uma capa com título, período, valor total e uma tabela-resumo de todas as despesas.
  - Uma página por despesa, com os dados detalhados e a foto da nota fiscal embutida (quando o formato da imagem é suportado).
- O PDF é salvo no Supabase Storage (bucket `reimbursements`) e fica disponível para download por link assinado (válido por 5 minutos).

### 7. Autenticação
- Login via **Google OAuth**, usando Supabase Auth.
- Todas as rotas de despesas e reembolsos exigem usuário autenticado (redirecionamento para `/login` caso contrário) e todo acesso a dados é filtrado por `user_id`, reforçando o RLS do Supabase.

## Stack técnica

- **[Next.js 16](https://nextjs.org)** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** para estilização
- **[Supabase](https://supabase.com)**: autenticação (Google OAuth), banco de dados Postgres e Storage (imagens de notas e PDFs de reembolso)
- **[Anthropic Claude](https://www.anthropic.com)** (`@anthropic-ai/sdk`): extração de dados (OCR + interpretação) a partir da imagem da nota fiscal
- **[pdf-lib](https://pdf-lib.js.org/)**: geração dos relatórios de reembolso em PDF

## Estrutura do projeto

```
src/
├── app/
│   ├── page.tsx                          # Tela inicial: captura/upload da nota fiscal
│   ├── login/page.tsx                    # Login com Google
│   ├── auth/callback/route.ts            # Callback do OAuth do Supabase
│   ├── despesas/
│   │   ├── page.tsx                      # Histórico de despesas confirmadas (agrupado por mês)
│   │   ├── [id]/page.tsx                 # Detalhe de uma despesa
│   │   ├── revisar/[id]/                 # Revisão/confirmação da despesa extraída pela IA
│   │   └── reembolso/
│   │       ├── page.tsx                  # Lista de lotes de reembolso
│   │       ├── novo/                     # Seleção de despesas para criar um lote
│   │       └── [id]/page.tsx             # Detalhe do lote + download do PDF
│   └── api/
│       ├── extract/route.ts              # Chama o Claude para extrair dados da imagem
│       └── reembolso/
│           ├── criar/route.ts            # Cria um lote de reembolso a partir de despesas
│           └── [id]/pdf/route.ts         # Gera e salva o PDF do lote
├── lib/
│   ├── categorias.ts                     # Categorias de despesa (rótulo, cor, ícone)
│   ├── statusReembolso.ts                # Rótulos/cores dos status de reembolso
│   ├── formatadores.ts                   # Formatação de moeda e data (pt-BR)
│   └── supabase/                         # Clients Supabase (browser, server, admin) e upload
└── proxy.ts                              # Middleware (renomeado em Next 16) que atualiza a sessão
```

## Modelo de dados (Supabase)

**Tabela `expenses`** — despesas individuais
- `user_id`, `image_path`, `status` (`pendente_revisao` | `confirmado`)
- `merchant_name`, `cnpj_emitente`, `amount`, `expense_date`, `category`
- `raw_ocr_text` (fallback quando a IA não retorna JSON válido)
- `batch_id` (preenchido quando a despesa entra em um lote de reembolso)

**Tabela `reimbursement_batches`** — lotes de reembolso
- `user_id`, `period_start`, `period_end`, `total_amount`
- `status` (`aberto` | `enviado` | `pago`), `pdf_path`

**Storage buckets**
- `receipts`: fotos das notas fiscais
- `reimbursements`: PDFs de reembolso gerados

## Configuração

Crie um arquivo `.env.local` na raiz do projeto com:

```
NEXT_PUBLIC_SUPABASE_URL=<url do seu projeto Supabase>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave pública/anon do Supabase>
SUPABASE_SECRET_KEY=<chave de serviço do Supabase, uso apenas no servidor>
ANTHROPIC_API_KEY=<chave da API da Anthropic>
```

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no navegador.

Outros scripts disponíveis:

```bash
npm run build   # build de produção
npm run start   # sobe o build de produção
npm run lint    # roda o eslint
```
