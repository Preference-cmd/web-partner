import { cn } from 'cn';
import { MenuIcon, MessageCircleIcon, PanelLeftIcon, PlusIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import SessionList from '@/components/SessionList';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatController } from '@/lib/chat/controller';
import { describeMode, loadSettings, readApiKey } from '@/lib/chat/settings';
import type { ChatMode } from '@/lib/chat/types';
import { useChatController } from '@/lib/chat/use-chat-controller';
import { requestSettings } from '@/lib/ui/open-settings';

interface SidebarProps {
  license?: boolean;
}

function readMode(): ChatMode {
  const settings = loadSettings(window.localStorage);
  return describeMode(settings, readApiKey(window.sessionStorage, window.localStorage)).mode;
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-1 pt-1">
      <span className="size-6 shrink-0 rounded-md bg-gradient-to-br from-sky-300 via-blue-500 to-blue-900 shadow-[0_0_18px_rgba(96,165,250,0.35)]" />
      <span className="truncate text-sm font-semibold">伴侣小生命</span>
    </div>
  );
}

function SidebarBody({
  license,
  mode,
  chat,
  onCollapse,
  onNewChat,
  onSettings,
}: {
  license: boolean;
  mode: ChatMode;
  chat: ChatController | null;
  onCollapse?: () => void;
  onNewChat?: () => void;
  onSettings?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center gap-1">
        <Brand />
        {onCollapse ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="收起侧边栏"
                onClick={onCollapse}
                className="shrink-0"
              >
                <PanelLeftIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>收起侧边栏</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <Button asChild className="w-full justify-start">
        <a
          href="/?new=1"
          data-new-chat
          onClick={(event) => {
            // On the chat page the controller is right here; the link is the no-JS path.
            if (!chat) return;
            event.preventDefault();
            chat.newSession();
            onNewChat?.();
          }}
        >
          <PlusIcon data-icon="inline-start" />
          新对话
        </a>
      </Button>

      <nav className="flex flex-col gap-1" aria-label="主导航">
        <Button asChild variant="secondary" className="w-full justify-start">
          <a href="/" aria-current="page">
            <MessageCircleIcon data-icon="inline-start" />
            对话
          </a>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            requestSettings();
            onSettings?.();
          }}
        >
          <SettingsIcon data-icon="inline-start" />
          设置
        </Button>
      </nav>

      <Separator />

      <div className="px-1 text-xs font-medium text-muted-foreground">本机对话</div>
      <SessionList controller={chat} onPick={onNewChat} />

      <div className="mt-auto flex flex-col gap-3">
        <Badge variant="secondary" className="w-fit gap-1.5" data-side-mode data-mode={mode}>
          <span
            className={cn(
              'size-1.5 rounded-full',
              mode === 'live' ? 'bg-emerald-400' : 'bg-muted-foreground',
            )}
          />
          <span className="mode-text">{mode === 'live' ? '实时模式' : '演示模式'}</span>
        </Badge>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Avatar className="size-5">
            <AvatarFallback className="text-xs">我</AvatarFallback>
          </Avatar>
          本机用户
        </div>
        {license ? (
          <a
            className="text-xs leading-relaxed text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            href="/character/ATTRIBUTION.md"
            title="角色素材署名与许可"
          >
            非官方、非商业演示
            <br />
            角色素材 CC BY-NC-SA 4.0
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function Sidebar({ license = true }: SidebarProps) {
  const [mode, setMode] = useState<ChatMode>('demo');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const chat = useChatController();

  useEffect(() => {
    setMode(readMode());
  }, []);

  return (
    <TooltipProvider>
      <Button
        variant="outline"
        size="icon"
        aria-label="打开侧边栏"
        className="fixed top-3 left-3 z-40 bg-background/80 backdrop-blur md:hidden"
        onClick={() => setDrawerOpen(true)}
      >
        <MenuIcon />
      </Button>

      {collapsed ? (
        <div className="fixed top-3 left-3 z-40 hidden md:block">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="展开侧边栏"
                className="bg-background/80 backdrop-blur"
                onClick={() => setCollapsed(false)}
              >
                <PanelLeftIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>展开侧边栏</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <aside
          className="hidden h-dvh w-60 shrink-0 flex-col border-r bg-card/40 md:flex"
          aria-label="侧边栏"
        >
          <SidebarBody
            license={license}
            mode={mode}
            chat={chat}
            onCollapse={() => setCollapsed(true)}
          />
        </aside>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            // Picking a conversation closes the drawer; put focus back on its button.
            event.preventDefault();
            document.querySelector<HTMLElement>("button[aria-label='打开侧边栏']")?.focus();
          }}
        >
          <SheetTitle className="sr-only">侧边栏</SheetTitle>
          <SidebarBody
            license={license}
            mode={mode}
            chat={chat}
            onNewChat={() => setDrawerOpen(false)}
            onSettings={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
