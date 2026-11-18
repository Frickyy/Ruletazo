import "./SiteFooter.css";

/**
 * Pie de página: links para apoyar el proyecto (si están configurados), legales y el aviso de
 * que no hay relación con Valve (lo piden los términos de la Steam Web API).
 */
function SiteFooter({ config, onNavigate }) {
  const supportLinks = config?.support_links ?? [];
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        {supportLinks.length > 0 && (
          <div className="site-footer__support" id="apoyar">
            <div className="site-footer__support-text">
              <strong>¿Te sirve la ruleta?</strong>
              <p>Es gratis y sin publicidad. Si querés, invitame un cafecito para ayudar a mantenerla.</p>
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
        <nav className="site-footer__links" aria-label="Legales">
          <a href="#/privacidad" onClick={(event) => { event.preventDefault(); onNavigate?.("privacy"); }}>Privacidad</a>
          <a href="#/terminos" onClick={(event) => { event.preventDefault(); onNavigate?.("terms"); }}>Términos</a>
        </nav>
        <p className="site-footer__disclaimer">
          Proyecto independiente, sin relación con Valve Corporation. Steam y el logo de Steam son marcas registradas de Valve
          Corporation. Datos de juegos con la Steam Web API.
        </p>
      </div>
    </footer>
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
