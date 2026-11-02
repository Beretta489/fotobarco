# Credenciais — FotoBarco

O que o pagamento precisa para funcionar: Pix pelo Efí Bank, e
crédito/débito/dinheiro recebidos pelo atendente, que libera as fotos com uma
senha.

> **Nenhum valor deste documento deve ser enviado por WhatsApp, e-mail comum ou
> colado em conversa.** São chaves de recebimento de dinheiro. Combine um canal
> seguro (cofre de senhas, ou presencialmente).

---

## 1. O que a empresa precisa informar

| # | Valor | Onde a empresa encontra | Usado para |
|---|---|---|---|
| 1 | **Senha do atendente** (6+ caracteres) | Definida pela empresa | Digitada no tablet para liberar as fotos de quem pagou com cartão ou dinheiro. |
| 2 | **E-mail do admin do painel** | Definido pela empresa | Login do painel e autorização para liberar um Pix na mão. |
| 3 | **Senha desse admin** | Definida pela empresa | Mesma coisa. Troque depois do primeiro acesso. |

As credenciais do Efí estão na seção 4.

---

## 2. O que eu configuro com isso

Nada disso vai para dentro do aplicativo. Tudo entra como *secret* do servidor,
que o tablet não consegue ler:

```bash
supabase secrets set ATTENDANT_PASSWORD=<senha do atendente>
supabase secrets set ADMIN_EMAIL=<e-mail do admin>
```

A senha do atendente **não** pode ir para o app: dentro do APK ela seria
legível por qualquer pessoa. Para trocá-la, basta rodar o `secrets set` de novo
— não precisa publicar app novo.

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pela própria
plataforma — não precisam ser informados e não devem ir para o `.env`.

### Por que a credencial não entra no app

O aplicativo roda num tablet e qualquer pessoa que baixe o APK consegue
descompactá-lo e ler o que está lá dentro. Chave de pagamento dentro do app é
chave pública. Por isso ela vive no servidor, e o app só pede a cobrança.

---

## 3. Credenciais antigas que precisam ser revogadas

Ficaram no projeto de uma integração EFI anterior, que rodava no app:
`EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_PIX_KEY`. Se chegaram a valer em
produção, **revogue no painel da EFI** — credencial que passou por um
repositório deve ser tratada como exposta, mesmo que ninguém tenha usado.

**Não reaproveite essas credenciais na integração nova.** Crie aplicação e
certificado novos (seção 4).

---

## 4. Pix pelo Efí Bank (no servidor)

Tudo fica nas Edge Functions; nada no app. Passo a passo completo, conversão do
certificado e roteiro de teste: **[EFI_SETUP.md](EFI_SETUP.md)**.

O que a empresa precisa fornecer, **por ambiente** (homologação e produção):

| Valor | Secret (homologação / produção) |
|---|---|
| Client ID | `EFI_HOMOLOG_CLIENT_ID` / `EFI_PROD_CLIENT_ID` |
| Client Secret | `EFI_HOMOLOG_CLIENT_SECRET` / `EFI_PROD_CLIENT_SECRET` |
| Chave Pix que recebe | `EFI_HOMOLOG_PIX_KEY` / `EFI_PROD_PIX_KEY` |
| Certificado `.p12` (vira dois PEMs em base64) | `EFI_*_CERT_PEM_B64` e `EFI_*_KEY_PEM_B64` |

Gerados por nós: `EFI_HOMOLOG_WEBHOOK_SECRET` / `EFI_PROD_WEBHOOK_SECRET`.
Ambiente: `EFI_ENV` (`homologacao` | `producao`).
