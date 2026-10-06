# Credenciais pendentes — FotoBarco

Tudo que falta para o pagamento sair do papel. O código já está pronto nos dois
métodos (cartão por aproximação e Pix); o que falta é o que só a empresa tem.

> **Nenhum valor deste documento deve ser enviado por WhatsApp, e-mail comum ou
> colado em conversa.** São chaves de recebimento de dinheiro. Combine um canal
> seguro (cofre de senhas, ou presencialmente).

---

## 1. O que a empresa precisa informar

| # | Valor | Onde a empresa encontra | Usado para |
|---|---|---|---|
| 1 | **InfiniteTag** (sem o `@`) | App InfinitePay → Perfil → InfiniteTag | Identifica a conta que **recebe** o dinheiro. Vale para cartão e Pix. |
| 2 | **CNPJ ou CPF da conta InfinitePay** (só dígitos) | Documento cadastrado na conta InfinitePay | Conferido no retorno da cobrança, para garantir que a venda caiu na conta certa. |
| 3 | **E-mail do admin do painel** | Definido pela empresa | Login do painel e autorização para liberar um Pix na mão. |
| 4 | **Senha desse admin** | Definida pela empresa | Mesma coisa. Troque depois do primeiro acesso. |

Itens 1 e 2 são os que travam o sistema: sem eles as funções de pagamento nem
sobem.

---

## 2. O que eu configuro com isso

Nada disso vai para dentro do aplicativo. Tudo entra como *secret* do servidor,
que o tablet não consegue ler:

```bash
supabase secrets set INFINITEPAY_HANDLE=<InfiniteTag sem @>
supabase secrets set INFINITEPAY_DOC_NUMBER=<CNPJ só dígitos>
supabase secrets set APP_DEEPLINK_SCHEME=fotobarco
supabase secrets set ADMIN_EMAIL=<e-mail do admin>
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pela própria
plataforma — não precisam ser informados e não devem ir para o `.env`.

### Por que a credencial não entra no app

O aplicativo roda num tablet e qualquer pessoa que baixe o APK consegue
descompactá-lo e ler o que está lá dentro. Chave de pagamento dentro do app é
chave pública. Por isso ela vive no servidor, e o app só pede a cobrança.

---

## 3. Perguntas para a InfinitePay (parcerias@cloudwalk.io)

Três pontos que a documentação pública não responde e que valem confirmar antes
da primeira venda de verdade:

1. O `payment_check` atende InfiniteTap, ou só o Checkout?
2. O webhook tem alguma forma de assinatura não documentada?
3. O `slug` é obrigatório no `payment_check` do Tap?

---

## 4. Depois que as credenciais chegarem

Uma cobrança Pix de teste, de valor baixo, em produção. A resposta da
InfinitePay na criação do link não é documentada publicamente — o código cobre
as variações prováveis, mas só uma cobrança real mostra qual campo vem. É o
último ponto do Pix que não dá para fechar sem credencial.

---

## 5. Credenciais antigas que precisam ser revogadas

Ficaram no projeto do provedor anterior (EFI Bank), que não é mais usado:
`EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_PIX_KEY`. Se chegaram a valer em
produção, **revogue no painel da EFI** — credencial que passou por um
repositório deve ser tratada como exposta, mesmo que ninguém tenha usado.
