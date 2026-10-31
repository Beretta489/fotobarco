// =============================================================================
// CONTRATO DO PROVEDOR PIX
// =============================================================================
// Tudo que o resto do sistema sabe sobre "quem gera e confirma o Pix" passa por
// esta interface. Trocar de provedor = escrever outro arquivo ao lado de efi.ts
// e infinitepay.ts e registra-lo em index.ts. Nenhuma Edge Function importa um
// provedor direto.
// =============================================================================

export type PixProviderName = "efi" | "infinitepay";

export interface CreateChargeInput {
  /**
   * Identificador da cobranca no provedor. Usamos o proprio order_nsu
   * ("FB" + 32 hex = 34 caracteres alfanumericos), que ja cabe na regra do
   * txid do Pix (26 a 35 caracteres [a-zA-Z0-9]).
   */
  txid: string;
  amountCents: number;
  expiresInSeconds: number;
  description: string;
  clientPhone?: string | null;
}

export interface CreatedCharge {
  provider: PixProviderName;
  /** Ambiente do provedor ('homologacao' | 'producao'), quando existir. */
  env: string | null;
  /** BR Code (Pix copia e cola). E ele que vira o QR Code no tablet. */
  copiaECola: string | null;
  /** URL de checkout, para provedores baseados em link (InfinitePay). */
  checkoutUrl: string | null;
  invoiceSlug: string | null;
  locId: string | null;
  providerStatus: string | null;
}

export interface ChargeStatus {
  /** true so quando o provedor diz que a cobranca foi paga. */
  paid: boolean;
  /**
   * true = a cobranca morreu no provedor (removida, cancelada) e nunca mais
   * vai ser paga. Diferente de "ainda nao pagou".
   */
  final: boolean;
  /** Valor ORIGINAL da cobranca, em centavos. */
  amountCents: number | null;
  /** Valor efetivamente recebido, em centavos. */
  paidAmountCents: number | null;
  /** Identificador unico do pagamento (endToEndId no Pix). */
  paymentId: string | null;
  providerStatus: string | null;
  /** Resumo para auditoria -- sem dados pessoais do pagador. */
  audit: Record<string, unknown>;
}

export interface PixProvider {
  readonly name: PixProviderName;
  readonly env: string | null;

  createCharge(input: CreateChargeInput): Promise<CreatedCharge>;

  /**
   * Consulta a cobranca pelo txid. Provedores que implementam isto sao
   * confirmados por confirmByCharge() (fonte da verdade = o provedor, sem
   * precisar de NSU vindo de fora). Quem nao implementa cai no fluxo legado
   * da InfinitePay, que depende do transaction_nsu entregue pelo webhook.
   *
   * Erro de rede / 5xx LANCA excecao (vira "tente de novo"); cobranca
   * inexistente devolve paid=false.
   */
  checkCharge?(txid: string): Promise<ChargeStatus>;
}
