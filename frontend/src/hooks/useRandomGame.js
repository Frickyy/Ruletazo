import { useCallback, useState } from "react";
import { fetchRandomGame } from "../services/gameService.js";

/**
 * Custom hook: encapsula el estado y la lógica de "girar la ruleta".
 *
 * ¿Por qué un hook y no poner esto directamente en el componente?
 * - Separa la lógica de datos de la lógica visual (el componente solo dibuja).
 * - Se puede reutilizar en otra pantalla sin duplicar código.
 *
 * useState: cada llamada guarda un valor que persiste entre renders y que,
 * al cambiar (setGame, setIsLoading, setError), provoca que React vuelva
 * a renderizar el componente que use el hook.
 */
export function useRandomGame() {
  const [game, setGame] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const spin = useCallback(async (options) => {
    setIsLoading(true);
    setError(null);
    setGame(null);
    try {
      const randomGame = await fetchRandomGame(options);
      setGame(randomGame);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { game, isLoading, error, spin, setGame };
}

// El backend manda un mensaje específico (steamid inválido, perfil privado, etc.) en `detail`.
function extractErrorMessage(err) {
  if (err.response?.data?.detail) {
    return err.response.data.detail;
  }
  if (err.request) {
    return "No se pudo conectar con el backend. ¿Está corriendo?";
  }
  return "No se pudo obtener un juego.";
}
