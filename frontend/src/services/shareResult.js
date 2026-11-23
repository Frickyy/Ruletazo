import { t } from "../i18n/index.js";
import { renderResultCard } from "./resultCard.js";

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
 * En el celular comparte una imagen tipo historia (portada + nombre) con el texto y el link; si el
 * navegador no puede compartir archivos, comparte solo el texto; en la compu copia texto y link.
 * Devuelve "shared", "copied" o "cancelled" para que la ficha muestre el aviso que corresponde.
 */
export async function shareResult(game, siteUrl = window.location.origin) {
  const data = buildShareText(game.name, siteUrl);
  if (navigator.share) {
    try {
      const files = await resultFiles(game);
      await navigator.share(files ? { ...data, files } : data);
      return "shared";
    } catch (error) {
      // Cerrar el menú de compartir no es un error para mostrar.
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(`${data.text} ${data.url}`);
  return "copied";
}

/** La imagen, solo si el navegador puede compartir archivos (si no, se comparte el texto). */
async function resultFiles(game) {
  if (!navigator.canShare) return null;
  try {
    const blob = await renderResultCard(game);
    const files = [new File([blob], `ruletazo-${game.appid}.png`, { type: "image/png" })];
    return navigator.canShare({ files }) ? files : null;
  } catch {
    return null;
  }
}
