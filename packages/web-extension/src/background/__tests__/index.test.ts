import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKMARK_SYNC_ALARM_NAME,
  BOOKMARK_SYNC_ALARM_PERIOD_MINUTES,
  registerBackgroundListeners
} from "../index";

describe("registerBackgroundListeners", () => {
  it("invokes the synchronizer when runtime events fire", async () => {
    let installedListener: ((...args: unknown[]) => void) | undefined;
    let startupListener: ((...args: unknown[]) => void) | undefined;

    const runtime = {
      onInstalled: {
        addListener: (listener: (...args: unknown[]) => void) => {
          installedListener = listener;
        }
      },
      onStartup: {
        addListener: (listener: (...args: unknown[]) => void) => {
          startupListener = listener;
        }
      }
    };

    let callCount = 0;
    const synchronizer = () => {
      callCount += 1;
      return Promise.resolve();
    };

    registerBackgroundListeners({ runtime }, synchronizer);

    assert.ok(installedListener);
    assert.ok(startupListener);

    installedListener?.();
    await Promise.resolve();
    assert.strictEqual(callCount, 1);

    startupListener?.();
    await Promise.resolve();
    assert.strictEqual(callCount, 2);
  });

  it("schedules and reacts to periodic alarms", async () => {
    let alarmListener: ((alarm?: { name?: string }) => void) | undefined;
    let createdAlarmName: string | undefined;
    let createdAlarmPeriod: number | undefined;

    const alarms = {
      create: (name: string, info: { periodInMinutes: number }) => {
        createdAlarmName = name;
        createdAlarmPeriod = info.periodInMinutes;
      },
      onAlarm: {
        addListener: (listener: (alarm?: { name?: string }) => void) => {
          alarmListener = listener;
        }
      }
    };

    let callCount = 0;
    const synchronizer = () => {
      callCount += 1;
      return Promise.resolve();
    };

    registerBackgroundListeners({ alarms }, synchronizer);

    assert.strictEqual(createdAlarmName, BOOKMARK_SYNC_ALARM_NAME);
    assert.strictEqual(
      createdAlarmPeriod,
      BOOKMARK_SYNC_ALARM_PERIOD_MINUTES
    );
    assert.ok(alarmListener);

    alarmListener?.({ name: BOOKMARK_SYNC_ALARM_NAME });
    await Promise.resolve();
    assert.strictEqual(callCount, 1);

    alarmListener?.({ name: "another-alarm" });
    await Promise.resolve();
    assert.strictEqual(callCount, 1);

    alarmListener?.({});
    await Promise.resolve();
    assert.strictEqual(callCount, 2);
  });

  it("logs synchronization failures", async () => {
    let installedListener: ((...args: unknown[]) => void) | undefined;
    const runtime = {
      onInstalled: {
        addListener: (listener: (...args: unknown[]) => void) => {
          installedListener = listener;
        }
      }
    };

    const error = new Error("boom");
    const synchronizer = () => Promise.reject(error);

    const originalConsoleError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };

    try {
      registerBackgroundListeners({ runtime }, synchronizer);

      assert.ok(installedListener);
      installedListener?.();
      await Promise.resolve();

      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0][0], "Failed to synchronize bookmarks");
      assert.strictEqual(calls[0][1], error);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
