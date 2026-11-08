import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { probeReadiness, runProbe } from './test-connection';

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  endpoint: 'https://api.example.com/v1',
  model: 'demo-model',
};

function stub(response: Response | Error): ReturnType<typeof vi.fn> {
  const mock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('connection probe', () => {
  it('asks for what is missing before sending anything', async () => {
    const fetchMock = stub(new Response('{}', { status: 200 }));
    expect(probeReadiness({ ...settings, model: '' }, 'sk-test')).toContain('模型');
    expect(probeReadiness(settings, '')).toContain('API key');
    expect(probeReadiness({ ...settings, direct: true }, '')).toBeNull();
    const result = await runProbe({ ...settings, endpoint: '' }, 'sk-test');
    expect(result.outcome).toBe('incomplete');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the proxy verdict', async () => {
    stub(Response.json({ outcome: 'ok', reason: '端点应答 HTTP 200' }));
    expect(await runProbe(settings, 'sk-test')).toEqual({
      outcome: 'ok',
      reason: '端点应答 HTTP 200',
    });

    const unfaithful = stub(Response.json({ outcome: 'unreachable', reason: '连不上端点' }));
    expect((await runProbe(settings, 'sk-test')).outcome).toBe('unreachable');
    const call = unfaithful.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.probe).toBe(true);
    expect(body.apiKey).toBe('sk-test');
  });

  it('maps a rejected key and a dead endpoint', async () => {
    stub(new Response('{}', { status: 401 }));
    expect((await runProbe({ ...settings, direct: true }, 'sk-bad')).outcome).toBe('unauthorized');

    stub(new TypeError('Failed to fetch'));
    const dead = await runProbe({ ...settings, direct: true }, 'sk-test');
    expect(dead.outcome).toBe('unreachable');
    expect(dead.reason).toContain('CORS');
  });

  it('turns a proxy rejection into the reason it carries', async () => {
    stub(
      new Response(JSON.stringify({ error: 'endpoint must be a public https URL' }), {
        status: 400,
      }),
    );
    const result = await runProbe(settings, 'sk-test');
    expect(result).toEqual({
      outcome: 'unreachable',
      reason: 'endpoint must be a public https URL',
    });
  });

  it('sends the direct probe as one non-streaming turn', async () => {
    const fetchMock = stub(Response.json({ choices: [] }));
    expect((await runProbe({ ...settings, direct: true }, 'sk-test')).outcome).toBe('ok');
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(8);
    expect(body.model).toBe('demo-model');
  });
});
