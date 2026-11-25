import { useState } from "react";
import { t } from "../i18n/index.js";
import FeedbackDialog from "./FeedbackDialog.jsx";
import "./SiteFooter.css";

/**
 * Pie de página: links para apoyar el proyecto (si están configurados), legales y el aviso de
 * que no hay relación con Valve (lo piden los términos de la Steam Web API).
 */
function SiteFooter({ config, onNavigate, user }) {
  const supportLinks = config?.support_links ?? [];
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        {supportLinks.length > 0 && (
          <div className="site-footer__support" id="apoyar">
            <div className="site-footer__support-text">
              <strong>{t("¿Te sirve la ruleta?")}</strong>
              <p>{t("Es gratis y sin publicidad. Si querés, invitame un cafecito para ayudar a mantenerla.")}</p>
            </div>
            <div className="site-footer__support-links">
              {supportLinks.map((link) => (
                <a key={link.url} className="button button--primary site-footer__donate" href={link.url} target="_blank" rel="noopener noreferrer">
                  <CupIcon />
                  {link.name}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="site-footer__feedback">
          <p>
            <strong>{t("¿Ideas o algo que no anda?")}</strong> {t("Contanos, leemos todo.")}
          </p>
          <button type="button" className="button site-footer__feedback-button" onClick={() => setFeedbackOpen(true)}>
            <ChatIcon />
            {t("Mandar comentario")}
          </button>
        </div>
        <nav className="site-footer__links" aria-label={t("Legales")}>
          <a href="/privacidad" onClick={(event) => { event.preventDefault(); onNavigate?.("privacy"); }}>{t("Privacidad")}</a>
          <a href="/terminos" onClick={(event) => { event.preventDefault(); onNavigate?.("terms"); }}>{t("Términos")}</a>
        </nav>
        <p className="site-footer__disclaimer">
          {t("Proyecto independiente, sin relación con Valve Corporation. Steam y el logo de Steam son marcas registradas de Valve Corporation. Datos de juegos con la Steam Web API.")}
        </p>
      </div>
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} user={user} />
    </footer>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm3 4.5h8M8 12.5h5" />
    </svg>
  );
}

function CupIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm12 1.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5" />
    </svg>
  );
}

export default SiteFooter;
