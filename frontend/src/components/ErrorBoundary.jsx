import { Component } from "react";
import { t } from "../i18n/index.js";
import { track } from "../services/track.js";
import "./ErrorBoundary.css";

/**
 * Red de seguridad: si una parte de la página falla al dibujarse (por ejemplo, con un dato raro de
 * Steam), React borra toda la pantalla y queda en negro. Con esto se ve un aviso con un botón para
 * recargar, y el error se cuenta en las estadísticas de uso (sin nada de la persona: ver track.js).
 *
 * App la pone alrededor de cada sección (con key: al cambiar de sección se vuelve a intentar) y
 * main.jsx alrededor de todo, por si falla la barra de arriba o el pie de página.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("Ruletazo: algo falló al dibujar la página", error, info?.componentStack);
    track("ui_error");
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="error-boundary" role="alert">
        <h2>{t("Algo falló al mostrar esta parte de la página")}</h2>
        <p>{t("Recargá la página para seguir. Si vuelve a pasar, contanos qué estabas haciendo con «Mandar comentario», al pie de la página.")}</p>
        <button type="button" className="button button--primary" onClick={() => window.location.reload()}>
          {t("Recargar la página")}
        </button>
      </section>
    );
  }
}

export default ErrorBoundary;
