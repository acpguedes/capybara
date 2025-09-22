import { describe, it } from "node:test";
import assert from "node:assert/strict";

declare const __filename: string;

type ReactElement = {
  type: unknown;
  key?: unknown;
  props: { children?: unknown; [key: string]: unknown };
};

type RequireFunction = ((specifier: string) => unknown) & {
  resolve: (specifier: string) => string;
};

const createHookEnvironment = () => {
  let component: (() => ReactElement) | null = null;
  let currentTree: ReactElement | null = null;
  const stateValues: unknown[] = [];
  const memoValues: unknown[] = [];
  const memoDeps: Array<unknown[] | undefined> = [];
  const effectStates: Array<{ deps?: unknown[]; cleanup?: (() => void) }> = [];
  const pendingEffects: Array<() => void | (() => void)> = [];
  const pendingEffectIndices: number[] = [];
  let stateIndex = 0;
  let memoIndex = 0;
  let effectIndex = 0;

  const flushEffects = () => {
    while (pendingEffects.length > 0) {
      const effect = pendingEffects.shift()!;
      const index = pendingEffectIndices.shift()!;
      const previous = effectStates[index];
      if (previous?.cleanup) {
        previous.cleanup();
      }
      const cleanup = effect();
      effectStates[index] = {
        deps: effectStates[index]?.deps,
        cleanup: typeof cleanup === "function" ? cleanup : undefined
      };
    }
  };

  const queueRender = () => {
    if (!component) {
      throw new Error("No component registered.");
    }

    stateIndex = 0;
    memoIndex = 0;
    effectIndex = 0;
    pendingEffects.length = 0;
    pendingEffectIndices.length = 0;
    currentTree = component();

    flushEffects();
  };

  const react = {
    useState<S>(initial: S | (() => S)) {
      const index = stateIndex++;
      if (stateValues.length <= index) {
        stateValues[index] =
          typeof initial === "function"
            ? (initial as () => S)()
            : initial;
      }

      const setState = (value: S | ((prev: S) => S)) => {
        const previous = stateValues[index] as S;
        const next =
          typeof value === "function"
            ? (value as (prev: S) => S)(previous)
            : value;

        if (!Object.is(previous, next)) {
          stateValues[index] = next;
          queueRender();
        }
      };

      return [stateValues[index] as S, setState] as const;
    },
    useEffect(effect: () => void | (() => void), deps?: unknown[]) {
      const index = effectIndex++;
      const previous = effectStates[index];
      const depsChanged =
        !deps ||
        !previous?.deps ||
        deps.length !== previous.deps.length ||
        deps.some((dep, depIndex) => !Object.is(dep, previous.deps![depIndex]));

      effectStates[index] = { deps, cleanup: previous?.cleanup };

      if (depsChanged) {
        pendingEffectIndices.push(index);
        pendingEffects.push(effect);
      }
    },
    useMemo<T>(factory: () => T, deps?: unknown[]) {
      const index = memoIndex++;
      const previousDeps = memoDeps[index];

      if (
        !deps ||
        !previousDeps ||
        deps.length !== previousDeps.length ||
        deps.some((dep, depIndex) => !Object.is(dep, previousDeps[depIndex]))
      ) {
        memoValues[index] = factory();
        memoDeps[index] = deps ? [...deps] : undefined;
      }

      return memoValues[index] as T;
    }
  };

  const jsxRuntime = {
    jsx(type: unknown, props: Record<string, unknown>, key?: unknown) {
      return { type, props, key };
    },
    jsxs(type: unknown, props: Record<string, unknown>, key?: unknown) {
      return { type, props, key };
    },
    Fragment: Symbol.for("react.fragment")
  };

  return {
    react,
    jsxRuntime,
    render(renderComponent: () => ReactElement) {
      component = renderComponent;
      queueRender();
      return currentTree as ReactElement;
    },
    getTree() {
      if (!currentTree) {
        throw new Error("No tree available.");
      }
      return currentTree;
    },
    reset() {
      component = null;
      currentTree = null;
      stateValues.length = 0;
      memoValues.length = 0;
      memoDeps.length = 0;
      effectStates.length = 0;
      pendingEffects.length = 0;
      pendingEffectIndices.length = 0;
      stateIndex = 0;
      memoIndex = 0;
      effectIndex = 0;
    }
  };
};

const toChildArray = (children: unknown): unknown[] => {
  if (Array.isArray(children)) {
    return children;
  }

  if (children === null || children === undefined) {
    return [];
  }

  return [children];
};

const collectElements = (
  element: ReactElement,
  predicate: (candidate: ReactElement) => boolean,
  results: ReactElement[]
) => {
  if (predicate(element)) {
    results.push(element);
  }

  for (const child of toChildArray(element.props.children)) {
    if (child && typeof child === "object") {
      collectElements(child as ReactElement, predicate, results);
    }
  }
};

const sharedHooks = createHookEnvironment();

describe("popup entrypoint", () => {
  it("renders the App component into the root element", async () => {
    const Module = require("module") as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
    };
    const originalModuleLoad = Module._load;

    sharedHooks.reset();
    Module._load = (request, parent, isMain) => {
      if (request === "react") {
        return sharedHooks.react;
      }

      if (request === "react/jsx-runtime") {
        return sharedHooks.jsxRuntime;
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

  it("renders stored bookmarks after hydration completes", async () => {
    const Module = require("module") as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
      createRequire: (filename: string) => RequireFunction;
    };
    const originalModuleLoad = Module._load;
    const resolver = Module.createRequire(__filename);
    const hooks = sharedHooks;
    hooks.reset();

    Module._load = (request, parent, isMain) => {
      if (request === "react") {
        return hooks.react;
      }

      if (request === "react/jsx-runtime") {
        return hooks.jsxRuntime;
      }

      return originalModuleLoad(request, parent, isMain);
    };

    const storedBookmarks = [
      {
        id: "bookmark-1",
        title: "Persisted example",
        url: "https://example.com/",
        category: "General",
        tags: ["example"],
        createdAt: "2024-05-01T12:00:00.000Z",
        source: "chromium" as const
      },
      {
        id: "bookmark-2",
        title: "Reference docs",
        url: "https://docs.example.com/",
        category: "Reference",
        tags: ["reference"],
        createdAt: "2024-05-02T08:30:00.000Z",
        source: "firefox" as const
      }
    ];

    const { searchBookmarks } = resolver(
      "../../domain/services/search"
    ) as typeof import("../../domain/services/search");
    const originalHydrateFromStorage = searchBookmarks.hydrateFromStorage;
    const originalQuery = searchBookmarks.query;

    let visibleBookmarks: typeof storedBookmarks = [];
    const queryCalls: string[] = [];
    let resolveHydration: (() => void) | undefined;

    const hydrationPromise = new Promise<void>((resolve) => {
      resolveHydration = () => {
        visibleBookmarks = storedBookmarks.map((bookmark) => ({ ...bookmark }));
        resolve();
      };
    });

    searchBookmarks.hydrateFromStorage = () => hydrationPromise;
    searchBookmarks.query = (term: string) => {
      queryCalls.push(term);
      return visibleBookmarks;
    };

    try {
      const { App } = await import("../App");

      const initialTree = hooks.render(() => App() as ReactElement);

      assert.ok(resolveHydration);

      const initialList: ReactElement[] = [];
      collectElements(initialTree, (candidate) => candidate.type === "li", initialList);
      assert.strictEqual(initialList.length, 0);
      assert.deepStrictEqual(queryCalls, [""]);

      resolveHydration!();
      await hydrationPromise;

      const hydratedTree = hooks.getTree();
      const hydratedItems: ReactElement[] = [];
      collectElements(hydratedTree, (candidate) => candidate.type === "li", hydratedItems);
      assert.strictEqual(hydratedItems.length, storedBookmarks.length);
      assert.deepStrictEqual(queryCalls, ["", ""]);

      hydratedItems.forEach((item, index) => {
        const anchors: ReactElement[] = [];
        collectElements(item, (candidate) => candidate.type === "a", anchors);
        assert.strictEqual(anchors.length, 1);
        const [anchor] = anchors;
        assert.strictEqual(anchor.props.href, storedBookmarks[index].url);

        const spans: ReactElement[] = [];
        collectElements(anchor, (candidate) => candidate.type === "span", spans);
        assert.strictEqual(spans.length, 2);
        assert.strictEqual(spans[0].props.children, storedBookmarks[index].title);
        assert.strictEqual(spans[1].props.children, storedBookmarks[index].category);
      });
    } finally {
      Module._load = originalModuleLoad;
      searchBookmarks.hydrateFromStorage = originalHydrateFromStorage;
      searchBookmarks.query = originalQuery;
    }
  });
});
