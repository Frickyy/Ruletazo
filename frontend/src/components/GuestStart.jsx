import { useState } from "react";
import { t } from "../i18n/index.js";
import { track } from "../services/track.js";
import "./GuestStart.css";

/**
 * El paso que convierte: pegar el perfil de Steam para girar con tus juegos. Va pegado a la
 * ruleta de ejemplo (antes estaba al final de la página y en el celular casi nadie llegaba) y
 * en Biblioteca sin sesión, con otro texto (label, submitLabel).
 */
function GuestStart({ onGuest, onLogin, label, submitLabel }) {
  const [profileLink, setProfileLink] = useState("");

  return (
    <form
      className="guest-start"
      onSubmit={(event) => {
        event.preventDefault();
        if (!profileLink.trim()) return;
        track("guest_submit");
        onGuest(profileLink.trim());
      }}
    >
      <label className="guest-start__label" htmlFor="guest-start-profile">
        {label ?? t("¿Y con tus juegos? Pegá el link de tu perfil de Steam")}
      </label>
      <div className="guest-start__row">
        <input
          id="guest-start-profile"
          className="text-input"
          placeholder="steamcommunity.com/id/…"
          value={profileLink}
          onChange={(event) => setProfileLink(event.target.value)}
          autoComplete="off"
          inputMode="url"
        />
        <button type="submit" className="button button--primary" disabled={!profileLink.trim()}>
          {submitLabel ?? t("Girar con mi biblioteca")}
        </button>
      </div>
      {onLogin && (
        <p className="guest-start__hint">
          {t("El perfil tiene que ser público.")}{" "}
          <button type="button" className="text-button" onClick={onLogin}>
            {t("O iniciá sesión con Steam")}
          </button>
        </p>
      )}
    </form>
  );
}

export default GuestStart;
