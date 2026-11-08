import { useEffect, useState } from 'react';
import { type ChatController, getChatController } from './controller';

/** The chat page mounts the controller; the sidebar subscribes once it exists. */
export function useChatController(): ChatController | null {
  const [controller, setController] = useState<ChatController | null>(null);

  useEffect(() => {
    const chat = getChatController();
    chat.hydrate();
    setController(chat);
  }, []);

  return controller;
}
