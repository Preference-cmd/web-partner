import type { Protocol, Provider } from './settings';
import type { ModelMessage } from './types';

/** What a connection test can end in, in the words the settings panel shows. */
export type ProbeOutcome = 'incomplete' | 'ok' | 'unreachable' | 'unauthorized';

export interface ProbeResult {
  outcome: ProbeOutcome;
  reason: string;
}

/** The unsaved values one test would send, so a dialog can test before saving. */
export interface ProbeTarget {
  endpoint: string;
  model: string;
  apiKey: string;
  direct: boolean;
  protocol: Protocol;
}

/** One short turn: the point is reachability, not content. */
const PING: ModelMessage[] = [{ role: 'user', content: 'ping' }];
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_MAX_TOKENS = 8;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

function trimSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

export function probeTarget(provider: Provider, model: string, apiKey: string): ProbeTarget {
  return {
    endpoint: provider.baseUrl,
    model,
    apiKey,
    direct: provider.direct,
    protocol: provider.protocol,
  };
}

/** Why the test button cannot run yet, or null when it can. */
export function probeReadiness(target: ProbeTarget): string | null {
  if (!target.endpoint.trim()) return '先填 base URL';
  if (!target.model.trim()) return '先填模型名';
  if (!target.apiKey.trim() && !target.direct) return '经代理需要 API key，或者打开直连';
  return null;
}

function fromStatus(status: number): ProbeResult {
  if (status === 401 || status === 403) {
    return {
      outcome: 'unauthorized',
      reason: `key 或权限被拒绝（HTTP ${status}）：检查 key 是否有效、是否允许这个模型`,
    };
  }
  if (status === 404) {
    return {
      outcome: 'unreachable',
      reason: '端点返回 404：base URL 一般以 /v1 结尾，末尾不要带 /chat/completions',
    };
  }
  return {
    outcome: 'unreachable',
    reason: `端点返回 HTTP ${status}：先确认 base URL、模型名与账号额度`,
  };
}

async function probeDirect(target: ProbeTarget, fetcher: Fetcher): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetcher(`${trimSlash(target.endpoint.trim())}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: target.model.trim(),
        messages: PING,
        max_tokens: PROBE_MAX_TOKENS,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return {
      outcome: 'unreachable',
      reason: '浏览器连不上这个端点：直连要求端点允许 CORS，本机地址要用 http 打开页面',
    };
  }
  return response.ok ? { outcome: 'ok', reason: '端点有响应' } : fromStatus(response.status);
}

async function probeProxy(target: ProbeTarget, fetcher: Fetcher): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetcher('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        endpoint: target.endpoint.trim(),
        apiKey: target.apiKey,
        model: target.model.trim(),
        protocol: target.protocol,
        messages: PING,
        maxOutputTokens: PROBE_MAX_TOKENS,
        probe: true,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return { outcome: 'unreachable', reason: '代理没响应：确认页面由 pnpm dev 或部署环境提供' };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let reason = text.slice(0, 160);
    try {
      const body = JSON.parse(text) as { error?: unknown };
      if (typeof body.error === 'string' && body.error) reason = body.error;
    } catch {
      // Not JSON; the raw text is the best reason there is.
    }
    return {
      outcome: 'unreachable',
      reason: reason || `代理返回 HTTP ${response.status}`,
    };
  }
  try {
    const body = (await response.json()) as { outcome?: unknown; reason?: unknown };
    if (body.outcome === 'ok') {
      return {
        outcome: 'ok',
        reason: typeof body.reason === 'string' ? body.reason : '端点有响应',
      };
    }
    if (body.outcome === 'unauthorized') {
      return {
        outcome: 'unauthorized',
        reason: 'key 或权限被拒绝：检查 key 是否有效、是否允许这个模型',
      };
    }
    return {
      outcome: 'unreachable',
      reason: typeof body.reason === 'string' ? body.reason : '端点没有按预期响应',
    };
  } catch {
    return { outcome: 'unreachable', reason: '代理返回的不是 JSON：检查 /api/chat 是否在位' };
  }
}

/**
 * One minimal request to the endpoint, through the proxy or straight at it.
 * Nothing is stored, nothing is retried, and the key stays in this call.
 */
export async function runProbe(
  target: ProbeTarget,
  fetcher: Fetcher = fetch,
): Promise<ProbeResult> {
  const blocked = probeReadiness(target);
  if (blocked) return { outcome: 'incomplete', reason: blocked };
  const key = target.apiKey.trim();
  return target.direct
    ? probeDirect({ ...target, apiKey: key }, fetcher)
    : probeProxy({ ...target, apiKey: key }, fetcher);
}
