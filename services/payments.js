import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};

const EFI_CLIENT_ID = extra.efiClientId;
const EFI_CLIENT_SECRET = extra.efiClientSecret;
const EFI_PIX_KEY = extra.efiPixKey;
const EFI_SANDBOX = String(extra.efiSandbox ?? 'true') === 'true';
const EFI_BASE_URL = EFI_SANDBOX
  ? 'https://pix-h.api.efipay.com.br'
  : 'https://pix.api.efipay.com.br';

const INFINITIPAY_API_KEY = extra.infinitiPayApiKey;
const INFINITIPAY_BASE_URL = 'https://api.infinitipay.io';

const ZAPI_INSTANCE_ID = extra.zapiInstanceId;
const ZAPI_TOKEN = extra.zapiToken;
const ZAPI_CLIENT_TOKEN = extra.zapiClientToken;
const ZAPI_BASE_URL = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

function base64Encode(input) {
  if (typeof btoa === 'function') return btoa(input);
  return Buffer.from(input, 'utf-8').toString('base64');
}

function buildTxid(orderId) {
  return orderId.replace(/-/g, '').substring(0, 26).toLowerCase();
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getEfiAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt > now + 30_000) {
    return cachedToken;
  }
  const basic = base64Encode(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`);
  const res = await fetch(`${EFI_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=cob.write%20cob.read%20pix.read',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`EFI auth failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  const ttl = Number(data.expires_in || 3600) * 1000;
  cachedTokenExpiresAt = now + ttl;
  return cachedToken;
}

export const efiService = {
  async getAccessToken() {
    return getEfiAccessToken();
  },

  async createCharge(orderId, total, clientPhone) {
    const token = await getEfiAccessToken();
    const txid = buildTxid(orderId);
    const valor = Number(total).toFixed(2);

    const body = {
      calendario: { expiracao: 600 },
      valor: { original: valor },
      chave: EFI_PIX_KEY,
      solicitacaoPagador: `Pedido ${orderId.substring(0, 8)} - Jangalancha Show`,
      infoAdicionais: [
        { nome: 'Pedido', valor: orderId },
        { nome: 'Telefone', valor: clientPhone || '' },
      ],
    };

    const res = await fetch(`${EFI_BASE_URL}/v2/cob/${txid}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`EFI createCharge failed (${res.status}): ${txt}`);
    }
    const data = await res.json();

    const locId = data?.loc?.id;
    let qrcodeImage = null;
    let copyPaste = data?.pixCopiaECola || null;

    if (locId) {
      try {
        const qrRes = await fetch(`${EFI_BASE_URL}/v2/loc/${locId}/qrcode`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (qrRes.ok) {
          const qrData = await qrRes.json();
          qrcodeImage = qrData.imagemQrcode || null;
          copyPaste = copyPaste || qrData.qrcode || null;
        }
      } catch (_) {}
    }

    const expiracao = Number(data?.calendario?.expiracao || 600);
    const criacao = data?.calendario?.criacao
      ? new Date(data.calendario.criacao).getTime()
      : Date.now();
    const expiresAt = criacao + expiracao * 1000;

    return {
      txid: data?.txid || txid,
      qrcodeImage,
      copyPaste,
      expiresAt,
      status: data?.status || 'ATIVA',
    };
  },

  async getChargeStatus(txid) {
    const token = await getEfiAccessToken();
    const res = await fetch(`${EFI_BASE_URL}/v2/cob/${txid}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`EFI getChargeStatus failed (${res.status}): ${txt}`);
    }
    const data = await res.json();
    return {
      status: data?.status || 'ATIVA',
      raw: data,
    };
  },
};

export const infinitiPayService = {
  async createPaymentLink(orderId, total, description) {
    const body = {
      reference_id: orderId,
      amount: Math.round(Number(total) * 100),
      currency: 'BRL',
      description: description || `Pedido ${orderId.substring(0, 8)} - Jangalancha Show`,
      payment_methods: ['credit_card'],
      metadata: { order_id: orderId },
    };

    const res = await fetch(`${INFINITIPAY_BASE_URL}/v1/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${INFINITIPAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`InfinitiPay createPaymentLink failed (${res.status}): ${txt}`);
    }
    const data = await res.json();
    return {
      id: data?.id,
      url: data?.url || data?.payment_url || data?.checkout_url,
      status: data?.status || 'pending',
      raw: data,
    };
  },

  async getPaymentStatus(linkId) {
    const res = await fetch(`${INFINITIPAY_BASE_URL}/v1/payment_links/${linkId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${INFINITIPAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`InfinitiPay getPaymentStatus failed (${res.status}): ${txt}`);
    }
    const data = await res.json();
    return {
      status: data?.status || 'pending',
      raw: data,
    };
  },
};

function normalizeBrPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

export const zapiService = {
  async sendPaymentLink(phone, link, total) {
    const message =
      `🐬 Jangalancha Show\n\n` +
      `Seu link de pagamento (R$ ${Number(total).toFixed(2)}):\n${link}\n\n` +
      `Após o pagamento, suas fotos serão liberadas automaticamente. ✨`;
    const body = {
      phone: normalizeBrPhone(phone),
      message,
    };
    const res = await fetch(`${ZAPI_BASE_URL}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_CLIENT_TOKEN || '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Z-API sendPaymentLink failed (${res.status}): ${txt}`);
    }
    return await res.json().catch(() => ({}));
  },
};
