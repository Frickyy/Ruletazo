import { useEffect, useRef, useState } from "react";
import { getLang, t } from "../i18n/index.js";
import { usePageTitle } from "../services/pageTitle.js";
import { overlayUrl, steamIdFromInput } from "../services/streamerOverlay.js";
import "./StreamerPage.css";

/**
 * /obs: cómo poner la ruleta en un stream. Arma la dirección de la superposición (ver
 * StreamerOverlay) con el perfil y las opciones, y la muestra en vivo para probarla.
 */
function StreamerPage({ defaultProfile = "" }) {
  usePageTitle(t("Modo streamer"));
  const [profile, setProfile] = useState(defaultProfile);
  const [filter, setFilter] = useState("todos");
  const [background, setBackground] = useState("transparente");
  const [sound, setSound] = useState(true);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef(null);
  // La vista previa pide la biblioteca: se actualiza cuando se deja de escribir, no con cada tecla.
  const [previewProfile, setPreviewProfile] = useState(steamIdFromInput(defaultProfile));

  useEffect(() => {
    const timer = setTimeout(() => setPreviewProfile(steamIdFromInput(profile)), 900);
    return () => clearTimeout(timer);
  }, [profile]);

  useEffect(() => setCopied(false), [profile, filter, background, sound]);

  const origin = window.location.origin;
  const hasProfile = Boolean(steamIdFromInput(profile));
  const lang = getLang();
  const url = overlayUrl(origin, { profile, filter, background, sound, lang });
  const previewUrl = overlayUrl(origin, { profile: previewProfile, demo: !previewProfile, filter, background, sound, lang });

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    } catch {
      /* sin permiso para el portapapeles: se copia seleccionando el texto */
    }
    urlRef.current?.select();
    try {
      setCopied(document.execCommand("copy"));
    } catch {
      setCopied(false); // queda seleccionada, para copiarla a mano
    }
  }

  return (
    <article className="streamer" aria-labelledby="streamer-title">
      <p className="eyebrow">{t("Modo streamer")}</p>
      <h1 id="streamer-title">{t("La ruleta en tu stream")}</h1>
      <p className="streamer__lead">
        {t("Una fuente de navegador para OBS con la ruleta de tu biblioteca de Steam: fondo transparente, el juego que salga y nada más. Gratis, como el resto de la página.")}
      </p>

      <div className="streamer__layout">
        <form className="streamer__form" onSubmit={(event) => event.preventDefault()}>
          <label className="streamer__field">
            <span>{t("Tu perfil de Steam")}</span>
            <input
              className="text-input"
              placeholder="steamcommunity.com/id/…"
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
              autoComplete="off"
              inputMode="url"
            />
          </label>
          <label className="streamer__field">
            <span>{t("Qué juegos entran")}</span>
            <select className="select" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="todos">{t("Toda la biblioteca")}</option>
              <option value="sin-jugar">{t("Solo los que nunca jugaste")}</option>
              <option value="menos-2h">{t("Menos de 2 h jugadas")}</option>
            </select>
          </label>
          <label className="streamer__field">
            <span>{t("Fondo")}</span>
            <select className="select" value={background} onChange={(event) => setBackground(event.target.value)}>
              <option value="transparente">{t("Transparente (fuente de navegador)")}</option>
              <option value="verde">{t("Verde (para recortar con croma)")}</option>
              <option value="oscuro">{t("Oscuro")}</option>
            </select>
          </label>
          <label className="streamer__check">
            <input type="checkbox" checked={sound} onChange={(event) => setSound(event.target.checked)} />
            <span>{t("Con sonido")}</span>
          </label>

          <div className="streamer__url">
            <span>{t("Tu dirección para OBS")}</span>
            {hasProfile ? (
              <div className="streamer__url-row">
                <input ref={urlRef} className="text-input" readOnly value={url} onFocus={(event) => event.target.select()} aria-label={t("Tu dirección para OBS")} />
                <button type="button" className="button button--primary" onClick={copy}>
                  {copied ? t("Copiada") : t("Copiar")}
                </button>
              </div>
            ) : (
              <p className="muted">{t("Pegá tu perfil para armar tu dirección. Mientras tanto, la vista previa usa la biblioteca de ejemplo.")}</p>
            )}
          </div>
        </form>

        <div className="streamer__preview">
          <span className="muted">{t("Vista previa (tocala para girar)")}</span>
          <div className="streamer__frame">
            <iframe key={previewUrl} title={t("Vista previa del modo streamer")} src={previewUrl} loading="lazy" />
          </div>
        </div>
      </div>

      <h2>{t("Cómo ponerla en OBS")}</h2>
      <ol className="streamer__steps">
        <li>{t("En OBS, en Fuentes, tocá + y elegí «Navegador».")}</li>
        <li>{t("Pegá la dirección y poné 800 de ancho y 450 de alto.")}</li>
        <li>{t("Para girar: clic derecho en la fuente → «Interactuar», y tocá la ruleta o apretá la barra espaciadora.")}</li>
        <li>{t("¿Usás captura de ventana? Abrí la dirección en el navegador con fondo verde y recortalo con el filtro «Clave cromática».")}</li>
      </ol>
      <p className="muted">
        {t("Nunca salen juegos +18 ni programas, y los últimos que salieron no se repiten enseguida. El perfil y los «Detalles de juegos» tienen que ser públicos en Steam.")}
      </p>
    </article>
  );
}

export default StreamerPage;
