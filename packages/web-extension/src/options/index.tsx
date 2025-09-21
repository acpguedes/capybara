import ReactDOM from "../popup/react-dom-adapter";
import { Settings } from "./settings";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to locate the options root element.");
}

ReactDOM.render(<Settings />, rootElement);
