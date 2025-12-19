import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { FreeDrawDemo } from "./pages/FreeDrawDemo.tsx";
import "./index.css";

// Simple routing based on URL hash
function Root() {
  const [view, setView] = React.useState(() => {
    return window.location.hash === "#free-draw" ? "free-draw" : "main";
  });

  React.useEffect(() => {
    const handleHashChange = () => {
      setView(window.location.hash === "#free-draw" ? "free-draw" : "main");
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (view === "free-draw") {
    return <FreeDrawDemo />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);