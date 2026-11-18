import "./LegalPage.css";

/*
 * Política de privacidad y términos de uso.
 * BORRADOR: describen lo que la app hace hoy, pero antes de lanzar conviene que los revise
 * alguien con conocimiento legal de tu país, y completar el país donde se alojan los datos
 * (DATA_LOCATION) y el mail de contacto (CONTACT_EMAIL en backend/.env).
 */
const UPDATED = "18 de noviembre de 2026";
const DATA_LOCATION = "el país donde está alojado el servidor";

function LegalPage({ kind, config }) {
  const contact = config?.contact_email ? (
    <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a>
  ) : (
    "el mail de contacto del sitio"
  );
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
      </ul>

      <h2>Qué es público</h2>
      <p>
        Tu perfil es privado por defecto. Si lo hacés público, cualquiera con el link ve lo que estás jugando, lo que terminaste, tus
        favoritos y tus reseñas; tu biblioteca completa no se muestra. Lo que publicás en el foro es público.
      </p>

      <h2>Cookies y almacenamiento</h2>
      <p>
        Usamos una sola cookie, necesaria para mantener tu sesión (firmada, dura 30 días y no se puede leer desde la página). Algunas
        preferencias, como los filtros o el historial de giros, se guardan en tu navegador. No usamos cookies de publicidad ni de
        seguimiento.
      </p>

      <h2>Con quién se comparte</h2>
      <p>
        No vendemos ni compartimos tus datos. Para funcionar, la página consulta a Steam (Valve), al que solo se le envía tu SteamID o el
        número del juego. Las portadas se cargan desde los
        servidores de imágenes de Steam. Si la página tiene links a tiendas, pueden ser links de afiliado: la tienda sabe que
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
        La información de los juegos (biblioteca, portadas, géneros, duración, reseñas) viene de Steam y de otros servicios. Puede
        estar incompleta o desactualizada, y puede dejar de estar disponible si esos servicios cambian.
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

export default LegalPage;
