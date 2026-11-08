import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { OPEN_SETTINGS_EVENT } from '@/lib/ui/open-settings';
import SettingsPanel from './SettingsPanel';

function initiallyOpen(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('settings');
}

export default function SettingsDialog() {
  const [open, setOpen] = useState(initiallyOpen);

  useEffect(() => {
    const openDialog = () => setOpen(true);
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
      <DialogContent className="flex max-h-[85vh] w-[min(calc(100vw-2rem),72rem)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <header className="flex flex-col gap-1 border-b px-6 py-4 pr-14">
          <DialogTitle className="text-base font-semibold">设置</DialogTitle>
          <DialogDescription>
            连接、模型调用、模式与外观都存在这台设备。API key 只留在当前标签页，关掉就没了。
          </DialogDescription>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <SettingsPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
