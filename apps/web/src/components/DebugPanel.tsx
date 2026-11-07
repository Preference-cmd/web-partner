import { PanelRightIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getChatController } from '@/lib/chat/controller';
import { loadSettings, readApiKey, resolveMode } from '@/lib/chat/settings';
import type { ChatMode, Emotion } from '@/lib/chat/types';
import { useMediaQuery } from '@/lib/ui/use-media-query';

const EMOTIONS: ReadonlyArray<{ id: Emotion; label: string }> = [
  { id: 'idle', label: '待机' },
  { id: 'happy', label: '开心' },
  { id: 'shy', label: '害羞' },
  { id: 'sleepy', label: '犯困' },
];

const LIGHTS = ['冷夜空', '暖黄昏', '深夜', '清晨'] as const;

const SOURCE: Record<string, string> = { demo: '演示', model: '模型', fallback: '模板回复' };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function DebugBody({ emotion, mode }: { emotion: Emotion; mode: ChatMode }) {
  const controller = getChatController();
  const messages = useStore(controller.store, (state) => state.messages);
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    setDpr(Math.round(window.devicePixelRatio * 100) / 100);
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">状态</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5 pt-0 text-xs">
          <Row label="情绪" value={emotion} />
          <Row label="模式" value={mode === 'live' ? '实际' : '演示'} />
          <Row label="消息" value={`${messages.length} 条`} />
          <Row label="DPR" value={String(dpr)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">情绪</CardTitle>
          <CardDescription className="text-xs">
            由回复内容推进；手动切换等调试面板提案。
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ToggleGroup type="single" variant="outline" size="sm" value={emotion} disabled>
            {EMOTIONS.map((item) => (
              <ToggleGroupItem key={item.id} value={item.id}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">灯光主题</CardTitle>
          <CardDescription className="text-xs">等角色渲染器落地后可用。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ToggleGroup type="single" variant="outline" size="sm" value="冷夜空" disabled>
            {LIGHTS.map((label) => (
              <ToggleGroupItem key={label} value={label}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">最近消息</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0 text-xs">
          {messages.length === 0 ? (
            <p className="text-muted-foreground">还没有消息。</p>
          ) : (
            messages.slice(-4).map((message) => (
              <div key={message.id} className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0 text-xs">
                  {message.role === 'user' ? '你' : (SOURCE[message.source ?? 'demo'] ?? '演示')}
                </Badge>
                <span className="line-clamp-2 text-muted-foreground">{message.content || '…'}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>('demo');
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const controller = getChatController();
  const emotion = useStore(controller.store, (state) => state.emotion);

  useEffect(() => {
    const settings = loadSettings(window.localStorage);
    setMode(resolveMode(settings, readApiKey(window.sessionStorage, window.localStorage)));
  }, []);

  return (
    <TooltipProvider>
      <div className="fixed top-3 right-3 z-40">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={open ? '关闭调试面板' : '打开调试面板'}
              aria-expanded={open}
              className="bg-background/80 backdrop-blur"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <XIcon /> : <PanelRightIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{open ? '关闭调试面板' : '打开调试面板'}</TooltipContent>
        </Tooltip>
      </div>

      {open && isDesktop ? (
        <aside
          className="hidden h-dvh w-90 shrink-0 flex-col border-l bg-card/40 pr-12 md:flex"
          aria-label="调试面板"
        >
          <div className="flex items-center px-4 pt-4 text-sm font-semibold">调试面板</div>
          <DebugBody emotion={emotion} mode={mode} />
        </aside>
      ) : null}

      {!isDesktop ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-[85vw] max-w-sm p-0" aria-describedby={undefined}>
            <SheetTitle className="sr-only">调试面板</SheetTitle>
            <div className="flex items-center px-4 pt-4 text-sm font-semibold">调试面板</div>
            <DebugBody emotion={emotion} mode={mode} />
          </SheetContent>
        </Sheet>
      ) : null}
    </TooltipProvider>
  );
}
