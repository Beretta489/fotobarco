// =============================================================================
// ESCOLHA DO PROVEDOR PIX
// =============================================================================
//   Cobranca NOVA      -> secret PIX_PROVIDER (efi | infinitepay)
//   Cobranca EXISTENTE -> o provedor/ambiente gravado no proprio intent
//
// A segunda regra importa na virada: um Pix criado na InfinitePay minutos antes
// de trocar o PIX_PROVIDER continua sendo conferido na InfinitePay.
// =============================================================================

import { config } from "../config.ts";
import { efiProvider, parseEfiEnv } from "./efi.ts";
import { infinitePayProvider } from "./infinitepay.ts";
import type { PixProvider } from "./types.ts";

export type { ChargeStatus, CreatedCharge, PixProvider, PixProviderName } from "./types.ts";

export function providerForNewCharge(): PixProvider {
  switch (config.pix.provider) {
    case "efi":
      return efiProvider(parseEfiEnv(config.pix.efiEnv));
    case "infinitepay":
      return infinitePayProvider;
    default:
      throw new Error(`CONFIG_INVALIDA: PIX_PROVIDER="${config.pix.provider}". Use "efi" ou "infinitepay".`);
  }
}

export function providerForIntent(
  intent: { provider?: string | null; provider_env?: string | null },
): PixProvider {
  if (intent.provider === "efi") {
    return efiProvider(parseEfiEnv(intent.provider_env ?? config.pix.efiEnv));
  }
  // null = intent anterior a esta migration: todos eram InfinitePay.
  return infinitePayProvider;
}
