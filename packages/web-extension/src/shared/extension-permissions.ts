interface HostPermissions {
  origins?: string[];
}

type PermissionsCallback = (
  permissions: HostPermissions,
  callback: (granted: boolean) => void
) => void;

type PermissionsPromise = (permissions: HostPermissions) => Promise<boolean> | boolean;

type PermissionsMethod = PermissionsCallback | PermissionsPromise;

interface ExtensionPermissions {
  contains?: PermissionsMethod;
  request?: PermissionsMethod;
}

type ExtensionGlobals = typeof globalThis & {
  browser?: { permissions?: ExtensionPermissions };
  chrome?: { permissions?: ExtensionPermissions };
};

export interface HostPermissionInfo {
  href: string;
  origin: string;
  pattern: string;
}

function getPermissionsAPI(): ExtensionPermissions | null {
  const globals = globalThis as ExtensionGlobals;
  return globals.browser?.permissions ?? globals.chrome?.permissions ?? null;
}

function callPermissionsMethod(
  method: PermissionsMethod | undefined,
  origins: string[]
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!method) {
      resolve(false);
      return;
    }

    try {
      if (method.length > 1) {
        (method as PermissionsCallback)({ origins }, (granted) => resolve(Boolean(granted)));
        return;
      }

      const result = (method as PermissionsPromise)({ origins });

      if (result && typeof (result as Promise<boolean>).then === "function") {
        (result as Promise<boolean>).then(
          (value) => resolve(Boolean(value)),
          (error) => reject(error)
        );
        return;
      }

      resolve(Boolean(result));
    } catch (error) {
      reject(error);
    }
  });
}

export function getHostPermissionInfo(endpoint: string): HostPermissionInfo | null {
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "https:" || !url.hostname || url.hostname.trim().length === 0) {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return {
      href: url.toString(),
      origin: url.origin,
      pattern: `${url.origin}/*`
    };
  } catch {
    return null;
  }
}

export async function hasHostPermission(pattern: string): Promise<boolean> {
  const permissions = getPermissionsAPI();
  if (!permissions?.contains) {
    return true;
  }

  try {
    return await callPermissionsMethod(permissions.contains, [pattern]);
  } catch {
    return false;
  }
}

export async function ensureHostPermission(pattern: string): Promise<boolean> {
  const permissions = getPermissionsAPI();
  if (!permissions) {
    return true;
  }

  if (permissions.contains) {
    try {
      const alreadyGranted = await callPermissionsMethod(permissions.contains, [pattern]);
      if (alreadyGranted) {
        return true;
      }
    } catch {
      // If the permissions API throws we fall back to requesting explicit access.
    }
  }

  if (!permissions.request) {
    return false;
  }

  try {
    return await callPermissionsMethod(permissions.request, [pattern]);
  } catch {
    return false;
  }
}
