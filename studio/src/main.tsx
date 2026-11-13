import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { foundry, isAuthCallback } from "./foundry/auth";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

if (foundry && isAuthCallback()) {
  // The OAuth redirect lands here: finish signing in, then go to the app.
  root.render(<p className="boot">Signing in…</p>);
  foundry.auth
    .signIn()
    .then(() => window.location.replace("/"))
    .catch((e: unknown) => root.render(<p className="boot error">Sign-in failed: {String(e)}</p>));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
