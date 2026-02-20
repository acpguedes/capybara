type ReactEventTarget<T> = {
  target: T & EventTarget;
};

declare module "react" {
  export type FormEvent<T = Element> = ReactEventTarget<T> & {
    preventDefault(): void;
  };

  export type ChangeEvent<T = Element> = ReactEventTarget<T>;

  export type MouseEvent<T = Element> = ReactEventTarget<T> & {
    preventDefault(): void;
  };

  export type CSSProperties = Record<string, string | number | undefined>;

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
    className?: string;
    style?: import("react").CSSProperties;
    id?: string;
    role?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    "aria-selected"?: boolean;
    "aria-controls"?: string;
    "aria-hidden"?: boolean;
    tabIndex?: number;
    [key: string]: unknown;
  };

  interface IntrinsicElements {
    div: BaseProps;
    main: BaseProps;
    nav: BaseProps;
    header: BaseProps;
    footer: BaseProps;
    aside: BaseProps;
    h1: BaseProps;
    h2: BaseProps;
    h3: BaseProps;
    h4: BaseProps;
    section: BaseProps;
    article: BaseProps;
    label: BaseProps & {
      htmlFor?: string;
    };
    form: BaseProps & {
      onSubmit?: (event: import("react").FormEvent<HTMLFormElement>) => void;
    };
    p: BaseProps;
    code: BaseProps;
    pre: BaseProps;
    small: BaseProps;
    strong: BaseProps;
    em: BaseProps;
    hr: BaseProps;
    br: BaseProps;
    button: BaseProps & {
      type?: string;
      disabled?: boolean;
      onClick?: (event: import("react").MouseEvent<HTMLButtonElement>) => void;
    };
    input: BaseProps & {
      type?: string;
      value?: string;
      checked?: boolean;
      placeholder?: string;
      autoComplete?: string;
      required?: boolean;
      disabled?: boolean;
      readOnly?: boolean;
      onChange?: (event: import("react").ChangeEvent<HTMLInputElement>) => void;
    };
    select: BaseProps & {
      value?: string;
      disabled?: boolean;
      onChange?: (event: import("react").ChangeEvent<HTMLSelectElement>) => void;
    };
    option: BaseProps & {
      value?: string;
      disabled?: boolean;
    };
    ul: BaseProps;
    ol: BaseProps;
    li: BaseProps;
    a: BaseProps & {
      href?: string;
      target?: string;
      rel?: string;
      onClick?: (event: import("react").MouseEvent<HTMLAnchorElement>) => void;
    };
    span: BaseProps;
    img: BaseProps & {
      src?: string;
      alt?: string;
      width?: number | string;
      height?: number | string;
    };
    svg: BaseProps & {
      viewBox?: string;
      xmlns?: string;
      fill?: string;
      stroke?: string;
      width?: number | string;
      height?: number | string;
    };
    path: BaseProps & {
      d?: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number | string;
      strokeLinecap?: string;
      strokeLinejoin?: string;
    };
    circle: BaseProps & {
      cx?: number | string;
      cy?: number | string;
      r?: number | string;
      fill?: string;
    };
  }
}

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: Record<string, unknown>, key?: string): JSX.Element;
  export function jsxs(type: unknown, props: Record<string, unknown>, key?: string): JSX.Element;
  export const Fragment: symbol;
}
