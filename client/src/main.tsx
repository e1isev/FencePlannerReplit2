import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!(globalThis as any).__publicField) {
  (globalThis as any).__publicField = (obj: any, key: any, value: any) => {
    Object.defineProperty(obj, typeof key !== "symbol" ? `${key}` : key, {
      enumerable: true,
      configurable: true,
      writable: true,
      value,
    });
    return value;
  };
}

createRoot(document.getElementById("root")!).render(<App />);
