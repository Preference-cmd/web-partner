/** The chat page owns the settings dialog; other surfaces only ask for it. */
export const OPEN_SETTINGS_EVENT = 'partner:open-settings';

export function requestSettings(): void {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
