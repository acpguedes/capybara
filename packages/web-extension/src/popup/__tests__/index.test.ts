import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("popup entrypoint", () => {
  it("renders the App component into the root element", async () => {
    const Module = require("module") as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const originalModuleLoad = Module._load;

    Module._load = (request, parent, isMain) => {
      if (request === "react") {
        return {
          useState<S>(initial: S | (() => S)) {
            const resolved =
              typeof initial === "function"
                ? (initial as () => S)()
                : initial;
            let state = resolved;
            const setState = (value: S | ((prev: S) => S)) => {
              state =
                typeof value === "function"
                  ? (value as (prev: S) => S)(state)
                  : value;
            };
            return [state, setState] as const;
          },
          useEffect(effect: () => void | (() => void)) {
            const cleanup = effect();
            if (typeof cleanup === "function") {
              cleanup();
            }
          },
          useMemo<T>(factory: () => T) {
            return factory();
          }
        };
      }

      if (request === "react/jsx-runtime") {
        return {
          jsx(type: unknown, props: Record<string, unknown>, key?: unknown) {
            return { type, props, key };
          },
          jsxs(type: unknown, props: Record<string, unknown>, key?: unknown) {
            return { type, props, key };
          },
          Fragment: Symbol.for("react.fragment")
        };
      }

      return originalModuleLoad(request, parent, isMain);
    };

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
    const stubbedReactDOM = {
      render(
        element: unknown,
        container: Element | DocumentFragment | null,
        callback?: () => void
      ) {
        renderCalls.push([element, container, callback]);
        if (callback) {
          callback();
        }
        return null as never;
      }
    };

    const stubGlobal = globalScope as typeof globalScope & {
      __capybaraReactDOMStub__?: typeof stubbedReactDOM;
    };
    const previousStub = stubGlobal.__capybaraReactDOMStub__;
    stubGlobal.__capybaraReactDOMStub__ = stubbedReactDOM;

    try {
      await import("../index");

      assert.deepStrictEqual(requestedIds, ["root"]);
      assert.strictEqual(renderCalls.length, 1);

      const [element, container] = renderCalls[0];
      assert.strictEqual(container, rootElement);
      assert.ok(element && typeof element === "object");
      assert.strictEqual((element as { type?: unknown }).type, App);
    } finally {
      Module._load = originalModuleLoad;
      if (previousStub) {
        stubGlobal.__capybaraReactDOMStub__ = previousStub;
      } else {
        delete stubGlobal.__capybaraReactDOMStub__;
      }

      if (hadDocument) {
        globalScope.document = previousDocument;
      } else {
        delete globalScope.document;
      }
    }
  });
});
