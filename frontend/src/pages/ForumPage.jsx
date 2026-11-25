import { createContext, useContext, useEffect, useState } from "react";
import {
  createForumThread,
  deleteForumPost,
  deleteForumReview,
  deleteForumReviewById,
  deleteForumThread,
  dismissForumReports,
  editForumPost,
  editForumThread,
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
import FormattedText, { formatHelp } from "../components/FormattedText.jsx";
import { locale, t, tk } from "../i18n/index.js";
import SteamLoginButton from "../components/SteamLoginButton.jsx";
import SupporterBadge from "../components/SupporterBadge.jsx";
import { usePageTitle } from "../services/pageTitle.js";
import "./ForumPage.css";

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Lo que comparten las piezas del foro sin pasarlo de componente en componente:
// abrir el perfil de un autor y las tiendas con link de afiliado (si están configuradas).
const ForumContext = createContext({ onOpenProfile: null, affiliateStores: [] });

/**
 * Foro: buscador de juegos, reseñas con puntaje del 1 al 10 y discusiones.
 * `target` decide la vista: null → portada; { appid } → juego; { appid, threadId } → hilo.
 */
function ForumPage({ target, onTargetChange, viewer, onLogin, onOpenProfile = null, affiliateStores = [] }) {
  let content;
  if (target?.threadId) {
    content = <ForumThreadView target={target} onTargetChange={onTargetChange} viewer={viewer} onLogin={onLogin} />;
  } else if (target?.appid) {
    content = <ForumGameView target={target} onTargetChange={onTargetChange} viewer={viewer} onLogin={onLogin} />;
  } else {
    content = <ForumHome onTargetChange={onTargetChange} viewer={viewer} />;
  }
  return <ForumContext.Provider value={{ onOpenProfile, affiliateStores }}>{content}</ForumContext.Provider>;
}

// ---------- Portada: buscador + actividad reciente ----------

function ForumHome({ onTargetChange, viewer }) {
  usePageTitle(t("Foro"));
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
      setSearchError(forumErrorMessage(err, t("No se pudo buscar.")));
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="forum" aria-labelledby="forum-title">
      <div className="forum__heading">
        <p className="eyebrow">{t("Foro")}</p>
        <h1 id="forum-title">{t("Hablemos de juegos")}</h1>
        <p className="hint">{t("Buscá cualquier juego de Steam para reseñarlo con un puntaje del 1 al 10 o abrir una discusión.")}</p>
      </div>

      <form className="forum-search" role="search" onSubmit={handleSearch}>
        <label htmlFor="forum-search" className="visually-hidden">{t("Buscar un juego")}</label>
        <input
          id="forum-search"
          className="text-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Buscar un juego: Hollow Knight, Portal 2…")}
          autoComplete="off"
        />
        <button type="submit" className="button button--primary" disabled={searching || query.trim().length < 2}>
          {searching ? t("Buscando…") : t("Buscar")}
        </button>
      </form>

      {searchError && <p className="error-text">{searchError}</p>}
      {results && results.length === 0 && <p className="hint">{t("No encontramos juegos con ese nombre.")}</p>}
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
        <h2 id="forum-recent">{t("Actividad reciente")}</h2>
        {activity.length === 0 ? (
          <p className="hint">{t("Todavía no hay mensajes. Buscá un juego y sé el primero en reseñarlo.")}</p>
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
                    <span className="score-badge" aria-label={t("Puntaje {score} de 10", { score: item.score })}>{item.score}</span>
                  ) : (
                    <span className="score-badge score-badge--thread" aria-hidden="true">#</span>
                  )}
                  <span className="forum-list__text">
                    <strong>{item.kind === "review" ? t("Reseña de {name}", { name: item.game_name }) : item.title}</strong>
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
  // La pestaña vive en la URL (/foro/juego/<appid>/discusiones), así Atrás vuelve a la anterior.
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
      setGameError(forumErrorMessage(err, t("No se pudo cargar el foro de este juego.")));
    }
  }

  useEffect(() => {
    setGame(null);
    reload();
  }, [appid, viewer?.steam_id]);

  const myReview = reviews.find((review) => review.is_mine);
  const name = game?.name ?? target.name ?? t("Juego");
  usePageTitle(game?.name || target.name ? t("{name}: reseñas y discusiones", { name }) : t("Foro"));

  return (
    <section className="forum" aria-labelledby="forum-game-title">
      <button type="button" className="text-button forum__back" onClick={() => onTargetChange(null)}>
        ← {t("Foro")}
      </button>

      <header className="forum-game">
        <img className="forum-game__cover" src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`} alt={t("Portada de {name}", { name })} />
        <div className="forum-game__info">
          <h1 id="forum-game-title">{name}</h1>
          {game && (
            <dl className="forum-game__stats">
              <div>
                <dt>{t("Puntaje de la comunidad")}</dt>
                <dd className="mono">{game.average_score != null ? `${game.average_score} / 10` : "—"}</dd>
              </div>
              <div>
                <dt>{t("Reseñas")}</dt>
                <dd className="mono">{game.review_count}</dd>
              </div>
              <div>
                <dt>{t("Discusiones")}</dt>
                <dd className="mono">{game.thread_count}</dd>
              </div>
            </dl>
          )}
          <a className="text-button forum-game__store" href={`https://store.steampowered.com/app/${appid}/`} target="_blank" rel="noopener noreferrer">
            {t("Ver en Steam")} ↗
          </a>
          <AffiliateStores name={name} />
        </div>
      </header>

      {gameError && <p className="error-text">{gameError}</p>}

      <div className="segmented forum-tabs" role="group" aria-label={t("Sección del foro")}>
        <button type="button" aria-pressed={tab === "reviews"} onClick={() => setTab("reviews")}>
          {t("Reseñas")} ({reviews.length})
        </button>
        <button type="button" aria-pressed={tab === "threads"} onClick={() => setTab("threads")}>
          {t("Discusiones")} ({threads.length})
        </button>
      </div>

      {tab === "reviews" ? (
        <div className="forum-section">
          {viewer ? (
            <ReviewForm appid={appid} existing={myReview} onSaved={reload} />
          ) : (
            <LoginPrompt onLogin={onLogin} message={t("Iniciá sesión con Steam para reseñar este juego.")} />
          )}
          {reviews.length === 0 ? (
            <p className="hint">{t("Todavía nadie reseñó {name}.", { name })}</p>
          ) : (
            <ul className="forum-posts">
              {reviews.map((review) => (
                <li key={review.id} className="forum-post">
                  <span className="score-badge score-badge--large" aria-label={t("Puntaje {score} de 10", { score: review.score })}>{review.score}</span>
                  <div className="forum-post__content">
                    <AuthorLine author={review.author} at={review.updated_at} />
                    <FormattedText className="forum-post__body" text={review.body} />
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
            <LoginPrompt onLogin={onLogin} message={t("Iniciá sesión con Steam para abrir una discusión.")} />
          )}
          {threads.length === 0 ? (
            <p className="hint">{t("No hay discusiones sobre {name} todavía.", { name })}</p>
          ) : (
            <ul className="forum-list">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button type="button" className="forum-list__item" onClick={() => onTargetChange({ appid, name, threadId: thread.id })}>
                    <span className="score-badge score-badge--thread" aria-hidden="true">#</span>
                    <span className="forum-list__text">
                      <strong>{thread.title}</strong>
                      <span className="muted">
                        {thread.author.name} · {repliesLabel(thread.reply_count)} · {timeAgo(thread.last_activity_at)}
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
      setError(t("Elegí un puntaje y escribí tu reseña."));
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
      <h2>{existing ? t("Tu reseña") : t("Escribí tu reseña")}</h2>
      <fieldset className="score-picker">
        <legend>{t("Puntaje")}</legend>
        {SCORES.map((value) => (
          <button
            key={value}
            type="button"
            className="score-picker__option"
            aria-pressed={score === value}
            aria-label={t("{score} de 10", { score: value })}
            onClick={() => setScore(value)}
          >
            {value}
          </button>
        ))}
      </fieldset>
      <label className="forum-form__field">
        <span>{t("Reseña")}</span>
        <textarea className="text-input textarea" rows={4} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("¿Qué te pareció? ¿Lo recomendarías?")} />
        <span className="format-help">{formatHelp()}</span>
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="forum-form__actions">
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? t("Guardando…") : existing ? t("Actualizar reseña") : t("Publicar reseña")}
        </button>
        {existing && (
          <button type="button" className="button" onClick={handleDelete} disabled={saving}>
            {t("Borrar")}
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
        {t("Nueva discusión")}
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
      <h2>{t("Nueva discusión")}</h2>
      <label className="forum-form__field">
        <span>{t("Título")}</span>
        <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder={t("Ej.: ¿Conviene jugarlo en difícil?")} />
      </label>
      <label className="forum-form__field">
        <span>{t("Mensaje")}</span>
        <textarea className="text-input textarea" rows={4} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} />
        <span className="format-help">{formatHelp()}</span>
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="forum-form__actions">
        <button type="submit" className="button button--primary" disabled={saving || title.trim().length < 3 || !body.trim()}>
          {saving ? t("Publicando…") : t("Publicar")}
        </button>
        <button type="button" className="button" onClick={() => setOpen(false)} disabled={saving}>
          {t("Cancelar")}
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
  const [editingThread, setEditingThread] = useState(false);
  const [editingPostId, setEditingPostId] = useState(null);
  const [sending, setSending] = useState(false);

  async function reload() {
    try {
      setThread(await fetchForumThread(target.threadId));
      setError("");
    } catch (err) {
      setError(forumErrorMessage(err, t("No se pudo cargar la discusión.")));
    }
  }

  useEffect(() => {
    reload();
  }, [target.threadId, viewer?.steam_id]);

  const backToGame = () => onTargetChange({ appid: target.appid, name: thread?.game_name ?? target.name, tab: "threads" });
  usePageTitle(thread ? [thread.title, thread.game_name].filter(Boolean).join(" · ") : t("Foro"));

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
        ← {thread?.game_name ?? target.name ?? t("Volver")}
      </button>

      {error && <p className="error-text">{error}</p>}

      {thread && (
        <>
          <article className="forum-thread">
            {editingThread ? (
              <EditForm
                initialTitle={thread.title}
                initialBody={thread.body}
                onCancel={() => setEditingThread(false)}
                onSave={async ({ title, body }) => {
                  await editForumThread(thread.id, { title, body });
                  setEditingThread(false);
                  await reload();
                }}
              />
            ) : (
              <>
                <h1 id="forum-thread-title">{thread.title}</h1>
                <AuthorLine author={thread.author} at={thread.created_at} editedAt={thread.edited_at} />
                <FormattedText className="forum-post__body" text={thread.body} />
                <MessageActions
                  kind="thread"
                  id={thread.id}
                  isMine={thread.is_mine}
                  viewer={viewer}
                  deleteLabel={t("Borrar discusión")}
                  onDelete={handleDeleteThread}
                  onEdit={() => setEditingThread(true)}
                />
              </>
            )}
          </article>

          <section className="forum-section" aria-label={t("Respuestas")}>
            <h2>{repliesLabel(thread.posts.length)}</h2>
            <ul className="forum-posts">
              {thread.posts.map((post) => (
                <li key={post.id} className="forum-post">
                  <div className="forum-post__content">
                    <AuthorLine author={post.author} at={post.created_at} editedAt={post.edited_at} />
                    {editingPostId === post.id ? (
                      <EditForm
                        initialBody={post.body}
                        onCancel={() => setEditingPostId(null)}
                        onSave={async ({ body }) => {
                          await editForumPost(post.id, body);
                          setEditingPostId(null);
                          await reload();
                        }}
                      />
                    ) : (
                      <>
                        <FormattedText className="forum-post__body" text={post.body} />
                        <MessageActions
                          kind="post"
                          id={post.id}
                          isMine={post.is_mine}
                          viewer={viewer}
                          onDelete={() => handleDeletePost(post.id)}
                          onEdit={() => setEditingPostId(post.id)}
                        />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {viewer ? (
              <form className="forum-form" onSubmit={handleReply}>
                <label className="forum-form__field">
                  <span>{t("Tu respuesta")}</span>
                  <textarea className="text-input textarea" rows={3} maxLength={5000} value={reply} onChange={(event) => setReply(event.target.value)} />
                  <span className="format-help">{formatHelp()}</span>
                </label>
                <div className="forum-form__actions">
                  <button type="submit" className="button button--primary" disabled={sending || !reply.trim()}>
                    {sending ? t("Enviando…") : t("Responder")}
                  </button>
                </div>
              </form>
            ) : (
              <LoginPrompt onLogin={onLogin} message={t("Iniciá sesión con Steam para responder.")} />
            )}
          </section>
        </>
      )}
    </section>
  );
}

// ---------- Moderación ----------

const KIND_LABELS = { review: tk("Reseña"), thread: tk("Discusión"), post: tk("Respuesta") };

/** Denuncias pendientes, solo para moderadores (ADMIN_STEAM_IDS en el backend). */
function ModerationPanel({ onTargetChange }) {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");

  async function reload() {
    try {
      setReports(await fetchForumReports());
      setError("");
    } catch (err) {
      setError(forumErrorMessage(err, t("No se pudieron cargar las denuncias.")));
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
      <h2 id="moderation-title">{t("Denuncias")} {reports?.length ? `(${reports.length})` : ""}</h2>
      {error && <p className="error-text">{error}</p>}
      {reports && reports.length === 0 && <p className="hint">{t("No hay denuncias pendientes.")}</p>}
      {reports && reports.length > 0 && (
        <ul className="moderation__list">
          {reports.map((report) => (
            <li key={`${report.kind}-${report.target_id}`} className="moderation__item">
              <p className="moderation__meta">
                <span className="tag">{t(KIND_LABELS[report.kind])}</span>
                <strong>{report.author.name || t("Jugador de Steam")}</strong>
                <span className="muted">
                  {t("en {name}", { name: report.game_name || t("un juego") })} ·{" "}
                  {report.report_count === 1 ? t("1 denuncia") : t("{count} denuncias", { count: report.report_count })}
                </span>
              </p>
              <p className="moderation__excerpt">{report.excerpt}</p>
              {report.reasons.length > 0 && <p className="muted moderation__reasons">{t("Motivos:")} {report.reasons.join(" · ")}</p>}
              <div className="moderation__actions">
                <button type="button" className="text-button" onClick={() => open(report)}>
                  {t("Ver en el foro")}
                </button>
                <button type="button" className="text-button moderation__delete" onClick={() => act(() => remove(report))}>
                  {t("Borrar mensaje")}
                </button>
                <button type="button" className="text-button" onClick={() => act(() => dismissForumReports(report.kind, report.target_id))}>
                  {t("Descartar denuncia")}
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
function MessageActions({ kind, id, isMine, viewer, onDelete, onEdit, deleteLabel }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [state, setState] = useState(""); // "" | "sending" | "sent" | mensaje de error
  if (!viewer) return null;
  const canDelete = onDelete && (isMine || viewer.is_moderator);
  const canReport = !isMine;
  const canEdit = onEdit && isMine;
  if (!canDelete && !canReport && !canEdit) return null;

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
      {canEdit && (
        <button type="button" className="text-button" onClick={onEdit}>
          {t("Editar")}
        </button>
      )}
      {canDelete && (
        <button type="button" className="text-button" onClick={onDelete}>
          {deleteLabel ?? t("Borrar")}
        </button>
      )}
      {canReport && state !== "sent" && !reporting && (
        <button type="button" className="text-button message-actions__report" onClick={() => setReporting(true)}>
          {t("Denunciar")}
        </button>
      )}
      {state === "sent" && <span className="muted">{t("Gracias, un moderador lo va a revisar.")}</span>}
      {reporting && (
        <form className="message-actions__form" onSubmit={submitReport}>
          <input
            className="text-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder={t("Motivo (opcional)")}
            aria-label={t("Motivo de la denuncia")}
          />
          <button type="submit" className="button" disabled={state === "sending"}>
            {t("Enviar")}
          </button>
          <button type="button" className="text-button" onClick={() => setReporting(false)}>
            {t("Cancelar")}
          </button>
        </form>
      )}
      {state && !["sending", "sent"].includes(state) && <span className="error-text">{state}</span>}
    </div>
  );
}

// ---------- Piezas compartidas ----------

function AuthorLine({ author, at, editedAt }) {
  const { onOpenProfile } = useContext(ForumContext);
  const name = author.name || t("Jugador de Steam");
  return (
    <p className="author-line">
      {author.avatar ? <img src={author.avatar} alt="" /> : <span className="author-line__avatar" aria-hidden="true" />}
      {onOpenProfile && author.steam_id ? (
        <button type="button" className="author-line__name" onClick={() => onOpenProfile(author.steam_id)} title={t("Ver perfil")}>
          {name}
        </button>
      ) : (
        <strong>{name}</strong>
      )}
      {author.is_supporter && <SupporterBadge />}
      <span className="muted">{timeAgo(at)}</span>
      {editedAt && (
        <span className="muted" title={t("Editado {when}", { when: timeAgo(editedAt) })}>
          ({t("editado")})
        </span>
      )}
    </p>
  );
}

/** Edición en el lugar: con `initialTitle` edita un hilo (título y texto); sin él, una respuesta. */
function EditForm({ initialTitle, initialBody, onSave, onCancel }) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const editsTitle = initialTitle !== undefined;

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave({ title: title.trim(), body: body.trim() });
    } catch (err) {
      setError(forumErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <form className="forum-form forum-form--edit" onSubmit={handleSubmit}>
      {editsTitle && (
        <label className="forum-form__field">
          <span>{t("Título")}</span>
          <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} />
        </label>
      )}
      <label className="forum-form__field">
        <span>{editsTitle ? t("Mensaje") : t("Respuesta")}</span>
        <textarea className="text-input textarea" rows={4} maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} />
        <span className="format-help">{formatHelp()}</span>
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="forum-form__actions">
        <button type="submit" className="button button--primary" disabled={saving || !body.trim() || (editsTitle && title.trim().length < 3)}>
          {saving ? t("Guardando…") : t("Guardar cambios")}
        </button>
        <button type="button" className="button" onClick={onCancel} disabled={saving}>
          {t("Cancelar")}
        </button>
      </div>
    </form>
  );
}

function LoginPrompt({ onLogin, message }) {
  return (
    <div className="login-prompt">
      <p>{message}</p>
      <SteamLoginButton onClick={onLogin} />
    </div>
  );
}

/**
 * Otras tiendas donde buscar el juego, con link de afiliado (AFFILIATE_STORES en el backend).
 * Marcados como tales y con rel="sponsored": la ruleta nunca elige juegos por esto.
 */
function AffiliateStores({ name }) {
  const { affiliateStores } = useContext(ForumContext);
  if (!affiliateStores?.length || !name) return null;
  return (
    <p className="forum-game__stores">
      <span className="muted">{t("Buscar en otras tiendas:")}</span>
      {affiliateStores.map((store) => (
        <a
          key={store.name}
          className="text-button"
          href={store.url.replaceAll("{query}", encodeURIComponent(name))}
          target="_blank"
          rel="sponsored noopener noreferrer"
        >
          {store.name} ↗
        </a>
      ))}
      <span className="muted forum-game__affiliate-note" title={t("Si comprás desde estos links, la página puede recibir una comisión sin costo extra para vos.")}>
        ({t("links de afiliado")})
      </span>
    </p>
  );
}

function timeAgo(isoDate) {
  const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return t("recién");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("hace {n} min", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hace {n} h", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? t("hace 1 día") : t("hace {n} días", { n: days });
  return new Date(isoDate).toLocaleDateString(locale());
}

function repliesLabel(count) {
  return count === 1 ? t("1 respuesta") : t("{count} respuestas", { count });
}

export default ForumPage;
