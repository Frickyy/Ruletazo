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
          <div className="site-footer__support">
            <p>
              <strong>¿Te sirve la ruleta?</strong> Es gratis y sin publicidad: si querés, podés ayudar a mantenerla.
            </p>
            <div className="site-footer__support-links">
              {supportLinks.map((link) => (
                <a key={link.url} className="button" href={link.url} target="_blank" rel="noopener noreferrer">
                  ♥ {link.name}
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

export default SiteFooter;
