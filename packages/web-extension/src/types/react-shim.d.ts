type ReactEventTarget<T> = {
  target: T & EventTarget;
};

declare module "react" {
  export type FormEvent<T = Element> = ReactEventTarget<T> & {
    preventDefault(): void;
  };

  export type ChangeEvent<T = Element> = ReactEventTarget<T>;

  export function useState<S>(
    initialState: S | (() => S)
  ): [S, (value: S | ((prevState: S) => S)) => void];

  export function useEffect(effect: () => void | (() => void), deps?: ReadonlyArray<unknown>): void;

  export function useMemo<T>(factory: () => T, deps: ReadonlyArray<unknown> | undefined): T;

  export interface MutableRefObject<T> {
    current: T;
  }

  export function useRef<T>(initialValue: T): MutableRefObject<T>;
}

declare namespace JSX {
  type Element = object;
  interface ElementClass {}
  interface ElementChildrenAttribute {
    children: object;
  }

  type BaseProps = {
    children?: unknown;
    [key: string]: unknown;
  };

  interface IntrinsicElements {
    main: BaseProps;
    header: BaseProps;
    h1: BaseProps;
    h2: BaseProps;
    section: BaseProps;
    label: BaseProps;
    form: BaseProps & {
      onSubmit?: (event: import("react").FormEvent<HTMLFormElement>) => void;
    };
    p: BaseProps;
    code: BaseProps;
    button: BaseProps & {
      type?: string;
      disabled?: boolean;
    };
    input: BaseProps & {
      type?: string;
      value?: string;
      checked?: boolean;
      placeholder?: string;
      autoComplete?: string;
      required?: boolean;
      onChange?: (event: import("react").ChangeEvent<HTMLInputElement>) => void;
    };
    select: BaseProps & {
      value?: string;
      onChange?: (event: import("react").ChangeEvent<HTMLSelectElement>) => void;
    };
    option: BaseProps & {
      value?: string;
    };
    ul: BaseProps;
    li: BaseProps;
    a: BaseProps & {
      href?: string;
      target?: string;
      rel?: string;
    };
    span: BaseProps;
  }
}

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: Record<string, unknown>, key?: string): JSX.Element;
  export function jsxs(type: unknown, props: Record<string, unknown>, key?: string): JSX.Element;
  export const Fragment: symbol;
}
