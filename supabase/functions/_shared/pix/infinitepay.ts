// =============================================================================
// PROVEDOR PIX -- InfinitePay (Checkout por link) -- LEGADO
// =============================================================================
// Adaptador fino sobre ../infinitepay.ts, que continua intacto. Mantido para
// voltar atras com um secret (PIX_PROVIDER=infinitepay) enquanto o Efi nao e
// validado em producao.
//
// Nao implementa checkCharge(): a InfinitePay so confere um pagamento com o
// transaction_nsu entregue pelo webhook, entao a confirmacao segue pelo fluxo
// legado de confirmIntent().
// =============================================================================

import { createCheckoutLink } from "../infinitepay.ts";
import type { CreateChargeInput, CreatedCharge, PixProvider } from "./types.ts";

export const infinitePayProvider: PixProvider = {
  name: "infinitepay",
  env: null,

  async createCharge(input: CreateChargeInput): Promise<CreatedCharge> {
    const link = await createCheckoutLink({
      orderNsu: input.txid,
      amountCents: input.amountCents,
      description: input.description,
      clientPhone: input.clientPhone,
    });
    return {
      provider: "infinitepay",
      env: null,
      copiaECola: null,
      checkoutUrl: link.url,
      invoiceSlug: link.slug,
      locId: null,
      providerStatus: null,
    };
  },
};
