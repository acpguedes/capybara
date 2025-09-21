import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ReactDOM from "react-dom";

describe("popup entrypoint", () => {
  it("renders the App component into the root element", async () => {
    const { App } = await import("../App");

    const rootElement = {} as unknown as HTMLElement;
    const requestedIds: string[] = [];

    const fakeDocument = {
      getElementById: (id: string) => {
        requestedIds.push(id);
        if (id === "root") {
          return rootElement;
        }
        return null;
      }
    };

    const globalScope = globalThis as { document?: Document };
    const hadDocument = Object.prototype.hasOwnProperty.call(
      globalScope,
      "document"
    );
    const previousDocument = globalScope.document;
    globalScope.document = fakeDocument as unknown as Document;

    const renderCalls: Array<[unknown, unknown, unknown?]> = [];
    const originalRender = ReactDOM.render;

    (ReactDOM as unknown as {
      render: typeof originalRender;
    }).render = ((
      element: unknown,
      container: Element | DocumentFragment | null,
      callback?: () => void
    ) => {
      renderCalls.push([element, container, callback]);
      if (callback) {
        callback();
      }
      return null as never;
    }) as typeof originalRender;

    try {
      await import("../index");

      assert.deepStrictEqual(requestedIds, ["root"]);
      assert.strictEqual(renderCalls.length, 1);

      const [element, container] = renderCalls[0];
      assert.strictEqual(container, rootElement);
      assert.ok(element && typeof element === "object");
      assert.strictEqual((element as { type?: unknown }).type, App);
    } finally {
      (ReactDOM as unknown as { render: typeof originalRender }).render =
        originalRender;

      if (hadDocument) {
        globalScope.document = previousDocument;
      } else {
        delete globalScope.document;
      }
    }
  });
});
