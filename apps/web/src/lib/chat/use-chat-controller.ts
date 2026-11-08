import { useEffect, useState } from 'react';
import type { ChatController } from './controller';

/**
 * The controller module carries the demo pool, the transport and the settings
 * reader, so a page that only shows the sidebar should not load it. The sidebar
 * calls this with enabled = false until the chat page needs the session list.
 */
export function useChatController(enabled = true): ChatController | null {
  const [controller, setController] = useState<ChatController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void import('./controller').then(({ getChatController }) => {
      if (cancelled) return;
      const chat = getChatController();
      chat.hydrate();
      setController(chat);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return controller;
}
