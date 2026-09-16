# Pagamento — InfinitePay (Tap + Pix)

Um provedor só, para os dois métodos:

| Método | Como funciona | Quem confirma |
|---|---|---|
| **Crédito / Débito** | InfiniteTap — deeplink abre o app InfinitePay, cliente aproxima o cartão no tablet | Retorno do deeplink → `payment-confirm` |
| **Pix** | Checkout — QR Code na tela, cliente escaneia com o próprio celular | Webhook da InfinitePay → `payment-webhook` |

> A EFI foi removida. A API Pix dela exige **mTLS**, que não roda de forma
> confiável em Supabase Edge Function.

---

## 1. O que falta preencher

**Três secrets obrigatórios.** Sem eles as functions falham no boot (de propósito
— melhor quebrar no deploy do que no meio de uma venda).

```bash
supabase secrets set INFINITEPAY_HANDLE=seu_infinitetag      # sem o @
supabase secrets set INFINITEPAY_DOC_NUMBER=00000000000000   # só dígitos
supabase secrets set APP_DEEPLINK_SCHEME=fotobarco           # igual ao app.config.js
```

| Valor | Onde conseguir |
|---|---|
| **InfiniteTag** | App InfinitePay → Perfil → InfiniteTag. É a conta que **recebe**. |
| **CNPJ/CPF** | Documento da conta InfinitePay. Sem ponto, barra ou traço. |
| **Scheme** | Você escolhe. Já está como `fotobarco` no `app.config.js`. |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pela plataforma —
não cadastre, e **não** ponha no `.env` do repo (esse arquivo alimenta o app, e
tudo que chega no app é público).

### Limpeza pendente no `.env`

Estas chaves não são mais usadas e podem sair: `EFI_CLIENT_ID`,
`EFI_CLIENT_SECRET`, `EFI_PIX_KEY`, `EFI_SANDBOX`, `INFINITIPAY_API_KEY`.

> ⚠️ Se `EFI_CLIENT_SECRET` chegou a ser usado em produção, **revogue na EFI**.
> Segredo que passou por um repositório deve ser tratado como comprometido.

---

## 2. Deploy

```bash
supabase db push

supabase functions deploy payment-intent-create
supabase functions deploy payment-confirm
supabase functions deploy payment-status
supabase functions deploy payment-webhook --no-verify-jwt
```

> 🚨 **O `--no-verify-jwt` é só para o webhook.** A InfinitePay não manda JWT,
> então esse endpoint precisa ser público. Nas outras três a flag seria uma
> falha grave — elas só devem aceitar chamadas do app autenticado.

---

## 3. Por que a estrutura é assim

### O app nunca diz quanto custa

O preço era calculado em `PackageSelectScreen.js` e enviado no INSERT — e a
policy `orders_insert` aceita **qualquer** valor. Mandar `total = 0.01` levava
tudo.

Agora vive em `package_pricing` / `extras_pricing`, recalculado por
`compute_order_amount_cents()` a cada pedido. O app manda só *o que* o cliente
escolheu.

> **Efeito colateral bom:** mudar preço virou `UPDATE` numa tabela. Sem publicar
> versão nova do app.

### O app nunca diz que pagou

Nenhum dos três avisos de pagamento é confiável:

- **deeplink** — qualquer app no tablet dispara `fotobarco://payment/result?...`
- **webhook** — a InfinitePay **não assina** (sem HMAC); quem descobrir a URL posta
- **polling** — disparado pelo próprio app

Os três entram em `_shared/confirm.ts`, que ignora o que afirmam e pergunta à
InfinitePay via `payment_check`. Só libera com cinco condições: intent válido e
no prazo, provedor confirmou, valor bate, sem replay, e o `UPDATE` condicionado
a `status='pending'` (trava contra dupla liberação).

Centralizar foi proposital: se cada entrada tivesse sua cópia da regra, bastaria
uma esquecer uma checagem para abrir o sistema inteiro.

### Nenhum segredo entra no app

`services/payments.js` lia `EFI_CLIENT_SECRET` e `INFINITIPAY_API_KEY` de
`expoConfig.extra` — extraível de qualquer APK. O arquivo foi **removido**.

Ele estava inerte (o `app.config.js` nunca expôs essas chaves, então valiam
`undefined`). Foi sorte, não desenho.

---

## 4. ⚠️ Ponto que precisa de teste real

A resposta do `POST /links` (criação do Pix) **não está documentada** publicamente.
Os campos em `_shared/infinitepay.ts` cobrem as variações prováveis:

```ts
const url  = data.url ?? data.checkout_url ?? data.payment_url ?? data.link;
const slug = data.slug ?? data.invoice_slug ?? null;
```

**Faça uma cobrança de teste**, veja o JSON real no log da function e fixe os
campos certos. Se `url` não for encontrado, a function devolve
`CHECKOUT_RESPOSTA_SEM_URL` com o JSON no log — é ali que está a resposta.

Vale confirmar em **parcerias@cloudwalk.io**:

1. O `payment_check` atende InfiniteTap, ou só Checkout?
2. O webhook tem alguma forma de assinatura não documentada?
3. O `slug` é obrigatório no `payment_check` do Tap?

### Modo de teste

```bash
supabase secrets set INFINITEPAY_REQUIRE_PROVIDER_CHECK=false
```

> 🚨 Aceita o aviso como prova de pagamento. Só para validar navegação.
> **Nunca** com dinheiro real — é o buraco que a estrutura existe para fechar.

---

## 5. Limitação conhecida do Pix

O `payment_check` exige `transaction_nsu`, que **só existe depois** do pagamento
e chega pelo webhook. Ou seja: **quem confirma um Pix é sempre o webhook.**
O `payment-status` apenas lê o que o webhook gravou.

**Se o webhook não chegar, o Pix fica pendente mesmo tendo sido pago.**

Saída manual já implementada: o operador informa o NSU do comprovante e o
`payment-status` confere direto no provedor — passando pelas mesmas validações,
não é atalho. Falta só a tela para digitar isso (ver seção 7).

---

## 6. Ordem de implantação

Os `DROP POLICY` no fim de `20260916130000_payment_intents.sql` estão
**comentados** de propósito. Eles fecham o INSERT direto do app.

```
1. Publicar o app novo (com services/infinitepay.js)
2. Confirmar que as vendas estão passando pela Edge Function
3. SÓ ENTÃO descomentar os DROP POLICY e rodar db push
```

Inverter isso derruba a criação de pedidos em produção.

---

## 7. O que ficou de fora

- [ ] **Tela de pedidos pendentes** — para o caso do webhook não chegar. O backend
      já aceita (`payment-status` com `transactionNsu`); falta a interface.
- [ ] **Entrega por WhatsApp** — o `zapiService` foi removido junto com o
      `payments.js` (tinha token no cliente). Se quiser de volta, precisa virar
      Edge Function.
- [ ] **Parcelamento** — a estrutura aceita até 12x (`installments`), mas a tela
      sempre manda `1`. Falta o seletor.

---

## 8. Conferir se ficou seguro

```sql
-- Nenhuma linha deve voltar. Se voltar, o app escreve onde não devia.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and cmd in ('UPDATE','DELETE','ALL')
  and ('anon' = any(roles) or 'public' = any(roles));

-- payment_intents / payment_events: só SELECT para authenticated.
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('payment_intents','payment_events');
```

Depois do deploy, rode também o advisor de segurança do Supabase.
