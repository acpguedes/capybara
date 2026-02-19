type ReactDOMLike = {
  render: (
    element: unknown,
    container: Element | DocumentFragment | null,
    callback?: () => void
  ) => unknown;
};

type GlobalWithStub = typeof globalThis & {
  __capybaraReactDOMStub__?: ReactDOMLike;
};

const globalScope = globalThis as GlobalWithStub;

let cachedImplementation: ReactDOMLike | null = null;

function resolveImplementation(): ReactDOMLike {
  const stub = globalScope.__capybaraReactDOMStub__;
  if (stub) {
    return stub;
  }

  if (cachedImplementation) {
    return cachedImplementation;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const required = require("react-dom") as
      | ReactDOMLike
      | { default?: ReactDOMLike };

    if (required && typeof (required as ReactDOMLike).render === "function") {
      cachedImplementation = required as ReactDOMLike;
      return cachedImplementation;
    }

    const defaultExport = (required as { default?: ReactDOMLike })?.default;
    if (defaultExport && typeof defaultExport.render === "function") {
      cachedImplementation = defaultExport;
      return cachedImplementation;
    }
  } catch (error) {
    // Swallow resolution failures so tests can provide a stub implementation.
  }

  const fallback: ReactDOMLike = {
    render() {
      throw new Error("ReactDOM render is unavailable");
    }
  };

  cachedImplementation = fallback;
  return fallback;
}

const reactDomAdapter: ReactDOMLike = {
  render(element, container, callback) {
    const implementation = resolveImplementation();
    return implementation.render(element, container, callback);
  }
};

export default reactDomAdapter;
