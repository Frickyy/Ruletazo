import { t } from "../i18n/index.js";

/**
 * Texto para compartir el juego que salió en la ruleta. La idea es que quien lo recibe
 * entre a probar su propia biblioteca: por eso el link es a la página, no al juego.
 */
export function buildShareText(gameName, siteUrl) {
  return {
    title: "Ruletazo",
    text: t("Me tocó {name} en la ruleta de Ruletazo 🎰 ¿Qué te toca a vos?", { name: gameName }),
    url: siteUrl,
  };
}

/**
 * Comparte con el menú nativo del celular si existe; si no, copia el texto y el link.
 * Devuelve "shared", "copied" o "cancelled" para que la ficha muestre el aviso que corresponde.
 */
export async function shareResult(gameName, siteUrl = window.location.origin) {
  const data = buildShareText(gameName, siteUrl);
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      // Cerrar el menú de compartir no es un error para mostrar.
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(`${data.text} ${data.url}`);
  return "copied";
}
