import { useState } from "react";
import { t } from "../i18n/index.js";
import "./PrivateLibraryHelp.css";

// Página de privacidad del perfil de quien tenga la sesión de Steam abierta en el navegador.
export const STEAM_PRIVACY_URL = "https://steamcommunity.com/my/edit/settings";

/**
 * Steam oculta los juegos de un perfil hasta que su dueño hace públicos los "Detalles de los
 * juegos" (en muchas cuentas vienen privados). Sin estos pasos, el error era un callejón sin salida.
 * `isOwn`: la biblioteca es de quien inició sesión (si no, es un perfil pegado como invitado).
 */
function PrivateLibraryHelp({ isOwn = false, onRetry, onChangeProfile }) {
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await onRetry?.();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <section className="private-help" role="alert" aria-labelledby="private-help-title">
      <h2 id="private-help-title">{isOwn ? t("Tu biblioteca de Steam es privada") : t("Esta biblioteca de Steam es privada")}</h2>
      <p>{t("Steam no muestra los juegos de un perfil hasta que su dueño los hace públicos. Son tres pasos:")}</p>
      <ol className="private-help__steps">
        <li>
          {t("Abrí la configuración de privacidad de tu perfil de Steam.")}{" "}
          <a href={STEAM_PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            {t("Abrir la configuración ↗")}
          </a>
        </li>
        <li>{t("En “Mi perfil” y en “Detalles de los juegos”, elegí “Público”.")}</li>
        <li>{t("Volvé acá y tocá “Probar de nuevo”. Steam puede tardar unos minutos en aplicar el cambio.")}</li>
      </ol>
      <p className="hint">{t("Si dejás marcada la casilla que mantiene privado tu tiempo de juego, tus juegos van a figurar sin horas jugadas.")}</p>
      <div className="private-help__actions">
        <button type="button" className="button button--primary" onClick={retry} disabled={retrying}>
          {retrying ? t("Probando…") : t("Probar de nuevo")}
        </button>
        {onChangeProfile && (
          <button type="button" className="text-button" onClick={onChangeProfile}>
            {t("Probar con otro perfil")}
          </button>
        )}
      </div>
    </section>
  );
}

export default PrivateLibraryHelp;
