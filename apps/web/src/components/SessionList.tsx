import { cn } from 'cn';
import { PencilIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ChatController } from '@/lib/chat/controller';
import { formatSessionTime } from '@/lib/chat/session-format';
import type { SessionSummary } from '@/lib/chat/types';

interface SessionListProps {
  controller: ChatController | null;
  /** Called after a switch, so the phone drawer can close itself. */
  onPick?: () => void;
}

export default function SessionList({ controller, onPick }: SessionListProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null);
  const cancelled = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!controller) return;
    let previous = controller.store.getState();
    setSessions(previous.sessions);
    setActiveId(previous.activeId);
    // The store also changes on every streamed token; the list only cares about
    // the session array and the active id, both replaced only on session events.
    const read = (): void => {
      const next = controller.store.getState();
      if (next.sessions === previous.sessions && next.activeId === previous.activeId) return;
      previous = next;
      setSessions(next.sessions);
      setActiveId(next.activeId);
    };
    return controller.store.subscribe(read);
  }, [controller]);

  function pick(session: SessionSummary): void {
    controller?.switchSession(session.id);
    onPick?.();
  }

  function startRename(session: SessionSummary): void {
    cancelled.current = false;
    setEditing(session.id);
    setDraft(session.title);
  }

  function saveRename(): void {
    if (!editing) return;
    controller?.renameSession(editing, draft);
    setEditing(null);
  }

  function cancelRename(): void {
    cancelled.current = true;
    setEditing(null);
  }

  if (sessions.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">读取本机历史…</p>;
  }

  return (
    <>
      <ul
        ref={listRef}
        className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
        aria-label="本机对话"
      >
        {sessions.map((session) => {
          const active = session.id === activeId;
          return (
            <li
              key={session.id}
              className={cn(
                'group flex items-center gap-0.5 rounded-md',
                active ? 'bg-secondary' : 'hover:bg-accent/50',
              )}
            >
              {editing === session.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-1 p-0.5">
                  <Input
                    value={draft}
                    autoFocus
                    maxLength={40}
                    aria-label="会话名称"
                    className="h-7 min-w-0 text-xs"
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => {
                      if (cancelled.current) {
                        cancelled.current = false;
                        return;
                      }
                      saveRename();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        saveRename();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="取消重命名"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={cancelRename}
                  >
                    <XIcon />
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => pick(session)}
                    aria-current={active ? 'page' : undefined}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left"
                  >
                    <span className="w-full truncate text-xs text-foreground/90">
                      {session.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatSessionTime(session.updatedAt)}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`重命名「${session.title}」`}
                      onClick={() => startRename(session)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`删除「${session.title}」`}
                      onClick={() => setPendingDelete(session)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // The dialog is opened by state, not a trigger, so Radix has nowhere to return to.
            event.preventDefault();
            const list = listRef.current;
            const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
            const first = list?.querySelector<HTMLElement>('li button');
            (active ?? first)?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>删除这段对话？</AlertDialogTitle>
            <AlertDialogDescription>
              「{pendingDelete?.title}」的消息会从这台设备删除，不能恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) controller?.deleteSession(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
