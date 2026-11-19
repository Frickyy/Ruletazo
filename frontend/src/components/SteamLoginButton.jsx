/**
 * Botón oficial "Sign in through Steam". La documentación de la Steam Web API pide usar sus
 * imágenes para el inicio de sesión con OpenID, así que no se reemplaza por un botón propio.
 */
const STEAM_SIGN_IN_IMAGE = "https://community.steamstatic.com/public/images/signinthroughsteam/sits_01.png";

function SteamLoginButton({ onClick, className = "" }) {
  return (
    <button type="button" className={`steam-login ${className}`.trim()} onClick={onClick}>
      <img src={STEAM_SIGN_IN_IMAGE} width="180" height="35" alt="Iniciar sesión con Steam" />
    </button>
  );
}

export default SteamLoginButton;
