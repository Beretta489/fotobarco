// Catálogo de itens extras (bebidas e lembranças) vendidos no passeio.
// Para mudar preços ou adicionar/remover itens, edite apenas esta lista —
// a tela de Extras é gerada automaticamente a partir daqui.

export const EXTRAS_CATALOG = [
  {
    id: 'bebidas',
    title: 'Bebidas',
    icon: '🍹',
    items: [
      { id: 'agua-500', name: 'Água 500ml', price: 3.0, emoji: '💧' },
      { id: 'coca-lata', name: 'Coca lata', price: 6.0, emoji: '🥤' },
      { id: 'guarana-lata', name: 'Guaraná lata', price: 6.0, emoji: '🥤' },
      { id: 'amstel-lata', name: 'Cerveja Amstel lata', price: 6.0, emoji: '🍺' },
      { id: 'heineken-lata', name: 'Cerveja Heineken lata', price: 10.0, emoji: '🍺' },
    ],
  },
  {
    id: 'lembrancas',
    title: 'Lembranças',
    icon: '🐚',
    items: [
      { id: 'brincos-concha', name: 'Brincos concha', price: 35.0, emoji: '🐚' },
      { id: 'porta-caneta-ancora', name: 'Porta caneta âncora', price: 35.0, emoji: '⚓' },
      { id: 'porta-caneta-barco-tartaruga', name: 'Porta caneta barco/tartaruga', price: 35.0, emoji: '🐢' },
      { id: 'porta-caneta-conchas', name: 'Porta caneta conchas', price: 30.0, emoji: '🦪' },
    ],
  },
];

// Lookup achatado por id, útil para reidratar itens a partir do carrinho.
export const EXTRAS_BY_ID = EXTRAS_CATALOG.reduce((acc, cat) => {
  cat.items.forEach((item) => { acc[item.id] = item; });
  return acc;
}, {});

// Monta a lista de extras selecionados (com subtotal) a partir do mapa de quantidades.
export function buildExtras(quantities) {
  const extras = [];
  let extrasTotal = 0;
  EXTRAS_CATALOG.forEach((cat) => {
    cat.items.forEach((item) => {
      const quantity = quantities[item.id] || 0;
      if (quantity > 0) {
        const subtotal = Math.round(item.price * quantity * 100) / 100;
        extras.push({
          id: item.id,
          name: item.name,
          unit_price: item.price,
          quantity,
          subtotal,
        });
        extrasTotal += subtotal;
      }
    });
  });
  return { extras, extrasTotal: Math.round(extrasTotal * 100) / 100 };
}
