export const RUNTIME_SYNC_NOW_MESSAGE_TYPE = "capybara::sync-now" as const;

export type RuntimeSyncNowMessage = {
  type: typeof RUNTIME_SYNC_NOW_MESSAGE_TYPE;
};

export function isRuntimeSyncNowMessage(
  message: unknown
): message is RuntimeSyncNowMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === RUNTIME_SYNC_NOW_MESSAGE_TYPE
  );
}
