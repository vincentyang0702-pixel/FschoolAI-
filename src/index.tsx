// index.jsx — React entry point. Mounts App into #root.
// /card is a standalone public page — rendered without AppProvider/Supabase
import React       from "react";
import ReactDOM    from "react-dom/client";
import "./index.css";

if (window.location.pathname === "/card") {
  // Lazy import so Supabase/AppContext never initializes for the card page
  import("./pages/Card").then(({ default: Card }) => {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode><Card /></React.StrictMode>
    );
  });
} else {
  Promise.all([
    import("./App"),
    import("./context/AppContext"),
  ]).then(([{ default: App }, { AppProvider }]) => {
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </React.StrictMode>
    );
  });
}
