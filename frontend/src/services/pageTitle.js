import { useEffect } from "react";
import { t } from "../i18n/index.js";

/**
 * Título de la pestaña, del historial y del resultado en Google: "Biblioteca · Ruletazo". Sin
 * sección, el de la portada (el mismo que trae index.html, para que no cambie al cargar).
 */
export function pageTitle(section = "") {
  return section ? `${section} · Ruletazo` : t("Ruletazo · ¿Qué jugar? La ruleta de tu biblioteca de Steam");
}

/**
 * Pone el título mientras la sección está abierta (y lo actualiza si cambia el idioma o llega el
 * nombre del juego). Con `enabled` en false no lo toca: lo pone la página que esté abierta.
 */
export function usePageTitle(section = "", enabled = true) {
  const title = pageTitle(section);
  useEffect(() => {
    if (enabled) document.title = title;
  }, [title, enabled]);
}
