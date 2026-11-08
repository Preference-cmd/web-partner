/** How long a stage bubble stays up before it fades on its own. */
export const BUBBLE_MS = 10_000;

let timer: number | undefined;

/** One short line is all a stage bubble shows; the chat keeps the rest. */
export function firstSentence(text: string, max = 48): string {
  const line = (text.split(/[。！？!?\n]/u)[0] ?? '').trim();
  if (!line) return '';
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function element(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-character-bubble]');
}

/**
 * The bubble is stage furniture: it speaks for the character but never touches
 * the chat, the model or the mood. One bubble at a time.
 */
export function showBubble(text: string, ms = BUBBLE_MS): void {
  const node = element();
  if (!node) return;
  node.textContent = text;
  node.dataset.visible = 'true';
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    hideBubble();
  }, ms);
}

export function hideBubble(): void {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
  const node = element();
  if (!node) return;
  node.dataset.visible = 'false';
}
