import { useEffect, useRef, useState } from "react";
import { t } from "../i18n/index.js";
import { sendFeedback } from "../services/feedbackService.js";
import "./FeedbackDialog.css";

const MAX_LENGTH = 2000;
const KINDS = [
  { id: "idea", label: () => t("Idea") },
  { id: "bug", label: () => t("Algo no anda") },
  { id: "other", label: () => t("Otra cosa") },
];

/**
 * Ventana para mandar comentarios. Usa <dialog> nativo: atrapa el foco, se cierra con Esc y
 * deja el resto de la página inactiva mientras está abierta.
 */
function FeedbackDialog({ open, onClose, user }) {
  const dialogRef = useRef(null);
  const [kind, setKind] = useState("idea");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // campo trampa para bots, invisible
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => dialogRef.current?.close();

  function handleClose() {
    if (status === "sent") {
      setMessage("");
      setKind("idea");
      setStatus("idle");
    }
    setError("");
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (message.trim().length < 5) {
      setError(t("Escribí un poco más (al menos 5 caracteres)."));
      return;
    }
    setStatus("sending");
    setError("");
    try {
      await sendFeedback({ kind, message: message.trim(), website });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : t("No se pudo enviar. Probá de nuevo en un rato."));
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="feedback"
      aria-labelledby="feedback-title"
      onClose={handleClose}
      onClick={(event) => {
        // Clic en el fondo oscuro (fuera de la caja): cierra.
        if (event.target === dialogRef.current) close();
      }}
    >
      <div className="feedback__box">
        <header className="feedback__header">
          <h2 id="feedback-title">{t("Mandanos tu comentario")}</h2>
          <button type="button" className="feedback__close" onClick={close} aria-label={t("Cerrar")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {status === "sent" ? (
          <div className="feedback__sent" role="status">
            <p className="feedback__sent-title">{t("¡Gracias! Lo recibimos.")}</p>
            <p className="hint">{t("Leemos todo lo que llega.")}</p>
            <button type="button" className="button button--primary" onClick={close}>
              {t("Listo")}
            </button>
          </div>
        ) : (
          <form className="feedback__form" onSubmit={handleSubmit} noValidate>
            <p className="hint">{t("Ideas, cosas que no andan, juegos mal clasificados o lo que quieras contarnos.")}</p>

            <fieldset className="feedback__kinds">
              <legend className="visually-hidden">{t("Tipo de comentario")}</legend>
              {KINDS.map((option) => (
                <label key={option.id} className={`feedback__kind${kind === option.id ? " feedback__kind--active" : ""}`}>
                  <input type="radio" name="feedback-kind" value={option.id} checked={kind === option.id} onChange={() => setKind(option.id)} />
                  {option.label()}
                </label>
              ))}
            </fieldset>

            <label className="feedback__field">
              <span>{t("Tu comentario")}</span>
              <textarea
                className="text-input feedback__textarea"
                rows={6}
                maxLength={MAX_LENGTH}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={kind === "bug" ? t("¿Qué pasó y en qué parte de la página?") : t("Contanos…")}
                required
              />
              <span className="feedback__count mono" aria-hidden="true">
                {message.length}/{MAX_LENGTH}
              </span>
            </label>

            <p className="feedback__sender">
              {user?.name ? (
                <>
                  {user.avatar ? <img src={user.avatar} alt="" /> : <span className="feedback__avatar" aria-hidden="true" />}
                  <span>
                    {t("Se envía como")} <strong>{user.name}</strong>
                  </span>
                </>
              ) : (
                <span>{t("Se envía como anónimo. Iniciá sesión con Steam para que sepamos quién sos.")}</span>
              )}
            </p>

            <label className="feedback__trap" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </label>

            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}

            <div className="feedback__actions">
              <button type="button" className="button" onClick={close}>
                {t("Cancelar")}
              </button>
              <button type="submit" className="button button--primary" disabled={status === "sending"}>
                {status === "sending" ? t("Enviando…") : t("Enviar")}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

export default FeedbackDialog;
