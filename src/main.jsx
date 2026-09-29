import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { supabase } from "./supabaseClient.js";
import "./index.css";

// Petit badge temporaire : vérifie que l'application est bien reliée à la base.
// (On le retirera une fois la connexion confirmée.)
function ConnBadge() {
  const [state, setState] = useState({ status: "loading", count: null, error: null });

  useEffect(() => {
    supabase
      .from("produits")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (error) setState({ status: "error", error: error.message });
        else setState({ status: "ok", count: count ?? 0 });
      });
  }, []);

  const base = {
    position: "fixed",
    bottom: 12,
    right: 12,
    zIndex: 99999,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 12px",
    borderRadius: 8,
    boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
    color: "#fff",
  };

  if (state.status === "loading")
    return <div style={{ ...base, background: "#64748b" }}>Base : connexion…</div>;
  if (state.status === "error")
    return <div style={{ ...base, background: "#dc2626" }}>Base : erreur — {state.error}</div>;
  return (
    <div style={{ ...base, background: "#0f766e" }}>
      ✓ Base connectée — {state.count} matériel(s)
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <ConnBadge />
  </React.StrictMode>
);
