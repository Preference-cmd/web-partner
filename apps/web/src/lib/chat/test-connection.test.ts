import { describe, expect, it, vi } from 'vitest';
import { type ProbeTarget, probeReadiness, runProbe } from './test-connection';

const target: ProbeTarget = {
  endpoint: 'https://api.example.com/v1',
  model: 'demo-model',
  apiKey: 'sk-test',
  direct: false,
  protocol: 'openai',
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
    expect(probeReadiness({ ...target, model: '' })).toContain('模型');
    expect(probeReadiness({ ...target, apiKey: '' })).toContain('API key');
    expect(probeReadiness({ ...target, direct: true, apiKey: '' })).toBeNull();
    const result = await runProbe({ ...target, endpoint: '' });
    expect(result.outcome).toBe('incomplete');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the proxy verdict', async () => {
    stub(Response.json({ outcome: 'ok', reason: '端点应答 HTTP 200' }));
    expect(await runProbe(target)).toEqual({
      outcome: 'ok',
      reason: '端点应答 HTTP 200',
    });

    const unfaithful = stub(Response.json({ outcome: 'unreachable', reason: '连不上端点' }));
    expect((await runProbe(target)).outcome).toBe('unreachable');
    const call = unfaithful.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.probe).toBe(true);
    expect(body.apiKey).toBe('sk-test');
    expect(body.protocol).toBe('openai');
  });

  it('maps a rejected key and a dead endpoint', async () => {
    stub(new Response('{}', { status: 401 }));
    expect((await runProbe({ ...target, direct: true })).outcome).toBe('unauthorized');

    stub(new TypeError('Failed to fetch'));
    const dead = await runProbe({ ...target, direct: true });
    expect(dead.outcome).toBe('unreachable');
    expect(dead.reason).toContain('CORS');
  });

  it('turns a proxy rejection into the reason it carries', async () => {
    stub(
      new Response(JSON.stringify({ error: 'endpoint must be a public https URL' }), {
        status: 400,
      }),
    );
    const result = await runProbe(target);
    expect(result).toEqual({
      outcome: 'unreachable',
      reason: 'endpoint must be a public https URL',
    });
  });

  it('sends the direct probe as one non-streaming turn', async () => {
    const fetchMock = stub(Response.json({ choices: [] }));
    expect((await runProbe({ ...target, direct: true })).outcome).toBe('ok');
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(String(call[1].body)) as Record<string, unknown>;
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(8);
    expect(body.model).toBe('demo-model');
  });
});
