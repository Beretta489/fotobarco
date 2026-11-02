# Pix pelo Efí Bank — configuração e teste

Como ligar o Pix do Efí (antiga Gerencianet) no FotoBarco. O código está
pronto; faltam as credenciais, o certificado e o cadastro do webhook.

> **Nada deste documento vai para o app Expo, para o `app.config.js` ou para
> qualquer arquivo do repositório.** Credenciais entram só como *secret* das
> Edge Functions e nos arquivos de `C:\Users\<voce>\efi-certs\`, fora do projeto.

Quem faz o quê:

| Etapa | Quem |
|---|---|
| Painel do Efí (aplicação, certificado, chave Pix), conversão do certificado, segredo do webhook, secrets no Supabase, cadastro do webhook, revogar chaves antigas, preço de teste | **Você** |
| Migration, deploy das functions, conferência do banco a cada etapa do teste | **Claude**, só depois do seu "sim" |

---

## 1. Como funciona

```
tablet ──payment-intent-create──▶ Edge Function ──PUT /v2/cob/:txid (mTLS)──▶ Efí
   ◀── QR Code (Pix copia e cola) ──┘
cliente paga no app do banco
Efí ──POST payment-webhook?env=..&hmac=..──▶ Edge Function ──GET /v2/cob/:txid──▶ Efí
                                              └─ CONCLUIDA + valor certo ⇒ pedido pago
tablet ──payment-status (a cada 3 s)──▶ lê o banco e, no máximo a cada 10 s,
                                          também consulta GET /v2/cob/:txid (reserva)
```

- **txid** da cobrança = `order_nsu` do pedido (`FB` + 32 hex, 34 caracteres).
- **endToEndId** do pagamento vai para `payment_intents.transaction_nsu`, que é
  único: um mesmo pagamento nunca libera dois pedidos.
- **O webhook nunca é prova de pagamento.** Ele só diz quais txids consultar. A
  liberação depende de `GET /v2/cob/:txid` responder `CONCLUIDA` com o valor exato.
- **Só o Efí:** o Pix é exclusivo do Efí (a InfinitePay foi removida do código
  em 01/11/2026). Chamada ao webhook sem `env`/`hmac` válidos → 401.
- **Idempotente:** webhook, polling, reenvio do Efí e recuperação manual podem
  chegar juntos. Só um libera; os outros recebem "já pago" com o mesmo link, e o
  WhatsApp sai uma vez.
- **Webhook sem mTLS:** o Supabase não valida o certificado do Efí na entrada,
  então o webhook é cadastrado com `x-skip-mtls-checking: true`. Em troca:
  segredo na URL (`?hmac=`), um por ambiente, comparado em tempo constante;
  IP de origem opcional; e a consulta da cobrança acima.
- **Pago no limite do prazo:** se o Efí diz `CONCLUIDA` depois que o pedido
  venceu no nosso lado, as fotos saem (o dinheiro entrou).
- **Crédito, débito e dinheiro** continuam pelo atendente (`payment-attendant-confirm`).
  O Pix não passa por atendente.
- **Recuperação manual** (`payment-recover`, tela "Pix pendentes") funciona com o
  Efí **sem NSU**: o servidor consulta a cobrança e libera se ela estiver paga.

Código: `supabase/functions/_shared/pix/` (`efi.ts`, `index.ts`, `types.ts`). Trocar de provedor = um arquivo novo nessa pasta.

---

## 2. Pasta de trabalho e modelos

Tudo fica em `C:\Users\<voce>\efi-certs\`, **fora do projeto**:

```
efi-certs/
├── homologacao/
│   ├── certificado.p12     ← você baixa do Efí
│   ├── efi-cert.pem  efi-key.pem  efi-cert.b64  efi-key.b64   ← gerados na seção 3
│   ├── secrets.env         ← modelo: secrets do Supabase (seção 4)
│   └── script.env          ← modelo: script do webhook (seção 6)
└── producao/               ← mesma estrutura
```

Os modelos `secrets.env` e `script.env` já existem nessas pastas, só com os
nomes das variáveis. Preencha depois do `=`, sem aspas e sem espaço.

---

## 3. Converter o certificado `.p12` para PEM em base64

O Efí entrega um `.p12` (baixável **uma única vez**, ao criar o certificado).
As Edge Functions não leem arquivo do disco, então ele vira dois PEMs
(certificado + chave privada em PKCS#8) e cada um vai para um secret em base64.

No **Git Bash** (já vem com `openssl` e `base64`), em cada pasta de ambiente:

```bash
export MSYS_NO_PATHCONV=1          # evita o Git Bash reescrever argumentos como caminho
cd ~/efi-certs/homologacao         # depois repita em ~/efi-certs/producao

# 1) certificado (sem as linhas "Bag Attributes")
openssl pkcs12 -in certificado.p12 -clcerts -nokeys -passin pass: \
  | openssl x509 -out efi-cert.pem

# 2) chave privada em PKCS#8 ("BEGIN PRIVATE KEY")
openssl pkcs12 -in certificado.p12 -nocerts -nodes -passin pass: \
  | openssl pkcs8 -topk8 -nocrypt -out efi-key.pem

# 3) conferir: tem que aparecer "BEGIN CERTIFICATE" e "BEGIN PRIVATE KEY"
grep -- "-----BEGIN" efi-cert.pem efi-key.pem

# 4) base64 em UMA linha, para os secrets
base64 -w0 efi-cert.pem > efi-cert.b64
base64 -w0 efi-key.pem  > efi-key.b64
```

- O `.p12` do Efí não tem senha; por isso `-passin pass:` (vazio).
- Se o passo 1 ou 2 der `unsupported` / `RC2-40-CBC`, acrescente `-legacy`
  logo depois de `pkcs12` (o OpenSSL 3 desligou o algoritmo antigo).
- **A chave tem que ser PKCS#8.** Há relato de que o runtime do Supabase
  derruba a function com chave PKCS#1 (`BEGIN RSA PRIVATE KEY`); o passo 2 já
  garante o formato. A function avisa no log se receber PKCS#1.

Alternativa no PowerShell para o passo 4:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("efi-cert.pem")) | Set-Content -NoNewline efi-cert.b64
[Convert]::ToBase64String([IO.File]::ReadAllBytes("efi-key.pem"))  | Set-Content -NoNewline efi-key.b64
```

**Limpeza:** depois que o webhook estiver cadastrado (seção 6) e o teste
passar, guarde o `.p12` num cofre de senhas e apague `.pem`, `.b64` e os
`.env` preenchidos. Para rodar o script de novo, gere os PEMs outra vez a
partir do `.p12`.

---

## 4. Secrets das Edge Functions

Homologação e produção têm **secrets separados**. Cada cobrança grava o
ambiente em que nasceu e é sempre conferida nele.

| Secret | Homologação | Produção | O que é |
|---|---|---|---|
| Client ID | `EFI_HOMOLOG_CLIENT_ID` | `EFI_PROD_CLIENT_ID` | Painel Efí › API › Aplicações |
| Client Secret | `EFI_HOMOLOG_CLIENT_SECRET` | `EFI_PROD_CLIENT_SECRET` | idem |
| Chave Pix | `EFI_HOMOLOG_PIX_KEY` | `EFI_PROD_PIX_KEY` | chave da conta Efí que recebe |
| Certificado | `EFI_HOMOLOG_CERT_PEM_B64` | `EFI_PROD_CERT_PEM_B64` | conteúdo de `efi-cert.b64` |
| Chave privada | `EFI_HOMOLOG_KEY_PEM_B64` | `EFI_PROD_KEY_PEM_B64` | conteúdo de `efi-key.b64` |
| Segredo do webhook | `EFI_HOMOLOG_WEBHOOK_SECRET` | `EFI_PROD_WEBHOOK_SECRET` | aleatório, gerado por você |

**Chave da virada** — de propósito fora do `secrets.env`, para que cadastrar
credenciais nunca ligue a produção sozinha:

| Secret | Valores | Padrão se ausente |
|---|---|---|
| `EFI_ENV` | `homologacao` / `producao` | `homologacao` |

**Opcionais:** `EFI_WEBHOOK_ALLOWED_IPS` (ex.: `34.193.116.226`; vazio = não
confere IP) e `EFI_POLL_MIN_INTERVAL_SECONDS` (padrão `10`; valor inválido cai
no padrão).

Gerar o segredo do webhook (um diferente por ambiente):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Cadastrar.** Escolha um:

- **Painel:** Supabase › Project Settings › Edge Functions › Secrets. Cole o
  conteúdo dos `.b64` inteiro, sem quebra de linha.
- **CLI** (precisa de `npx supabase login` uma vez), com o `secrets.env` preenchido:

  ```bash
  npx supabase secrets set --env-file ~/efi-certs/homologacao/secrets.env --project-ref vofpisizzubbhpidgvoz
  ```

Depois, para a homologação:

```bash
npx supabase secrets set EFI_ENV=homologacao --project-ref vofpisizzubbhpidgvoz
```

(ou pelo painel). Confira os **nomes** cadastrados — o comando
mostra só nome e hash, nunca o valor:

```bash
npx supabase secrets list --project-ref vofpisizzubbhpidgvoz
```

Depois avise o Claude para seguir com a seção 5.

---

## 5. Banco e deploy (executado pelo Claude, depois do seu "sim")

Ordem obrigatória: **migration antes das functions** — as functions novas
gravam colunas que só a migration cria.

1. Migration `supabase/migrations/20261031120000_pix_efi.sql`: só adiciona
   colunas em `payment_intents` e acrescenta a trava de `provider` /
   `provider_env` ao trigger `payment_intents_guard` (o resto da função é
   idêntico ao que está no banco).
2. Deploy, nesta ordem:

| Function | Versão hoje | verify_jwt |
|---|---|---|
| `payment-intent-create` | v5 | ligado |
| `payment-webhook` | v5 | **desligado** (o Efí não manda JWT) |
| `payment-status` | v5 | ligado |
| `payment-recover` | v5 | ligado |

Equivalente manual, para referência. **Não use `supabase db push`:** as
versões gravadas no banco (ex.: `20260916174341`) não batem com os nomes dos
arquivos locais (`20260916120000`), e o push tentaria reaplicar migrations
antigas. A migration vai pelo SQL Editor (colar o `.sql`) ou pelo MCP.

```bash
npx supabase functions deploy payment-intent-create --project-ref vofpisizzubbhpidgvoz
npx supabase functions deploy payment-webhook --no-verify-jwt --project-ref vofpisizzubbhpidgvoz
npx supabase functions deploy payment-status --project-ref vofpisizzubbhpidgvoz
npx supabase functions deploy payment-recover --project-ref vofpisizzubbhpidgvoz
```

`payment-attendant-confirm`, `whatsapp-resend` e `payment-confirm` **não são
republicadas**.

Sem os secrets `EFI_*` do ambiente, a geração do Pix falha (`FALHA_AO_GERAR_PIX`);
cartão e dinheiro pelo atendente continuam funcionando.

---

## 6. No painel do Efí e cadastro do webhook (você)

Faça tudo primeiro em **homologação** e repita em **produção**.

1. **Aplicação:** painel Efí › *API* › *Aplicações* › *Criar aplicação*. Ative a
   **API Pix** com os escopos `cob.read`, `cob.write`, `webhook.read` e
   `webhook.write`. Anote o **Client ID** e o **Client Secret** do ambiente.
2. **Certificado:** *API* › *Meus certificados* › escolha o ambiente › *Criar
   certificado*. Baixe o `.p12` na hora (só é possível uma vez) para
   `efi-certs/<ambiente>/certificado.p12` e siga a seção 3.
3. **Chave Pix:** a chave que vai receber precisa estar cadastrada na conta Efí
   (*Pix* › *Minhas chaves*). Prefira a **chave aleatória**: ela não expõe CNPJ,
   telefone nem e-mail no comprovante do cliente.
4. **Preencha o `script.env`** do ambiente. `EFI_WEBHOOK_SECRET` tem que ser o
   **mesmo valor** do secret `EFI_<AMB>_WEBHOOK_SECRET`.
5. **Rode, da pasta do projeto** (caminhos em formato Windows, para funcionar
   mesmo com `MSYS_NO_PATHCONV=1` ligado):

   ```bash
   node --env-file=C:/Users/<voce>/efi-certs/homologacao/script.env scripts/efi-webhook.mjs token
   node --env-file=C:/Users/<voce>/efi-certs/homologacao/script.env scripts/efi-webhook.mjs cob-teste
   node --env-file=C:/Users/<voce>/efi-certs/homologacao/script.env scripts/efi-webhook.mjs set
   node --env-file=C:/Users/<voce>/efi-certs/homologacao/script.env scripts/efi-webhook.mjs get
   ```

   - `token` → `OK (homologacao): token emitido` (certificado + Client ID/Secret ok).
   - `cob-teste` → HTTP 201 com `pixCopiaECola` (escopos e chave Pix ok).
     O txid começa com `FBTESTE` e não existe no banco: o webhook dele é
     ignorado, como deve ser.
   - `set` → HTTP 200 com a URL, segredo mascarado. **Só rode depois do deploy**
     (seção 5): o Efí pode testar a URL na hora do cadastro.
   - `get` → mostra a URL cadastrada:
     `https://vofpisizzubbhpidgvoz.supabase.co/functions/v1/payment-webhook?env=homologacao&hmac=***&ignorar=`

   O `x-skip-mtls-checking` aparece em exemplos da comunidade do Efí, mas não
   na página oficial de webhooks. Se o `set` for recusado por causa dele,
   confirme com o suporte do Efí antes de buscar outro caminho.

**Trocar o segredo do webhook:** gere um novo, atualize o secret
`EFI_<AMB>_WEBHOOK_SECRET` e o `script.env`, e rode o `set` de novo. Entre os
dois passos, os avisos são recusados (401) e o Efí reenvia depois. O polling
cobre o intervalo.

---

## 7. Roteiro de teste em homologação

Regra do Efí em homologação: **cobranças de R$ 0,01 a R$ 10,00 são confirmadas
sozinhas e disparam o webhook; acima de R$ 10,00 ficam ativas para sempre.**
Nenhum app de banco real paga um QR de homologação.

O menor pedido do FotoBarco custa R$ 15,00 (1 foto avulsa). Para os testes de
pagamento confirmado, **você** baixa o preço temporariamente, fora do horário
de operação (SQL Editor do Supabase):

```sql
update public.package_pricing set amount_cents = 500 where package_type = 'single';
-- ao terminar:
update public.package_pricing set amount_cents = 1500 where package_type = 'single';
```

Em cada passo, o Claude confere `payment_intents` e `payment_events` com você.

**Passo 1 — credenciais:** `token` e `cob-teste` (seção 6).

**Passo 2 — implantação:** secrets e chaves da virada (seção 4) → migration e
deploy (seção 5) → `set` e `get` do webhook (seção 6).

**Passo 3 — Pix confirmado (R$ 5,00)**
1. No app: 1 foto avulsa › Pix.
2. Na tela: QR Code, "Copiar Pix copia e cola" e contador.
3. Em segundos a tela vai para a confirmação com o link das fotos.
4. Banco: intent `efi | homologacao | paid | CONCLUIDA`, `transaction_nsu`
   começando com `E`; eventos `intent_created` → `deeplink_returned`
   (`via: webhook_efi`) → `provider_checked` → `payment_confirmed`
   (`source: webhook` ou `polling`, o que chegar primeiro).
5. `orders.whatsapp_status` preenchido uma vez só.

**Passo 4 — idempotência:** reenviar o webhook do pedido do passo 3:

```bash
curl -s -X POST "https://vofpisizzubbhpidgvoz.supabase.co/functions/v1/payment-webhook?env=homologacao&hmac=<segredo>&ignorar=" \
  -H "Content-Type: application/json" -d '{"pix":[{"txid":"<order_nsu do passo 3>"}]}'
```

Esperado: HTTP 200 e nenhum `payment_confirmed` novo, nenhum WhatsApp novo.

**Passo 5 — webhook forjado não libera**
- O mesmo `curl` sem `hmac`, ou com `hmac` errado → HTTP 401; nada muda.
- Com `hmac` certo e o txid de um pedido **não pago** (passo 6) → HTTP 200 e o
  pedido continua `pending`: o servidor consultou o Efí, que disse `ATIVA`.
- Corpo qualquer sem `env`/`hmac` na URL → HTTP 401; o pedido não é tocado.

**Passo 6 — Pix não pago e expiração (R$ 15,00)**
1. Preço de volta em 1500 e um pedido Pix.
2. QR aparece e nada é confirmado.
3. `last_provider_check_at` avança a cada ~10 s; status `pending`. (O polling
   só grava `provider_checked` quando algo muda, para não poluir a auditoria.)
4. Após 15 minutos a tela mostra "expirou" e o intent vira `expired`.

**Passo 7 — reserva quando o webhook não chega**
1. Preço em 500. Troque o secret `EFI_HOMOLOG_WEBHOOK_SECRET` por outro valor:
   todo aviso do Efí passa a dar 401, como se o webhook se perdesse.
2. Pedido Pix: a tela confirma sozinha pelo polling (`source: polling`).
3. Mantenha o secret trocado para o passo 8.

**Passo 8 — recuperação manual**
1. Pedido Pix de R$ 5 e **feche a tela do Pix logo** (o polling para).
2. Painel admin › Pix pendentes › abra o pedido: não pede NSU. "Conferir e
   liberar" → "Pagamento confirmado no banco" + link.
3. Repetir o botão → "Este pedido já estava liberado".
4. Volte o secret `EFI_HOMOLOG_WEBHOOK_SECRET` ao valor do `script.env`.

**Passo 9 — atendente não mudou:** pedido em dinheiro/cartão › senha → liberado.

**Passo 10 — preço de volta** (`1500`) e conferir `select * from package_pricing`.

---

## 8. Virada para produção

1. Aplicação, certificado e chave de **produção** no Efí (seção 6).
2. Secrets `EFI_PROD_*` (seção 4) e `token` com o `script.env` de produção.
3. `npx supabase secrets set EFI_ENV=producao --project-ref vofpisizzubbhpidgvoz`
4. `set` do webhook de produção.
5. Um Pix real de valor baixo, do começo ao fim.

## 9. Riscos conhecidos

- **mTLS nas Edge Functions.** O `Deno.createHttpClient({ cert, key })` é o único
  jeito de apresentar o certificado a partir de uma Edge Function. Há relato
  (setembro/2026, [supabase discussion #50534](https://github.com/orgs/supabase/discussions/50534))
  de versões do runtime em que ele derruba a function **sem log nenhum**. Se o
  passo 3 falhar com erro 5xx/546 e nenhuma linha nova em `payment_events`, é
  isso. O passo 1 (script local) separa esse problema de um problema de credencial.
- **Segredo na URL.** A URL completa do webhook pode aparecer em logs de
  infraestrutura. Por isso ele é só uma das camadas, e a consulta da cobrança
  é obrigatória. Troque o segredo se suspeitar de vazamento.
