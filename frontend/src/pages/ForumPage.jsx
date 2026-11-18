import { useEffect, useState } from "react";
import {
  createForumThread,
  deleteForumPost,
  deleteForumReview,
  deleteForumReviewById,
  deleteForumThread,
  dismissForumReports,
  fetchForumGame,
  fetchForumReports,
  fetchForumReviews,
  fetchForumThread,
  fetchForumThreads,
  fetchRecentActivity,
  forumErrorMessage,
  replyToForumThread,
  reportForumMessage,
  saveForumReview,
  searchForumGames,
} from "../services/forumService.js";
import "./ForumPage.css";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Foro: buscador de juegos, reseñas con puntaje del 1 al 10 y discusiones.
 * `target` decide la vista: null → portada; { appid } → juego; { appid, threadId } → hilo.
 */
function ForumPage({ target, onTargetChange, viewer, onLogin }) {
  if (target?.threadId) {
    return <ForumThreadView target={target} onTargetChange={onTargetChange} viewer={viewer} onLogin={onLogin} />;
  }
  if (target?.appid) {
    return <ForumGameView target={target} onTargetChange={onTargetChange} viewer={viewer} onLogin={onLogin} />;
  }
  return <ForumHome onTargetChange={onTargetChange} viewer={viewer} />;
}

// ---------- Portada: buscador + actividad reciente ----------

function ForumHome({ onTargetChange, viewer }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    fetchRecentActivity().then(setActivity).catch(() => setActivity([]));
  }, []);

  async function handleSearch(event) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    setSearching(true);
    setSearchError("");
    try {
      setResults(await searchForumGames(term));
    } catch (err) {
      setSearchError(forumErrorMessage(err, "No se pudo buscar."));
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="forum" aria-labelledby="forum-title">
      <div className="forum__heading">
        <p className="eyebrow">Foro</p>
        <h1 id="forum-title">Hablemos de juegos</h1>
        <p className="hint">Buscá cualquier juego de Steam para reseñarlo con un puntaje del 1 al 10 o abrir una discusión.</p>
      </div>

      <form className="forum-search" role="search" onSubmit={handleSearch}>
        <label htmlFor="forum-search" className="visually-hidden">Buscar un juego</label>
        <input
          id="forum-search"
          className="text-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar un juego: Hollow Knight, Portal 2…"
          autoComplete="off"
        />
        <button type="submit" className="button button--primary" disabled={searching || query.trim().length < 2}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {searchError && <p className="error-text">{searchError}</p>}
      {results && results.length === 0 && <p className="hint">No encontramos juegos con ese nombre.</p>}
      {results && results.length > 0 && (
        <ul className="forum-results">
          {results.map((game) => (
            <li key={game.appid}>
              <button type="button" className="forum-result" onClick={() => onTargetChange({ appid: game.appid, name: game.name })}>
                <img src={game.image} alt="" />
                <span>{game.name}</span>
                <span className="forum-result__go" aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewer?.is_moderator && <ModerationPanel onTargetChange={onTargetChange} />}

      <section className="forum-section" aria-labelledby="forum-recent">
        <h2 id="forum-recent">Actividad reciente</h2>
        {activity.length === 0 ? (
          <p className="hint">Todavía no hay mensajes. Buscá un juego y sé el primero en reseñarlo.</p>
        ) : (
          <ul className="forum-list">
            {activity.map((item) => (
              <li key={`${item.kind}-${item.thread_id ?? item.appid}-${item.at}`}>
                <button
                  type="button"
                  className="forum-list__item"
                  onClick={() =>
                    onTargetChange(
                      item.kind === "thread"
                        ? { appid: item.appid, name: item.game_name, threadId: item.thread_id }
                        : { appid: item.appid, name: item.game_name, tab: "reviews" }
                    )
                  }
                >
                  {item.kind === "review" ? (
                    <span className="score-badge" aria-label={`Puntaje ${item.score} de 10`}>{item.score}</span>
                  ) : (
                    <span className="score-badge score-badge--thread" aria-hidden="true">#</span>
                  )}
                  <span className="forum-list__text">
                    <strong>{item.kind === "review" ? `Reseña de ${item.game_name}` : item.title}</strong>
                    <span className="muted">
                      {item.kind === "thread" && `${item.game_name} · `}
                      {item.author.name} · {timeAgo(item.at)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

// ---------- Juego: reseñas + discusiones ----------

function ForumGameView({ target, onTargetChange, viewer, onLogin }) {
  const { appid } = target;
  const [game, setGame] = useState(null);
  const [gameError, setGameError] = useState("");
  // La pestaña vive en la URL (#/foro/juego/<appid>/discusiones), así Atrás vuelve a la anterior.
  const tab = target.tab ?? "reviews";
  const setTab = (nextTab) => onTargetChange({ appid, name: game?.name ?? target.name, tab: nextTab });
  const [reviews, setReviews] = useState([]);
  const [threads, setThreads] = useState([]);

  async function reload() {
    try {
      const [nextGame, nextReviews, nextThreads] = await Promise.all([
        fetchForumGame(appid),
        fetchForumReviews(appid),
        fetchForumThreads(appid),
      ]);
      setGame(nextGame);
      setReviews(nextReviews);
      setThreads(nextThreads);
      setGameError("");
    } catch (err) {
      setGameError(forumErrorMessage(err, "No se pudo cargar el foro de este juego."));
    }
  }

  useEffect(() => {
    setGame(null);
    reload();
  }, [appid, viewer?.steam_id]);

  const myReview = reviews.find((review) => review.is_mine);
  const name = game?.name ?? target.name ?? "Juego";

  return (
    <section className="forum" aria-labelledby="forum-game-title">
      <button type="button" className="text-button forum__back" onClick={() => onTargetChange(null)}>
        ← Foro
      </button>

      <header className="forum-game">
        <img className="forum-game__cover" src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`} alt={`Portada de ${name}`} />
        <div className="forum-game__info">
          <h1 id="forum-game-title">{name}</h1>
          {game && (
            <dl className="forum-game__stats">
              <div>
                <dt>Puntaje de la comunidad</dt>
                <dd className="mono">{game.average_score != null ? `${game.average_score} / 10` : "—"}</dd>
              </div>
              <div>
                <dt>Reseñas</dt>
                <dd className="mono">{game.review_count}</dd>
              </div>
              <div>
                <dt>Discusiones</dt>
                <dd className="mono">{game.thread_count}</dd>
              </div>
            </dl>
          )}
          <a className="text-button forum-game__store" href={`https://store.steampowered.com/app/${appid}/`} target="_blank" rel="noopener noreferrer">
            Ver en Steam ↗
          </a>
        </div>
      </header>

      {gameError && <p className="error-text">{gameError}</p>}

      <div className="segmented forum-tabs" role="group" aria-label="Sección del foro">
        <button type="button" aria-pressed={tab === "reviews"} onClick={() => setTab("reviews")}>
          Reseñas ({reviews.length})
        </button>
        <button type="button" aria-pressed={tab === "threads"} onClick={() => setTab("threads")}>
          Discusiones ({threads.length})
        </button>
      </div>

      {tab === "reviews" ? (
        <div className="forum-section">
          {viewer ? (
            <ReviewForm appid={appid} existing={myReview} onSaved={reload} />
          ) : (
            <LoginPrompt onLogin={onLogin} action="reseñar este juego" />
          )}
          {reviews.length === 0 ? (
            <p className="hint">Todavía nadie reseñó {name}.</p>
          ) : (
            <ul className="forum-posts">
              {reviews.map((review) => (
                <li key={review.id} className="forum-post">
                  <span className="score-badge score-badge--large" aria-label={`Puntaje ${review.score} de 10`}>{review.score}</span>
                  <div className="forum-post__content">
                    <AuthorLine author={review.author} at={review.updated_at} />
                    <p className="forum-post__body">{review.body}</p>
                    <MessageActions
                      kind="review"
                      id={review.id}
                      isMine={review.is_mine}
                      viewer={viewer}
                      // La propia se borra desde el formulario de arriba; acá solo los moderadores.
                      onDelete={review.is_mine ? undefined : async () => {
                        await deleteForumReviewById(review.id);
                        await reload();
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="forum-section">
          {viewer ? (
            <ThreadForm
              appid={appid}
              onCreated={(thread) => onTargetChange({ appid, name, threadId: thread.id })}
            />
          ) : (
            <LoginPrompt onLogin={onLogin} action="abrir una discusión" />
          )}
          {threads.length === 0 ? (
            <p className="hint">No hay discusiones sobre {name} todavía.</p>
          ) : (
            <ul className="forum-list">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button type="button" className="forum-list__item" onClick={() => onTargetChange({ appid, name, threadId: thread.id })}>
                    <span className="score-badge score-badge--thread" aria-hidden="true">#</span>
                    <span className="forum-list__text">
                      <strong>{thread.title}</strong>
                      <span className="muted">
                        {thread.author.name} · {thread.reply_count} {thread.reply_count === 1 ? "respuesta" : "respuestas"} · {timeAgo(thread.last_activity_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewForm({ appid, existing, onSaved }) {
  const [score, setScore] = useState(existing?.score ?? null);
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setScore(existing?.score ?? null);
    setBody(existing?.body ?? "");
  }, [existing?.id, existing?.updated_at]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!score || !body.trim()) {
      setError("Elegí un puntaje y escribí tu reseña.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveForumReview(appid, { score, body: body.trim() });
      await onSaved();
    } catch (err) {
      setError(forumErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteForumReview(appid);
      await onSaved();
    } catch (err) {
      setError(forumErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="forum-form" onSubmit={handleSubmit}>
      <h2>{existing ? "Tu reseña" : "Escribí tu reseña"}</h2>
      <fieldset className="score-picker">
        <legend>Puntaje</legend>
        {SCORES.map((value) => (
          <button
            key={value}
            type="button"
            className="score-picker__option"
            aria-pressed={score === value}
            aria-label={`${value} de 10`}
            onClick={() => setScore(value)}
          >
            {value}
          </button>
        ))}
      </fieldset>
      <label className="forum-form__field">
        <span>Reseña</span>
        <textarea className="text-input textarea" rows={4} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="¿Qué te pareció? ¿Lo recomendarías?" />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="forum-form__actions">
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? "Guardando…" : existing ? "Actualizar reseña" : "Publicar reseña"}
        </button>
        {existing && (
          <button type="button" className="button" onClick={handleDelete} disabled={saving}>
            Borrar
          </button>
        )}
      </div>
    </form>
  );
}

function ThreadForm({ appid, onCreated }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" className="button button--primary forum-new-thread" onClick={() => setOpen(true)}>
        Nueva discusión
      </button>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const thread = await createForumThread(appid, { title: title.trim(), body: body.trim() });
      onCreated(thread);
    } catch (err) {
      setError(forumErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="forum-form" onSubmit={handleSubmit}>
      <h2>Nueva discusión</h2>
      <label className="forum-form__field">
        <span>Título</span>
        <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Ej.: ¿Conviene jugarlo en difícil?" />
      </label>
      <label className="forum-form__field">
        <span>Mensaje</span>
        <textarea className="text-input textarea" rows={4} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="forum-form__actions">
        <button type="submit" className="button button--primary" disabled={saving || title.trim().length < 3 || !body.trim()}>
          {saving ? "Publicando…" : "Publicar"}
        </button>
        <button type="button" className="button" onClick={() => setOpen(false)} disabled={saving}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------- Hilo ----------

function ForumThreadView({ target, onTargetChange, viewer, onLogin }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function reload() {
    try {
      setThread(await fetchForumThread(target.threadId));
      setError("");
    } catch (err) {
      setError(forumErrorMessage(err, "No se pudo cargar la discusión."));
    }
  }

  useEffect(() => {
    reload();
  }, [target.threadId, viewer?.steam_id]);

  const backToGame = () => onTargetChange({ appid: target.appid, name: thread?.game_name ?? target.name, tab: "threads" });

  async function handleReply(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await replyToForumThread(target.threadId, reply.trim());
      setReply("");
      await reload();
    } catch (err) {
      setError(forumErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteThread() {
    try {
      await deleteForumThread(target.threadId);
      backToGame();
    } catch (err) {
      setError(forumErrorMessage(err));
    }
  }

  async function handleDeletePost(postId) {
    try {
      await deleteForumPost(postId);
      await reload();
    } catch (err) {
      setError(forumErrorMessage(err));
    }
  }

  return (
    <section className="forum" aria-labelledby="forum-thread-title">
      <button type="button" className="text-button forum__back" onClick={backToGame}>
        ← {thread?.game_name ?? target.name ?? "Volver"}
      </button>

      {error && <p className="error-text">{error}</p>}

      {thread && (
        <>
          <article className="forum-thread">
            <h1 id="forum-thread-title">{thread.title}</h1>
            <AuthorLine author={thread.author} at={thread.created_at} />
            <p className="forum-post__body">{thread.body}</p>
            <MessageActions
              kind="thread"
              id={thread.id}
              isMine={thread.is_mine}
              viewer={viewer}
              deleteLabel="Borrar discusión"
              onDelete={handleDeleteThread}
            />
          </article>

          <section className="forum-section" aria-label="Respuestas">
            <h2>{thread.posts.length} {thread.posts.length === 1 ? "respuesta" : "respuestas"}</h2>
            <ul className="forum-posts">
              {thread.posts.map((post) => (
                <li key={post.id} className="forum-post">
                  <div className="forum-post__content">
                    <AuthorLine author={post.author} at={post.created_at} />
                    <p className="forum-post__body">{post.body}</p>
                    <MessageActions
                      kind="post"
                      id={post.id}
                      isMine={post.is_mine}
                      viewer={viewer}
                      onDelete={() => handleDeletePost(post.id)}
                    />
                  </div>
                </li>
              ))}
            </ul>

            {viewer ? (
              <form className="forum-form" onSubmit={handleReply}>
                <label className="forum-form__field">
                  <span>Tu respuesta</span>
                  <textarea className="text-input textarea" rows={3} maxLength={5000} value={reply} onChange={(event) => setReply(event.target.value)} />
                </label>
                <div className="forum-form__actions">
                  <button type="submit" className="button button--primary" disabled={sending || !reply.trim()}>
                    {sending ? "Enviando…" : "Responder"}
                  </button>
                </div>
              </form>
            ) : (
              <LoginPrompt onLogin={onLogin} action="responder" />
            )}
          </section>
        </>
      )}
    </section>
  );
}

// ---------- Moderación ----------

const KIND_LABELS = { review: "Reseña", thread: "Discusión", post: "Respuesta" };

/** Denuncias pendientes, solo para moderadores (ADMIN_STEAM_IDS en el backend). */
function ModerationPanel({ onTargetChange }) {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");

  async function reload() {
    try {
      setReports(await fetchForumReports());
      setError("");
    } catch (err) {
      setError(forumErrorMessage(err, "No se pudieron cargar las denuncias."));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function act(action) {
    try {
      await action();
      await reload();
    } catch (err) {
      setError(forumErrorMessage(err));
    }
  }

  function remove(report) {
    if (report.kind === "review") return deleteForumReviewById(report.target_id);
    if (report.kind === "thread") return deleteForumThread(report.target_id);
    return deleteForumPost(report.target_id);
  }

  function open(report) {
    if (!report.appid) return;
    onTargetChange(
      report.thread_id
        ? { appid: report.appid, name: report.game_name, threadId: report.thread_id }
        : { appid: report.appid, name: report.game_name, tab: "reviews" },
    );
  }

  return (
    <section className="forum-section moderation" aria-labelledby="moderation-title">
      <h2 id="moderation-title">Denuncias {reports?.length ? `(${reports.length})` : ""}</h2>
      {error && <p className="error-text">{error}</p>}
      {reports && reports.length === 0 && <p className="hint">No hay denuncias pendientes.</p>}
      {reports && reports.length > 0 && (
        <ul className="moderation__list">
          {reports.map((report) => (
            <li key={`${report.kind}-${report.target_id}`} className="moderation__item">
              <p className="moderation__meta">
                <span className="tag">{KIND_LABELS[report.kind]}</span>
                <strong>{report.author.name || "Jugador de Steam"}</strong>
                <span className="muted">
                  en {report.game_name || "un juego"} · {report.report_count} {report.report_count === 1 ? "denuncia" : "denuncias"}
                </span>
              </p>
              <p className="moderation__excerpt">{report.excerpt}</p>
              {report.reasons.length > 0 && <p className="muted moderation__reasons">Motivos: {report.reasons.join(" · ")}</p>}
              <div className="moderation__actions">
                <button type="button" className="text-button" onClick={() => open(report)}>
                  Ver en el foro
                </button>
                <button type="button" className="text-button moderation__delete" onClick={() => act(() => remove(report))}>
                  Borrar mensaje
                </button>
                <button type="button" className="text-button" onClick={() => act(() => dismissForumReports(report.kind, report.target_id))}>
                  Descartar denuncia
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Acciones de un mensaje: "Borrar" (autor o moderador, si se pasa `onDelete`) y "Denunciar"
 * (cualquiera con sesión, menos el autor). La denuncia pide un motivo opcional.
 */
function MessageActions({ kind, id, isMine, viewer, onDelete, deleteLabel = "Borrar" }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState(""); // "" | "sending" | "sent" | mensaje de error
  if (!viewer) return null;
  const canDelete = onDelete && (isMine || viewer.is_moderator);
  const canReport = !isMine;
  if (!canDelete && !canReport) return null;

  async function submitReport(event) {
    event.preventDefault();
    setState("sending");
    try {
      await reportForumMessage(kind, id, reason.trim());
      setState("sent");
      setReporting(false);
    } catch (err) {
      setState(forumErrorMessage(err));
    }
  }

  return (
    <div className="message-actions">
      {canDelete && (
        <button type="button" className="text-button" onClick={onDelete}>
          {deleteLabel}
        </button>
      )}
      {canReport && state !== "sent" && !reporting && (
        <button type="button" className="text-button message-actions__report" onClick={() => setReporting(true)}>
          Denunciar
        </button>
      )}
      {state === "sent" && <span className="muted">Gracias, un moderador lo va a revisar.</span>}
      {reporting && (
        <form className="message-actions__form" onSubmit={submitReport}>
          <input
            className="text-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="Motivo (opcional)"
            aria-label="Motivo de la denuncia"
          />
          <button type="submit" className="button" disabled={state === "sending"}>
            Enviar
          </button>
          <button type="button" className="text-button" onClick={() => setReporting(false)}>
            Cancelar
          </button>
        </form>
      )}
      {state && !["sending", "sent"].includes(state) && <span className="error-text">{state}</span>}
    </div>
  );
}

// ---------- Piezas compartidas ----------

function AuthorLine({ author, at }) {
  return (
    <p className="author-line">
      {author.avatar ? <img src={author.avatar} alt="" /> : <span className="author-line__avatar" aria-hidden="true" />}
      <strong>{author.name || "Jugador de Steam"}</strong>
      <span className="muted">{timeAgo(at)}</span>
    </p>
  );
}

function LoginPrompt({ onLogin, action }) {
  return (
    <div className="login-prompt">
      <p>Iniciá sesión con Steam para {action}.</p>
      <button type="button" className="button" onClick={onLogin}>
        Iniciar sesión con Steam
      </button>
    </div>
  );
}

function timeAgo(isoDate) {
  const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return "recién";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;
  return new Date(isoDate).toLocaleDateString("es-AR");
}

export default ForumPage;
