/** Armado de la tira del rodillo (sin React, para poder testearlo). */

/**
 * Con pocos juegos la tira los repite, y a veces quedaban dos portadas iguales pegadas.
 * Intercambia cada repetida con otra posición libre que no choque con sus vecinas.
 * `fixed` son posiciones que no se mueven (lo que ya se ve y el ganador).
 */
export function avoidAdjacentRepeats(cards, fixed = new Set()) {
  const result = [...cards];
  const same = (a, b) => a && b && a.appid === b.appid;
  const fits = (card, position) => !same(card, result[position - 1]) && !same(card, result[position + 1]);
  for (let i = 1; i < result.length; i += 1) {
    if (!same(result[i], result[i - 1])) continue;
    const toMove = fixed.has(i) ? i - 1 : i;
    if (fixed.has(toMove)) continue;
    for (let j = 0; j < result.length; j += 1) {
      if (j === toMove || fixed.has(j) || same(result[j], result[toMove])) continue;
      const a = result[toMove];
      const b = result[j];
      result[toMove] = b;
      result[j] = a;
      if (fits(b, toMove) && fits(a, j)) break;
      result[toMove] = a;
      result[j] = b;
    }
  }
  return result;
}

/** `count` juegos al azar de `pool`; si el pool es más chico, se repiten. */
export function sample(pool, count) {
  if (pool.length === 0) return [];
  const picked = [];
  while (picked.length < count) {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    picked.push(...shuffled);
  }
  return picked.slice(0, count);
}
