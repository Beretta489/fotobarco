// =============================================================================
// payment-confirm -- DESATIVADA
// =============================================================================
// Era a confirmacao do InfiniteTap (cartao no proprio tablet), que saiu do
// sistema. Credito, debito e dinheiro agora sao liberados pelo atendente em
// payment-attendant-confirm.
//
// Fica no ar so como porta fechada: o codigo antigo publicado aqui ainda
// conseguia marcar pedidos como pagos. Pode ser apagada no painel do Supabase.
// =============================================================================

Deno.serve(() =>
  new Response(JSON.stringify({ ok: false, error: "ENDPOINT_DESATIVADO" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
