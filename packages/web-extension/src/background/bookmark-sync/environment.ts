const FIREFOX_USER_AGENT_PATTERN = /firefox/i;

type NavigatorWithUserAgent = Pick<Navigator, "userAgent">;

type WebExtensionEnvironment = typeof globalThis & {
  navigator?: NavigatorWithUserAgent;
};

export function isFirefoxEnvironment(
  globalObject: WebExtensionEnvironment = globalThis as WebExtensionEnvironment
): boolean {
  const userAgent = globalObject.navigator?.userAgent;
  if (typeof userAgent !== "string") {
    return false;
  }

  return FIREFOX_USER_AGENT_PATTERN.test(userAgent);
}
