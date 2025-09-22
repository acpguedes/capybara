import { describe, it } from "node:test";
import assert from "node:assert/strict";

declare const __filename: string;

type ReactElement = {
  type: unknown;
  key?: unknown;
  props: { children?: unknown; [key: string]: unknown };
};

type TimerHandle = { id: number };

type TimerEntry = {
  handle: TimerHandle;
  callback: () => void;
};

const createHookEnvironment = () => {
  let component: (() => ReactElement) | null = null;
  let currentTree: ReactElement | null = null;
  const stateValues: unknown[] = [];
  const memoValues: unknown[] = [];
  const memoDeps: Array<unknown[] | undefined> = [];
  const refValues: Array<{ current: unknown }> = [];
  const effectStates: Array<{ deps?: unknown[]; cleanup?: (() => void) }> = [];
  const pendingEffects: Array<() => void | (() => void)> = [];
  const pendingEffectIndices: number[] = [];
  const postUnmountStateUpdates: Array<{ index: number; value: unknown }> = [];
  let stateIndex = 0;
  let memoIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let unmounted = false;

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
    if (!component || unmounted) {
      return;
    }

    stateIndex = 0;
    memoIndex = 0;
    refIndex = 0;
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

        if (unmounted) {
          postUnmountStateUpdates.push({ index, value: next });
          return;
        }

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

      if (depsChanged && !unmounted) {
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
    },
    useRef<T>(initial: T) {
      const index = refIndex++;

      if (refValues.length <= index) {
        refValues[index] = { current: initial };
      }

      return refValues[index] as { current: T };
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
      unmounted = false;
      queueRender();
      return currentTree as ReactElement;
    },
    getTree() {
      if (!currentTree) {
        throw new Error("No tree available.");
      }

      return currentTree;
    },
    unmount() {
      if (unmounted) {
        return;
      }

      unmounted = true;

      for (const effectState of effectStates) {
        effectState.cleanup?.();
        effectState.cleanup = undefined;
      }

      pendingEffects.length = 0;
      pendingEffectIndices.length = 0;
    },
    reset() {
      component = null;
      currentTree = null;
      stateValues.length = 0;
      memoValues.length = 0;
      memoDeps.length = 0;
      refValues.length = 0;
      effectStates.length = 0;
      pendingEffects.length = 0;
      pendingEffectIndices.length = 0;
      postUnmountStateUpdates.length = 0;
      stateIndex = 0;
      memoIndex = 0;
      refIndex = 0;
      effectIndex = 0;
      unmounted = false;
    },
    getPostUnmountStateUpdates() {
      return [...postUnmountStateUpdates];
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

const createFakeTimers = () => {
  let nextId = 1;
  const timers: TimerEntry[] = [];

  const schedule: typeof setTimeout = ((
    callback: (...args: unknown[]) => void,
    _delay?: number,
    ...args: unknown[]
  ) => {
    const handle: TimerHandle = { id: nextId++ };
    timers.push({ handle, callback: () => callback(...args) });
    return handle as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  const cancel: typeof clearTimeout = ((handle: ReturnType<typeof setTimeout>) => {
    const index = timers.findIndex(
      (entry) => entry.handle === (handle as unknown as TimerHandle)
    );

    if (index !== -1) {
      timers.splice(index, 1);
    }
  }) as typeof clearTimeout;

  const flush = () => {
    const pending = timers.splice(0, timers.length);
    for (const entry of pending) {
      entry.callback();
    }
  };

  const pendingCount = () => timers.length;

  return { setTimeout: schedule, clearTimeout: cancel, flush, pendingCount };
};

const sharedHooks = createHookEnvironment();

const Module = require("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

const syncSettingsModule = {
  async loadSyncSettings() {
    return { enabled: false, keySource: "platform" as const };
  },
  async saveSyncSettings() {}
};

const llmSettingsModule = {
  async loadLLMConfiguration() {
    return null;
  },
  async saveLLMConfiguration() {}
};

const extensionPermissionsModule = {
  async ensureHostPermission() {
    return true;
  },
  getHostPermissionInfo() {
    return null as
      | {
          pattern: string;
          origin: string;
          href: string;
        }
      | null;
  }
};

describe("Settings component", () => {
  it("clears the synchronization save status timer on unmount", async () => {
    const hooks = sharedHooks;
    hooks.reset();

    const originalModuleLoad = Module._load;
    const timers = createFakeTimers();
    const timerGlobals = globalThis as typeof globalThis & {
      setTimeout: typeof setTimeout;
      clearTimeout: typeof clearTimeout;
    };
    const originalSetTimeout = timerGlobals.setTimeout;
    const originalClearTimeout = timerGlobals.clearTimeout;
    timerGlobals.setTimeout = timers.setTimeout;
    timerGlobals.clearTimeout = timers.clearTimeout;

    Module._load = (request: string, parent: unknown, isMain: boolean) => {
      if (request === "react") {
        return hooks.react;
      }

      if (request === "react/jsx-runtime") {
        return hooks.jsxRuntime;
      }

      if (request === "../domain/services/sync-settings") {
        return syncSettingsModule;
      }

      if (request === "../domain/services/llm-settings") {
        return llmSettingsModule;
      }

      if (request === "../shared/extension-permissions") {
        return extensionPermissionsModule;
      }

      return originalModuleLoad(request, parent, isMain);
    };

    try {
      const { Settings } = await import("../settings");
      const tree = hooks.render(() => Settings() as ReactElement);

      const forms: ReactElement[] = [];
      collectElements(tree, (candidate) => candidate.type === "form", forms);
      assert.ok(forms.length >= 2);

      const syncForm = forms[0];
      const onSubmit = syncForm.props.onSubmit as (
        event: { preventDefault: () => void }
      ) => Promise<void>;

      await onSubmit({ preventDefault() {} });

      assert.strictEqual(timers.pendingCount(), 1);

      hooks.unmount();

      assert.strictEqual(timers.pendingCount(), 0);

      timers.flush();

      assert.deepStrictEqual(hooks.getPostUnmountStateUpdates(), []);
    } finally {
      Module._load = originalModuleLoad;
      timerGlobals.setTimeout = originalSetTimeout;
      timerGlobals.clearTimeout = originalClearTimeout;
      hooks.reset();
    }
  });

  it("clears the LLM save status timer on unmount", async () => {
    const hooks = sharedHooks;
    hooks.reset();

    const originalModuleLoad = Module._load;
    const timers = createFakeTimers();
    const timerGlobals = globalThis as typeof globalThis & {
      setTimeout: typeof setTimeout;
      clearTimeout: typeof clearTimeout;
    };
    const originalSetTimeout = timerGlobals.setTimeout;
    const originalClearTimeout = timerGlobals.clearTimeout;
    timerGlobals.setTimeout = timers.setTimeout;
    timerGlobals.clearTimeout = timers.clearTimeout;

    Module._load = (request: string, parent: unknown, isMain: boolean) => {
      if (request === "react") {
        return hooks.react;
      }

      if (request === "react/jsx-runtime") {
        return hooks.jsxRuntime;
      }

      if (request === "../domain/services/sync-settings") {
        return syncSettingsModule;
      }

      if (request === "../domain/services/llm-settings") {
        return llmSettingsModule;
      }

      if (request === "../shared/extension-permissions") {
        return extensionPermissionsModule;
      }

      return originalModuleLoad(request, parent, isMain);
    };

    try {
      const { Settings } = await import("../settings");
      const tree = hooks.render(() => Settings() as ReactElement);

      const forms: ReactElement[] = [];
      collectElements(tree, (candidate) => candidate.type === "form", forms);
      assert.ok(forms.length >= 2);

      const llmForm = forms[1];
      const onSubmit = llmForm.props.onSubmit as (
        event: { preventDefault: () => void }
      ) => Promise<void>;

      await onSubmit({ preventDefault() {} });

      assert.strictEqual(timers.pendingCount(), 1);

      hooks.unmount();

      assert.strictEqual(timers.pendingCount(), 0);

      timers.flush();

      assert.deepStrictEqual(hooks.getPostUnmountStateUpdates(), []);
    } finally {
      Module._load = originalModuleLoad;
      timerGlobals.setTimeout = originalSetTimeout;
      timerGlobals.clearTimeout = originalClearTimeout;
      hooks.reset();
    }
  });
});
