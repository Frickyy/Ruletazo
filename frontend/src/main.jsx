import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { isOverlayLocation } from "./services/streamerOverlay.js";
import "./index.css";

// /obs?perfil=… es la superposición del modo streamer: solo la ruleta, sin barra ni pie de página.
const StreamerOverlay = lazy(() => import("./pages/StreamerOverlay.jsx"));
const overlay = isOverlayLocation(window.location);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {overlay ? (
      <Suspense fallback={null}>
        <StreamerOverlay />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
