import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { OPEN_SETTINGS_EVENT } from '@/lib/ui/open-settings';
import SettingsPanel from './SettingsPanel';

function initiallyOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('settings');
}

export default function SettingsDialog() {
  const [open, setOpen] = useState(initiallyOpen);
  // Radix can only restore focus to a trigger; this dialog is opened by state.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const openDialog = () => {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, openDialog);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, openDialog);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const present = url.searchParams.has('settings');
    if (open && !present) url.searchParams.set('settings', '1');
    if (!open && present) url.searchParams.delete('settings');
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex h-[92dvh] w-[min(calc(100vw-1rem),60rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:h-[min(760px,90dvh)] sm:w-[min(calc(100vw-2rem),60rem)]"
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
      >
        <header className="flex flex-col gap-1 border-b px-4 py-3 pr-14 sm:px-6">
          <DialogTitle className="text-base font-semibold">设置</DialogTitle>
          <DialogDescription>
            改完即保存。API key 只留在当前标签页，关掉浏览器就没了。
          </DialogDescription>
        </header>
        <div className="min-h-0 flex-1">
          <SettingsPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
