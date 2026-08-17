/**
 * Input controlado para un SteamID: sin valor, la ruleta usa la biblioteca de ejemplo.
 */
function SteamIdInput({ id, label, value, onChange, placeholder }) {
  return (
    <div className="steam-id-input">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        className="steam-id-input__field"
        placeholder={placeholder ?? "SteamID64, vanity URL o link de perfil"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
    </div>
  );
}

export default SteamIdInput;
