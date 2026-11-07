import { useEffect, useRef, useState } from 'react';
import { createChatStorage } from '../lib/chat/chat-storage';
import {
  ALPHA_MAX,
  ALPHA_MIN,
  applyAppearance,
  applyModeChip,
  clearApiKey,
  clearSettings,
  DEFAULT_SETTINGS,
  describeMode,
  endpointHint,
  loadSettings,
  type Motion,
  readApiKey,
  type Settings,
  saveApiKey,
  saveSettings,
} from '../lib/chat/settings';

const MODE_OPTIONS = [
  { id: 'demo', label: '演示' },
  { id: 'live', label: '实际' },
  { id: 'force', label: '强制演示' },
] as const;

const MOTION_OPTIONS: ReadonlyArray<{ id: Motion; label: string }> = [
  { id: 'system', label: '跟随系统' },
  { id: 'reduced', label: '减少动效' },
  { id: 'full', label: '完整' },
];

type ModeChoice = (typeof MODE_OPTIONS)[number]['id'];

/** The chat controller outlives this page; clearing history must reach it. */
interface ClearableChat {
  clear: () => void;
}

function chatController(): ClearableChat | undefined {
  return (globalThis as { __partnerChat?: ClearableChat }).__partnerChat;
}

function modeChoice(settings: Settings): ModeChoice {
  if (settings.forceDemo) return 'force';
  return settings.mode;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [flash, setFlash] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const stored = loadSettings(window.localStorage);
    setSettings(stored);
    setApiKey(readApiKey(window.sessionStorage, window.localStorage));
    applyAppearance(document.documentElement, stored);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  function flashSaved(text = '已保存'): void {
    setFlash(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(''), 1800);
  }

  function syncChip(next: Settings, key: string): void {
    applyModeChip(document, describeMode(next, key).mode);
  }

  function update(patch: Partial<Settings>): void {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(window.localStorage, next);
    applyAppearance(document.documentElement, next);
    syncChip(next, apiKey);
    flashSaved();
  }

  function pickMode(choice: ModeChoice): void {
    update(choice === 'force' ? { forceDemo: true } : { forceDemo: false, mode: choice });
  }

  function changeKey(value: string): void {
    setApiKey(value);
    saveApiKey(window.sessionStorage, value);
    syncChip(settings, value);
    flashSaved();
  }

  function clearHistory(): void {
    if (!window.confirm('清空本机的对话历史？这个操作不可撤销。')) return;
    createChatStorage(window.localStorage).clear();
    chatController()?.clear();
    flashSaved('历史已清空');
  }

  function removeKey(): void {
    if (!apiKey) {
      flashSaved('还没有 key');
      return;
    }
    if (!window.confirm('清除当前标签页里的 API key？')) return;
    clearApiKey(window.sessionStorage, window.localStorage);
    setApiKey('');
    syncChip(settings, '');
    flashSaved('key 已清除');
  }

  function reset(): void {
    if (!window.confirm('恢复默认设置？端点、模型与外观都会回到初始值，key 不动。')) return;
    clearSettings(window.localStorage);
    const next = { ...DEFAULT_SETTINGS };
    setSettings(next);
    applyAppearance(document.documentElement, next);
    syncChip(next, apiKey);
    flashSaved('已恢复默认');
  }

  const status = describeMode(settings, apiKey);
  const live = status.mode === 'live';
  const hint = endpointHint(settings.endpoint, settings.direct);
  const missingModel = settings.endpoint.trim().length > 0 && !settings.model.trim();

  return (
    <div className="set">
      <h1>设置</h1>
      <p className="sub">连接、模式与外观都存在这台设备。API key 只留在当前标签页，关掉就没了。</p>

      <div className="set-status" data-mode={status.mode}>
        <span className="dot" />
        当前生效：{live ? '实际模式' : '演示模式'} · {status.reason}
        <span className="flash" aria-live="polite">
          {flash}
        </span>
      </div>

      <section>
        <h2>连接</h2>
        <div className="set-field">
          <label htmlFor="set-endpoint">端点</label>
          <input
            id="set-endpoint"
            className="text"
            type="url"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            placeholder="https://api.openai.com/v1"
            value={settings.endpoint}
            onChange={(event) => update({ endpoint: event.target.value })}
          />
          <p className="help">OpenAI 兼容的 base URL，末尾不用带 /chat/completions。</p>
          {hint ? <p className="warn">{hint}</p> : null}
        </div>

        <div className="set-field">
          <label htmlFor="set-model">模型</label>
          <input
            id="set-model"
            className="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="gpt-4o-mini"
            value={settings.model}
            onChange={(event) => update({ model: event.target.value })}
          />
          {missingModel ? <p className="warn">端点已经填了，模型名不能空着。</p> : null}
        </div>

        <div className="set-field">
          <label htmlFor="set-key">API key</label>
          <div className="secret">
            <input
              id="set-key"
              className="text"
              type={showKey ? 'text' : 'password'}
              spellCheck={false}
              autoComplete="off"
              placeholder={settings.direct ? '直连时可以空着' : 'sk-…'}
              value={apiKey}
              onChange={(event) => changeKey(event.target.value)}
            />
            <button
              className="chip"
              type="button"
              aria-pressed={showKey}
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="help">
            存 sessionStorage：刷新还在，关掉标签页即清除；请求时经代理内存转发，不写日志。
          </p>
        </div>

        <label className="set-switch">
          <span>
            直连端点
            <span className="help">
              浏览器直接请求，不经过代理。本机模型或允许 CORS 的端点用这个。
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.direct}
            onChange={(event) => update({ direct: event.target.checked })}
          />
        </label>
      </section>

      <section>
        <h2>模式</h2>
        <div className="chips">
          {MODE_OPTIONS.map((option) => {
            const on = modeChoice(settings) === option.id;
            return (
              <button
                className={on ? 'chip on' : 'chip'}
                type="button"
                key={option.id}
                aria-pressed={on}
                onClick={() => pickMode(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="help">
          {live
            ? '新消息发给你的端点；请求失败或返回空文本时回落到本地模板，气泡标「回落」。'
            : '回复来自本地模板，不发任何网络请求。填好端点并选「实际」才会调用模型。'}
        </p>
      </section>

      <section>
        <h2>外观</h2>
        <div className="set-field">
          <label htmlFor="set-alpha">
            浮置面板透明度 <b>{settings.panelAlpha.toFixed(2)}</b>
          </label>
          <input
            id="set-alpha"
            type="range"
            min={ALPHA_MIN}
            max={ALPHA_MAX}
            step={0.02}
            value={settings.panelAlpha}
            onChange={(event) => update({ panelAlpha: Number(event.target.value) })}
          />
          <p className="help">对话面板背景的不透明度，0.4–0.9；文字始终不透明。</p>
        </div>

        <div className="set-field">
          <span className="field-label">动效</span>
          <div className="chips">
            {MOTION_OPTIONS.map((option) => {
              const on = settings.motion === option.id;
              return (
                <button
                  className={on ? 'chip on' : 'chip'}
                  type="button"
                  key={option.id}
                  aria-pressed={on}
                  onClick={() => update({ motion: option.id })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="help">关掉舞台浮尘、打字点与面板过渡的动画。</p>
        </div>

        <div className="set-field">
          <span className="field-label">灯光主题</span>
          <p className="help">等角色渲染器落地后在这里选；现在的舞台固定冷夜空。</p>
        </div>
      </section>

      <section>
        <h2>数据</h2>
        <div className="set-actions">
          <button className="ghost danger" type="button" onClick={clearHistory}>
            清空对话历史
          </button>
          <button className="ghost" type="button" onClick={removeKey}>
            清除 API key
          </button>
          <button className="ghost" type="button" onClick={reset}>
            恢复默认设置
          </button>
        </div>
        <p className="help">
          三项互相独立：历史最多 100 条存在 localStorage，key 在当前标签页，设置同样在本机。
        </p>
      </section>

      <section>
        <h2>关于</h2>
        <div className="row">
          <span className="label">版本</span>
          <span className="value">0.1.0</span>
        </div>
        <div className="row">
          <span className="label">角色素材</span>
          <span className="value">CC BY-NC-SA 4.0 · 非商业演示</span>
        </div>
        <div className="row">
          <span className="label">登录</span>
          <span className="value">占位页，不接后端</span>
        </div>
      </section>
    </div>
  );
}
