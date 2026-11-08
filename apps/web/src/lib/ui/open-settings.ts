/** The chat page owns the settings dialog; other surfaces only ask for it. */
export const OPEN_SETTINGS_EVENT = 'partner:open-settings';

/** Settings were written; the composer and other readers should re-read them. */
export const SETTINGS_CHANGED_EVENT = 'partner:settings-changed';

export function requestSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function announceSettings(): void {
  window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
}
