/**
 * Botón controlado por props: `isLoading` y `onSpin` vienen de afuera.
 * Este componente no tiene estado propio, solo refleja lo que le indican.
 */
function RouletteButton({ onSpin, isLoading }) {
  return (
    <button className="roulette-button" onClick={onSpin} disabled={isLoading}>
      {isLoading ? "Girando..." : "Girar Ruleta"}
    </button>
  );
}

export default RouletteButton;
