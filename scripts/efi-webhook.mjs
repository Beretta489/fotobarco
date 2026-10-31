#!/usr/bin/env node
// =============================================================================
// efi-webhook.mjs -- testa as credenciais e cadastra o webhook Pix no Efi
// =============================================================================
// Roda NA SUA MAQUINA, nunca no app nem no servidor. Sem dependencias (so o
// https do Node). Usa os PEMs gerados em EFI_SETUP.md, secao 2.
//
// Uso (Node 20+), com um arquivo de variaveis FORA do repositorio:
//
//   node --env-file=C:/Users/<voce>/efi-certs/homologacao.env scripts/efi-webhook.mjs token
//   node --env-file=...                                       scripts/efi-webhook.mjs set
//   node --env-file=...                                       scripts/efi-webhook.mjs get
//   node --env-file=...                                       scripts/efi-webhook.mjs cob-teste
//
//   token     -> so pede o token OAuth (prova que certificado + client id/secret batem)
//   set       -> PUT /v2/webhook/:chave com x-skip-mtls-checking: true
//   get       -> mostra o webhook cadastrado para a chave (URL com o segredo mascarado)
//   cob-teste -> cria uma cobranca de R$ 0,01 e mostra o copia e cola (so homologacao)
//
// Variaveis do arquivo (ver EFI_SETUP.md):
//   EFI_ENV=homologacao | producao
//   EFI_CLIENT_ID=...            EFI_CLIENT_SECRET=...
//   EFI_PIX_KEY=...              (a chave Pix cadastrada na conta Efi)
//   EFI_CERT_PEM=C:/.../efi-cert.pem
//   EFI_KEY_PEM=C:/.../efi-key.pem
//   EFI_WEBHOOK_SECRET=...       (o MESMO valor do secret EFI_<AMB>_WEBHOOK_SECRET)
//   SUPABASE_URL=https://<ref>.supabase.co
// =============================================================================

import { readFileSync } from "node:fs";
import { request } from "node:https";
import { randomBytes } from "node:crypto";

const BASE = {
  homologacao: "pix-h.api.efipay.com.br",
  producao: "pix.api.efipay.com.br",
};

function need(name) {
  const v = process.env[name]?.trim();
  if (!v) { console.error(`Faltou ${name} no arquivo --env-file.`); process.exit(1); }
  return v;
}

const env = need("EFI_ENV");
if (!BASE[env]) { console.error('EFI_ENV deve ser "homologacao" ou "producao".'); process.exit(1); }

const tls = {
  cert: readFileSync(need("EFI_CERT_PEM")),
  key: readFileSync(need("EFI_KEY_PEM")),
};

function call(method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      host: BASE[env], path, method, ...tls,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers,
      },
      timeout: 20_000,
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch { json = { raw: data.slice(0, 300) }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function token() {
  const basic = Buffer.from(`${need("EFI_CLIENT_ID")}:${need("EFI_CLIENT_SECRET")}`).toString("base64");
  const r = await call("POST", "/oauth/token", {
    body: { grant_type: "client_credentials" },
    headers: { Authorization: `Basic ${basic}` },
  });
  if (r.status !== 200 || !r.json?.access_token) {
    console.error(`Falha no token (HTTP ${r.status}):`, r.json);
    process.exit(1);
  }
  return r.json;
}

function webhookUrl() {
  const base = need("SUPABASE_URL").replace(/\/+$/, "");
  const secret = encodeURIComponent(need("EFI_WEBHOOK_SECRET"));
  // ignorar= impede o Efi de acrescentar "/pix" ao final do caminho.
  return `${base}/functions/v1/payment-webhook?env=${env}&hmac=${secret}&ignorar=`;
}

const mascarar = (s) => String(s ?? "").replace(/hmac=[^&]+/, "hmac=***");

const cmd = process.argv[2];
const chave = encodeURIComponent(process.env.EFI_PIX_KEY?.trim() ?? "");

try {
  if (cmd === "token") {
    const t = await token();
    console.log(`OK (${env}): token emitido, expira em ${t.expires_in}s. Escopos: ${t.scope}`);
  } else if (cmd === "set") {
    need("EFI_PIX_KEY");
    const t = await token();
    const r = await call("PUT", `/v2/webhook/${chave}`, {
      body: { webhookUrl: webhookUrl() },
      headers: { Authorization: `Bearer ${t.access_token}`, "x-skip-mtls-checking": "true" },
    });
    console.log(`PUT /v2/webhook -> HTTP ${r.status}`, r.json ? mascarar(JSON.stringify(r.json)) : "");
    if (r.status >= 300) process.exit(1);
  } else if (cmd === "get") {
    need("EFI_PIX_KEY");
    const t = await token();
    const r = await call("GET", `/v2/webhook/${chave}`, {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    console.log(`GET /v2/webhook -> HTTP ${r.status}`, mascarar(JSON.stringify(r.json)));
  } else if (cmd === "cob-teste") {
    if (env !== "homologacao") { console.error("cob-teste so roda em homologacao."); process.exit(1); }
    need("EFI_PIX_KEY");
    const t = await token();
    const txid = `FBTESTE${randomBytes(12).toString("hex").toUpperCase()}`;
    const r = await call("PUT", `/v2/cob/${txid}`, {
      body: {
        calendario: { expiracao: 900 },
        valor: { original: "0.01" },
        chave: process.env.EFI_PIX_KEY.trim(),
        solicitacaoPagador: "Teste FotoBarco",
      },
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    console.log(`PUT /v2/cob/${txid} -> HTTP ${r.status}`);
    console.log(JSON.stringify({ status: r.json?.status, pixCopiaECola: r.json?.pixCopiaECola, erro: r.json?.mensagem }, null, 2));
  } else {
    console.log("Uso: node --env-file=<arquivo> scripts/efi-webhook.mjs token|set|get|cob-teste");
    process.exit(1);
  }
} catch (e) {
  console.error("Erro:", e.message);
  process.exit(1);
}
