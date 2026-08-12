import React from "react";
import ReactDOM from "react-dom/client";
import { CloudAuthRoot } from "./cloud/CloudAuthRoot";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CloudAuthRoot />
  </React.StrictMode>,
);
