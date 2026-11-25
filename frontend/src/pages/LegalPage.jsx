import { getLang, t } from "../i18n/index.js";
import { usePageTitle } from "../services/pageTitle.js";
import "./LegalPage.css";

/*
 * Política de privacidad y términos de uso.
 * BORRADOR: describen lo que la app hace hoy, pero antes de lanzar conviene que los revise
 * alguien con conocimiento legal de tu país, y completar el país donde se alojan los datos
 * (DATA_LOCATION) y el mail de contacto (CONTACT_EMAIL en backend/.env).
 */
const UPDATED = "25 de noviembre de 2026";
const DATA_LOCATION = "Estados Unidos (servidores de DigitalOcean en San Francisco)";
const UPDATED_EN = "November 25, 2026";
const DATA_LOCATION_EN = "the United States (DigitalOcean servers in San Francisco)";

function LegalPage({ kind, config }) {
  usePageTitle(kind === "terms" ? t("Términos de uso") : t("Política de privacidad"));
  const contact = config?.contact_email ? (
    <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a>
  ) : getLang() === "en" ? (
    "the site's contact email"
  ) : (
    "el mail de contacto del sitio"
  );
  if (getLang() === "en") return kind === "terms" ? <TermsEn contact={contact} /> : <PrivacyEn contact={contact} />;
  return kind === "terms" ? <Terms contact={contact} /> : <Privacy contact={contact} />;
}

function Privacy({ contact }) {
  return (
    <article className="legal" aria-labelledby="legal-title">
      <p className="eyebrow">Legales</p>
      <h1 id="legal-title">Política de privacidad</h1>
      <p className="muted">Última actualización: {UPDATED}</p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li>
          <strong>Tu cuenta de Steam:</strong> al iniciar sesión, Steam nos confirma tu SteamID. Nunca vemos ni guardamos tu contraseña.
        </li>
        <li>
          <strong>Tu biblioteca:</strong> la lista de juegos que tenés, las horas jugadas y la última vez que jugaste cada uno, tal como
          la devuelve Steam. Se guarda una copia para no pedírsela a Steam en cada giro y se actualiza cada hora. Lo mismo para las
          bibliotecas de los familiares que sumes.
        </li>
        <li>
          <strong>Lo que marcás en la página:</strong> favoritos, juegos ocultos, estados (jugando, terminado, abandonado) y las
          preferencias de tu perfil.
        </li>
        <li>
          <strong>Tu progreso de logros</strong>, solo si activás “Seguir mi progreso de logros” en tu perfil.
        </li>
        <li>
          <strong>Cuánto te llevó terminar un juego:</strong> cuando marcás un juego como terminado, guardamos las horas que tenés en
          Steam en ese momento. Se usan solo para calcular la duración que ve todo el mundo, como un número combinado con el de al
          menos otras dos personas; nunca se muestran las tuyas por separado.
        </li>
        <li>
          <strong>Lo que publicás en el foro:</strong> reseñas, discusiones, respuestas y denuncias, junto con tu nombre y avatar de
          Steam en el momento de publicar.
        </li>
        <li>
          <strong>Los comentarios que mandás con “Mandar comentario”:</strong> el texto, la sección de la página donde estabas y, si tenés
          la sesión iniciada, tu nombre y tu SteamID. Llegan por mail a quien mantiene la página y no se publican.
        </li>
        <li>
          <strong>Estadísticas de uso anónimas:</strong> contamos cuántas veces por día se usa cada paso de la página (visitas, giros,
          perfiles cargados, inicios de sesión), solo como un número. No guardamos quién lo hizo, ni tu IP, ni datos de tu navegador.
          Cloudflare, que protege y acelera la página, también mide las visitas y la velocidad de carga sin usar cookies.
        </li>
      </ul>

      <h2>Qué es público</h2>
      <p>
        Tu perfil es privado por defecto. Si lo hacés público, cualquiera con el link ve lo que estás jugando, lo que terminaste, tus
        favoritos y tus reseñas; tu biblioteca completa no se muestra. Lo que publicás en el foro es público.
      </p>

      <h2>Cookies y almacenamiento</h2>
      <p>
        Usamos una sola cookie, necesaria para mantener tu sesión (firmada, dura 30 días y no se puede leer desde la página). Algunas
        preferencias, como los filtros, el idioma o el historial de giros, se guardan en tu navegador, igual que una marca (mientras la
        pestaña está abierta) para no contar dos veces la misma visita. No usamos cookies de publicidad ni de seguimiento.
      </p>

      <h2>Con quién se comparte</h2>
      <p>
        No vendemos ni compartimos tus datos. Para funcionar, la página consulta a Steam (Valve), al que solo se le envía tu SteamID o el
        número del juego. Para la duración de los juegos consulta a IGDB (de Twitch), al que solo se le envía el número de cada juego
        en Steam. Las portadas se cargan desde los servidores de imágenes de Steam. Si la página tiene links a tiendas, pueden ser links de afiliado: la tienda sabe que
        llegaste desde acá, no quién sos.
      </p>

      <h2>Dónde se guardan</h2>
      <p>Los datos se guardan en {DATA_LOCATION}, con copias de seguridad diarias que se conservan una semana.</p>

      <h2>Tus derechos</h2>
      <p>
        Podés borrar todos tus datos cuando quieras desde tu perfil (“Borrar mis datos”): se eliminan tu perfil, tus marcas, tu progreso,
        la copia de tu biblioteca y tus mensajes del foro. Para cualquier consulta, escribí a {contact}.
      </p>
    </article>
  );
}

function Terms({ contact }) {
  return (
    <article className="legal" aria-labelledby="legal-title">
      <p className="eyebrow">Legales</p>
      <h1 id="legal-title">Términos de uso</h1>
      <p className="muted">Última actualización: {UPDATED}</p>

      <h2>Qué es esta página</h2>
      <p>
        Una herramienta gratuita para elegir qué jugar de tu biblioteca de Steam. Es un proyecto independiente: no tiene relación con
        Valve Corporation ni está respaldado por Steam. Steam y el logo de Steam son marcas registradas de Valve Corporation.
      </p>

      <h2>Datos de los juegos</h2>
      <p>
        La información de los juegos (biblioteca, portadas, géneros, duración, reseñas) viene de Steam y de otros servicios, como IGDB
        para la duración. Puede estar incompleta o desactualizada, y puede dejar de estar disponible si esos servicios cambian.
      </p>

      <h2>El foro</h2>
      <ul>
        <li>Sos responsable de lo que publicás. No se permiten insultos, acoso, spam, contenido ilegal ni datos personales de otros.</li>
        <li>Cualquiera puede denunciar un mensaje; los moderadores pueden borrar lo que no cumpla estas reglas.</li>
        <li>Al publicar, nos permitís mostrar ese contenido en la página. Podés borrarlo cuando quieras.</li>
      </ul>

      <h2>Apoyo y links de afiliado</h2>
      <p>
        La página es gratis. Si hay links para apoyar el proyecto, son aportes voluntarios que no dan acceso a funciones distintas. Los
        links a otras tiendas pueden ser de afiliado: si comprás, la página puede recibir una comisión, sin costo extra para vos. La
        ruleta nunca elige juegos por dinero.
      </p>

      <h2>Garantía y cambios</h2>
      <p>
        La página se ofrece tal como está, sin garantías de disponibilidad. Estos términos pueden cambiar; los cambios importantes se
        avisan en la página. Consultas: {contact}.
      </p>
    </article>
  );
}

// ---------- English ----------
// Same content as the Spanish texts above: keep both in sync when one changes.

function PrivacyEn({ contact }) {
  return (
    <article className="legal" aria-labelledby="legal-title">
      <p className="eyebrow">Legal</p>
      <h1 id="legal-title">Privacy policy</h1>
      <p className="muted">Last updated: {UPDATED_EN}</p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Your Steam account:</strong> when you sign in, Steam confirms your SteamID to us. We never see or store your password.
        </li>
        <li>
          <strong>Your library:</strong> the list of games you own, your playtime and the last time you played each one, as Steam returns
          it. We keep a copy so we don&apos;t ask Steam on every spin, and it&apos;s refreshed every hour. The same goes for the libraries of
          the family members you add.
        </li>
        <li>
          <strong>What you mark on the site:</strong> favorites, hidden games, states (playing, finished, abandoned) and your profile
          preferences.
        </li>
        <li>
          <strong>Your achievement progress</strong>, only if you turn on “Track my achievement progress” in your profile.
        </li>
        <li>
          <strong>How long it took you to finish a game:</strong> when you mark a game as finished, we store the hours you have on Steam
          at that moment. They are only used to calculate the length everyone sees, as a number combined with at least two other
          people&apos;s; yours are never shown on their own.
        </li>
        <li>
          <strong>What you post in the forum:</strong> reviews, discussions, replies and reports, together with your Steam name and avatar
          at the time of posting.
        </li>
        <li>
          <strong>The feedback you send with “Send feedback”:</strong> the text, the section of the site you were on and, if you&apos;re
          signed in, your Steam name and SteamID. It reaches whoever runs the site by email and is never published.
        </li>
        <li>
          <strong>Anonymous usage statistics:</strong> we count how many times a day each step of the site is used (visits, spins,
          profiles loaded, sign-ins), only as a number. We don&apos;t store who did it, your IP address or anything about your browser.
          Cloudflare, which protects and speeds up the site, also measures visits and load times without cookies.
        </li>
      </ul>

      <h2>What is public</h2>
      <p>
        Your profile is private by default. If you make it public, anyone with the link can see what you&apos;re playing, what you
        finished, your favorites and your reviews; your full library is not shown. What you post in the forum is public.
      </p>

      <h2>Cookies and storage</h2>
      <p>
        We use a single cookie, needed to keep you signed in (signed, lasts 30 days and can&apos;t be read by the page). Some preferences,
        like filters, language or spin history, are stored in your browser, as is a mark (while the tab is open) so the same visit
        isn&apos;t counted twice. We don&apos;t use advertising or tracking cookies.
      </p>

      <h2>Who we share it with</h2>
      <p>
        We don&apos;t sell or share your data. To work, the site queries Steam (Valve), which only receives your SteamID or the game&apos;s
        number. For game lengths it queries IGDB (owned by Twitch), which only receives each game&apos;s Steam number. Covers are loaded
        from Steam&apos;s image servers. If the site has links to stores, they may be affiliate links: the store
        knows you came from here, not who you are.
      </p>

      <h2>Where it is stored</h2>
      <p>The data is stored in {DATA_LOCATION_EN}, with daily backups kept for one week.</p>

      <h2>Your rights</h2>
      <p>
        You can delete all your data whenever you want from your profile (“Delete my data”): your profile, your marks, your progress,
        the copy of your library and your forum posts are removed. For any question, write to {contact}.
      </p>
    </article>
  );
}

function TermsEn({ contact }) {
  return (
    <article className="legal" aria-labelledby="legal-title">
      <p className="eyebrow">Legal</p>
      <h1 id="legal-title">Terms of use</h1>
      <p className="muted">Last updated: {UPDATED_EN}</p>

      <h2>What this site is</h2>
      <p>
        A free tool to choose what to play from your Steam library. It&apos;s an independent project: it is not affiliated with Valve
        Corporation or endorsed by Steam. Steam and the Steam logo are trademarks of Valve Corporation.
      </p>

      <h2>Game data</h2>
      <p>
        Game information (library, covers, genres, length, reviews) comes from Steam and other services, such as IGDB for game length.
        It may be incomplete or out of date, and it may stop being available if those services change.
      </p>

      <h2>The forum</h2>
      <ul>
        <li>You are responsible for what you post. Insults, harassment, spam, illegal content and other people&apos;s personal data are not allowed.</li>
        <li>Anyone can report a message; moderators can delete anything that breaks these rules.</li>
        <li>By posting, you allow us to show that content on the site. You can delete it whenever you want.</li>
      </ul>

      <h2>Support and affiliate links</h2>
      <p>
        The site is free. If there are links to support the project, they are voluntary contributions that don&apos;t unlock different
        features. Links to other stores may be affiliate links: if you buy, the site may receive a commission at no extra cost to you.
        The wheel never picks games for money.
      </p>

      <h2>Warranty and changes</h2>
      <p>
        The site is provided as is, with no availability guarantees. These terms may change; important changes will be announced on the
        site. Questions: {contact}.
      </p>
    </article>
  );
}

export default LegalPage;
