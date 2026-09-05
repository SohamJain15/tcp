import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { installGlobalErrorReporting } from "@/lib/client-error-reporter";
import "./index.css";

installGlobalErrorReporting();

createRoot(document.getElementById("root")!).render(
  <RouteErrorBoundary>
    <App />
  </RouteErrorBoundary>,
);
