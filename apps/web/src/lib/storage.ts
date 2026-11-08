export interface StringStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** Storage access is guarded: private mode and a full quota must not break the page. */
export function readKey(storage: StringStorage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeKey(storage: StringStorage | undefined, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Private mode or a full quota: the session keeps working without persistence.
  }
}

export function dropKey(storage: StringStorage | undefined, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to remove.
  }
}
