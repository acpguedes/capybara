import ReactDOM from "react-dom";
import { App } from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to locate the popup root element.");
}

ReactDOM.render(<App />, rootElement);
