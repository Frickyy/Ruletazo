import { locale } from "../i18n/index.js";

// Cuántas portadas van en la imagen para compartir.
const TOP_COVERS = 6;

/**
 * "Tu pila sin jugar": los juegos propios (no los de la familia) con 0 horas, sin programas ni
 * ocultos, y cuánto cuestan hoy en la tienda de Steam.
 *
 * El precio es el actual de la tienda en dólares (con el descuento del día, si hay), no lo que
 * pagaste: Steam no informa cuánto pagó cada persona. Los juegos que todavía no tienen precio
 * cargado (o ya no se venden) no suman, y `priced` dice cuántos se pudieron contar.
 */
export function backlogStats(games) {
  const own = games.filter((game) => game.source !== "friend" && !game.is_software);
  const unplayed = own.filter((game) => game.playtime_forever_minutes === 0 && !game.is_hidden);
  const priced = unplayed.filter((game) => Number.isFinite(game.price_cents));
  return {
    total: own.length,
    unplayed: unplayed.length,
    priced: priced.length,
    valueCents: priced.reduce((sum, game) => sum + game.price_cents, 0),
    // Los más caros primero, para la imagen.
    top: [...priced].sort((a, b) => b.price_cents - a.price_cents).slice(0, TOP_COVERS),
  };
}

/** US$ sin centavos, con los separadores del idioma elegido ("US$ 1.234" / "$1,234"). */
export function formatMoney(cents) {
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.round((cents ?? 0) / 100),
  );
}
