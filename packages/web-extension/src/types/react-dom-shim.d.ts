declare module "react-dom" {
  export function render(
    element: unknown,
    container: Element | DocumentFragment | null,
    callback?: () => void
  ): unknown;

  const ReactDOM: {
    render: typeof render;
  };

  export default ReactDOM;
}
