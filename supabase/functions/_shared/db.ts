// =============================================================================
// ACESSO AO BANCO + TRILHA DE AUDITORIA
// =============================================================================
// Cliente com SERVICE ROLE: ignora RLS por design. Toda query feita aqui passa
// por cima de qualquer policy, entao cada funcao deste arquivo precisa validar
// sozinha o que esta fazendo -- nao ha rede de seguranca do banco embaixo.
// =============================================================================

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { config } from "./config.ts";

export function serviceClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// =============================================================================
// REDACAO DE DADOS SENSIVEIS
// =============================================================================
// Antes de gravar qualquer payload do provedor em payment_events, passe por
// aqui. Motivo: payment_events e legivel por qualquer admin logado, e um dump
// do banco nao pode conter dado de portador de cartao (PCI-DSS) nem telefone
// completo de cliente sem necessidade.
//
// Na duvida, remova. Auditoria precisa de nsu/aut/bandeira -- nunca do PAN.
// =============================================================================

const CAMPOS_PROIBIDOS = [
  "card_number", "pan", "cvv", "cvc", "security_code",
  "expiry", "exp_month", "exp_year", "cardholder_name",
  "token", "access_token", "api_key", "authorization",
  "password", "secret",
];

export function redact(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || typeof input !== "object") return input;

  if (Array.isArray(input)) return input.map((i) => redact(i, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = key.toLowerCase();

    if (CAMPOS_PROIBIDOS.some((proibido) => k.includes(proibido))) {
      out[key] = "[REDACTED]";
      continue;
    }

    // Telefone: guarda so os 4 ultimos digitos, o suficiente para conferir um
    // atendimento sem armazenar o contato completo de novo.
    if (k.includes("phone") && typeof value === "string") {
      out[key] = value.length > 4 ? `***${value.slice(-4)}` : "***";
      continue;
    }

    out[key] = redact(value, depth + 1);
  }
  return out;
}

// =============================================================================
// EVENTOS
// =============================================================================

export type EventType =
  | "intent_created"
  | "deeplink_opened"
  | "deeplink_returned"
  | "provider_checked"
  | "payment_confirmed"
  | "payment_failed"
  | "amount_mismatch"
  | "replay_blocked"
  | "rate_limited";

/**
 * Grava um evento de auditoria.
 *
 * Nunca lanca excecao: falha ao auditar nao pode derrubar uma venda em
 * andamento. O erro vai para o log da function, que e onde alguem olha depois.
 */
export async function logEvent(
  db: SupabaseClient,
  event: {
    type: EventType;
    intentId?: string | null;
    orderId?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  try {
    await db.from("payment_events").insert({
      payment_intent_id: event.intentId ?? null,
      order_id: event.orderId ?? null,
      event_type: event.type,
      payload: redact(event.payload ?? {}),
    });
  } catch (e) {
    console.error("[audit] falha ao gravar payment_event", event.type, e);
  }
}

// =============================================================================
// IDENTIFICADORES
// =============================================================================

/**
 * Gera o order_nsu que vai no deeplink.
 *
 * Aleatorio de 128 bits em vez do uuid do pedido: esse valor trafega por
 * deeplink, aparece em log do sistema operacional e pode ser lido por outros
 * apps instalados. Sendo aleatorio e de uso unico, saber um nsu nao revela nada
 * sobre os outros pedidos nem permite adivinhar o proximo.
 */
export function generateOrderNsu(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `FB${hex}`.toUpperCase();
}

/**
 * Token de download das fotos.
 *
 * 256 bits de entropia criptografica. Este token e a unica coisa entre um
 * link e as fotos pagas de um cliente -- Math.random() aqui seria previsivel e
 * permitiria enumerar pedidos alheios.
 */
export function generateDownloadToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
