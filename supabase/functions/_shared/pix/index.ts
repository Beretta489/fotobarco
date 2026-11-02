// =============================================================================
// ESCOLHA DO PROVEDOR PIX
// =============================================================================
//   Cobranca NOVA      -> Efi, no ambiente do secret EFI_ENV
//   Cobranca EXISTENTE -> o ambiente gravado no proprio intent
//
// A segunda regra importa na virada homologacao -> producao: um Pix criado em
// homologacao minutos antes de trocar o EFI_ENV continua sendo conferido la.
// =============================================================================

import { config } from "../config.ts";
import { efiProvider, parseEfiEnv } from "./efi.ts";
import type { PixProvider } from "./types.ts";

export type { ChargeStatus, CreatedCharge, PixProvider, PixProviderName } from "./types.ts";

export function providerForNewCharge(): PixProvider {
  return efiProvider(parseEfiEnv(config.pix.efiEnv));
}

/**
 * Provedor de um intent ja gravado, ou null se o intent nao tiver cobranca no
 * Efi (credito/debito/dinheiro, ou registro antigo de outro provedor).
 */
export function providerForIntent(
  intent: { provider?: string | null; provider_env?: string | null },
): PixProvider | null {
  if (intent.provider !== "efi") return null;
  return efiProvider(parseEfiEnv(intent.provider_env ?? config.pix.efiEnv));
}
