import { describe, expect, it } from 'vitest';
import {
  CONTEXT_DEFAULT,
  CONTEXT_MAX,
  CONTEXT_MIN,
  OUTPUT_DEFAULT,
  OUTPUT_MAX,
  OUTPUT_MIN,
} from './llm';
import {
  ALPHA_DEFAULT,
  ALPHA_MAX,
  ALPHA_MIN,
  activeProvider,
  activeTarget,
  applyAppearance,
  clampEffort,
  clearAllProviderKeys,
  clearProviderKey,
  clearSettings,
  currentApiKey,
  DEFAULT_SETTINGS,
  describeMode,
  effortOptions,
  endpointHint,
  LEGACY_PROVIDER_ID,
  loadSettings,
  modelLabel,
  normalizeActive,
  PROVIDER_LIMIT,
  PROVIDER_MODEL_LIMIT,
  type Provider,
  readProviderKey,
  resolveMode,
  SECRETS_KEY,
  SETTINGS_KEY,
  type Settings,
  type StringStorage,
  saveProviderKey,
  saveSettings,
} from './settings';

/** The single key file that predates providers. */
const LEGACY_SECRET_KEY = 'partner.secret.v1';

function memoryStorage(seed: Record<string, string> = {}): StringStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const provider: Provider = {
  id: 'p-one',
  name: '示例供应商',
  protocol: 'openai',
  baseUrl: 'https://api.example.com/v1',
  direct: false,
  models: [
    { id: 'm-one', model: 'demo-model', label: '小模型' },
    { id: 'm-two', model: 'gpt-4o' },
  ],
  efforts: ['low', 'high'],
};

function withProvider(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    providers: [{ ...provider, models: [...provider.models], efforts: [...provider.efforts] }],
    activeProviderId: 'p-one',
    activeModel: 'demo-model',
    ...patch,
  };
}

describe('settings', () => {
  it('falls back to defaults without storage', () => {
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores a corrupt record', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips the saved settings', () => {
    const storage = memoryStorage();
    const settings = withProvider({ mode: 'live', effort: 'high' });
    saveSettings(storage, settings);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('keeps a stored alpha inside the slider range', () => {
    const store = (panelAlpha: unknown) =>
      loadSettings(
        memoryStorage({
          [SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, panelAlpha }),
        }),
      ).panelAlpha;
    expect(store(ALPHA_DEFAULT)).toBe(ALPHA_DEFAULT);
    expect(store(0.1)).toBe(ALPHA_MIN);
    expect(store(1.4)).toBe(ALPHA_MAX);
    expect(store('0.5')).toBe(ALPHA_DEFAULT);
    expect(store(undefined)).toBe(ALPHA_DEFAULT);
  });

  it('clamps the model-call numbers', () => {
    const stored = (patch: Record<string, unknown>) =>
      loadSettings(
        memoryStorage({
          [SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, ...patch }),
        }),
      );
    expect(stored({ maxOutputTokens: 2048 }).maxOutputTokens).toBe(2048);
    expect(stored({ maxOutputTokens: 1 }).maxOutputTokens).toBe(OUTPUT_MIN);
    expect(stored({ maxOutputTokens: 99999 }).maxOutputTokens).toBe(OUTPUT_MAX);
    expect(stored({ maxOutputTokens: 'big' }).maxOutputTokens).toBe(OUTPUT_DEFAULT);
    expect(stored({ contextTokens: 8000 }).contextTokens).toBe(8000);
    expect(stored({ contextTokens: 0 }).contextTokens).toBe(CONTEXT_MIN);
    expect(stored({ contextTokens: 99999 }).contextTokens).toBe(CONTEXT_MAX);
    expect(stored({ contextTokens: null }).contextTokens).toBe(CONTEXT_DEFAULT);
  });

  it('only accepts a known motion value', () => {
    const store = (motion: unknown) =>
      loadSettings(
        memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ ...DEFAULT_SETTINGS, motion }) }),
      ).motion;
    expect(store('reduced')).toBe('reduced');
    expect(store('full')).toBe('full');
    expect(store('system')).toBe('system');
    expect(store('sometimes')).toBe('system');
  });

  it('fills the model-call defaults into an older record', () => {
    const older = {
      endpoint: 'https://api.example.com/v1',
      model: 'demo-model',
      mode: 'live',
      forceDemo: false,
      direct: false,
      panelAlpha: 0.7,
      motion: 'reduced',
      contextMessages: 20,
    };
    const loaded = loadSettings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify(older) }));
    expect(loaded.maxOutputTokens).toBe(OUTPUT_DEFAULT);
    expect(loaded.contextTokens).toBe(CONTEXT_DEFAULT);
    expect(loaded.panelAlpha).toBe(0.7);
  });

  it('clears the settings record', () => {
    const storage = memoryStorage({ [SETTINGS_KEY]: '{}' });
    clearSettings(storage);
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('turns a single-endpoint file into one provider and keeps its request', () => {
    const loaded = loadSettings(
      memoryStorage({
        [SETTINGS_KEY]: JSON.stringify({
          endpoint: 'https://api.example.com/v1',
          model: 'demo-model',
          modelPresets: [{ id: 'a', label: 'Fast', model: 'gpt-4o' }],
          effort: 'high',
          direct: true,
          mode: 'live',
          maxOutputTokens: 2048,
        }),
      }),
    );
    expect(loaded.providers).toEqual([
      {
        id: LEGACY_PROVIDER_ID,
        name: 'api.example.com',
        protocol: 'openai',
        baseUrl: 'https://api.example.com/v1',
        direct: true,
        models: [
          { id: 'm-demo-mod', model: 'demo-model' },
          { id: 'a', label: 'Fast', model: 'gpt-4o' },
        ],
        efforts: ['high'],
      },
    ]);
    expect(loaded.activeProviderId).toBe(LEGACY_PROVIDER_ID);
    expect(loaded.activeModel).toBe('demo-model');
    expect(loaded.mode).toBe('live');
    expect(loaded.maxOutputTokens).toBe(2048);
  });

  it('does not invent a provider for an empty file', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{}' })).providers).toEqual([]);
  });

  it('caps the stored providers and drops duplicates', () => {
    const many = Array.from({ length: PROVIDER_LIMIT + 4 }, (_, index) => ({
      ...provider,
      id: 'p-' + index,
      name: `P${index}`,
    }));
    const loaded = loadSettings(
      memoryStorage({
        [SETTINGS_KEY]: JSON.stringify({
          ...DEFAULT_SETTINGS,
          providers: [...many, { ...provider, id: 'p-0' }],
        }),
      }),
    );
    expect(loaded.providers).toHaveLength(PROVIDER_LIMIT);
    expect(new Set(loaded.providers.map((entry) => entry.id)).size).toBe(PROVIDER_LIMIT);
  });

  it('keeps models in order and drops empty or duplicate ones', () => {
    const loaded = loadSettings(
      memoryStorage({
        [SETTINGS_KEY]: JSON.stringify({
          ...DEFAULT_SETTINGS,
          providers: [
            {
              ...provider,
              models: [
                { id: 'a', model: 'gpt-4o-mini' },
                { id: 'b', model: '  ' },
                { id: 'c', model: 'gpt-4o-mini' },
                'nope',
                { id: 'd', model: 'gpt-4o', label: '  ' },
              ],
            },
          ],
        }),
      }),
    );
    expect(loaded.providers[0]?.models).toEqual([
      { id: 'a', model: 'gpt-4o-mini' },
      { id: 'd', model: 'gpt-4o' },
    ]);
    expect(loaded.activeModel).toBe('gpt-4o-mini');
  });

  it('caps the models of one provider', () => {
    const many = Array.from({ length: PROVIDER_MODEL_LIMIT + 3 }, (_, index) => ({
      id: 'm' + index,
      model: 'model-' + index,
    }));
    const loaded = loadSettings(
      memoryStorage({
        [SETTINGS_KEY]: JSON.stringify({
          ...DEFAULT_SETTINGS,
          providers: [{ ...provider, models: many }],
        }),
      }),
    );
    expect(loaded.providers[0]?.models).toHaveLength(PROVIDER_MODEL_LIMIT);
  });

  it('falls back to the first provider and model when the stored pair is gone', () => {
    const loaded = loadSettings(
      memoryStorage({
        [SETTINGS_KEY]: JSON.stringify({
          ...DEFAULT_SETTINGS,
          providers: [provider],
          activeProviderId: 'p-gone',
          activeModel: 'gone-model',
        }),
      }),
    );
    expect(loaded.activeProviderId).toBe('p-one');
    expect(loaded.activeModel).toBe('demo-model');
  });

  it('falls back to OpenAI and the host for an unreadable provider', () => {
    const loaded = loadSettings(
      memoryStorage({
        [SETTINGS_KEY]: JSON.stringify({
          ...DEFAULT_SETTINGS,
          providers: [
            {
              baseUrl: 'https://gw.example.com/v1',
              protocol: 'gemini',
              models: [],
              efforts: ['turbo', 'medium'],
            },
          ],
        }),
      }),
    );
    const first = loaded.providers[0];
    expect(first?.protocol).toBe('openai');
    expect(first?.name).toBe('gw.example.com');
    expect(first?.efforts).toEqual(['medium']);
    expect(first?.direct).toBe(false);
  });

  it('converges the chosen effort to what the provider offers', () => {
    const loaded = loadSettings(
      memoryStorage({
        [SETTINGS_KEY]: JSON.stringify({
          ...DEFAULT_SETTINGS,
          providers: [provider],
          effort: 'medium',
        }),
      }),
    );
    expect(loaded.effort).toBe('off');
  });

  it('reads the reasoning levels one provider offers', () => {
    expect(effortOptions(undefined)).toEqual(['off']);
    expect(effortOptions({ ...provider, efforts: [] })).toEqual(['off']);
    expect(effortOptions({ ...provider, efforts: ['high', 'low'] })).toEqual([
      'off',
      'low',
      'high',
    ]);
    expect(clampEffort('high', { ...provider, efforts: ['low'] })).toBe('off');
    expect(clampEffort('low', { ...provider, efforts: ['low'] })).toBe('low');
  });

  it('resolves an active provider and model', () => {
    const settings = withProvider({ effort: 'low' });
    expect(activeProvider(settings)?.id).toBe('p-one');
    expect(activeTarget(settings)?.model.model).toBe('demo-model');
    expect(modelLabel({ id: 'x', model: 'gpt-4o' })).toBe('gpt-4o');
    expect(modelLabel({ id: 'x', model: 'gpt-4o', label: '快' })).toBe('快');
    expect(activeTarget(DEFAULT_SETTINGS)).toBeNull();
  });

  it('lands on an existing provider and model after an edit', () => {
    const withoutActive = normalizeActive({
      ...withProvider(),
      activeProviderId: '',
      activeModel: '',
    });
    expect(withoutActive.activeProviderId).toBe('p-one');
    expect(withoutActive.activeModel).toBe('demo-model');

    const noModels = normalizeActive({
      ...DEFAULT_SETTINGS,
      providers: [{ ...provider, models: [] }],
    });
    expect(noModels.activeModel).toBe('');
    expect(noModels.effort).toBe('off');

    expect(normalizeActive(DEFAULT_SETTINGS)).toMatchObject({
      activeProviderId: '',
      activeModel: '',
      effort: 'off',
    });
  });

  it('keeps one key per provider and never leaks it sideways', () => {
    const session = memoryStorage();
    saveProviderKey(session, 'p-one', '  sk-one  ');
    saveProviderKey(session, 'p-two', 'sk-two');
    expect(readProviderKey(session, memoryStorage(), 'p-one')).toBe('sk-one');
    expect(readProviderKey(session, memoryStorage(), 'p-two')).toBe('sk-two');
    expect(readProviderKey(session, memoryStorage(), 'p-three')).toBe('');
    expect(readProviderKey(session, memoryStorage(), '')).toBe('');
  });

  it('prefers the session copy over a remembered one', () => {
    const session = memoryStorage({ [SECRETS_KEY]: JSON.stringify({ 'p-one': 'sk-session' }) });
    const local = memoryStorage({ [SECRETS_KEY]: JSON.stringify({ 'p-one': 'sk-local' }) });
    expect(readProviderKey(session, local, 'p-one')).toBe('sk-session');
    expect(readProviderKey(memoryStorage(), local, 'p-one')).toBe('sk-local');
    expect(readProviderKey(memoryStorage(), memoryStorage(), 'p-one')).toBe('');
  });

  it('answers the migrated provider from the single key file', () => {
    const session = memoryStorage({ [LEGACY_SECRET_KEY]: 'sk-legacy' });
    expect(readProviderKey(session, memoryStorage(), LEGACY_PROVIDER_ID)).toBe('sk-legacy');
    expect(readProviderKey(session, memoryStorage(), 'p-other')).toBe('');
  });

  it('replaces the single key file once the migrated provider saves its own', () => {
    const session = memoryStorage({ [LEGACY_SECRET_KEY]: 'sk-legacy' });
    saveProviderKey(session, LEGACY_PROVIDER_ID, 'sk-new');
    expect(readProviderKey(session, memoryStorage(), LEGACY_PROVIDER_ID)).toBe('sk-new');
    expect(session.getItem(LEGACY_SECRET_KEY)).toBeNull();
  });

  it('drops a key when the field is cleared and clears them all on request', () => {
    const session = memoryStorage();
    saveProviderKey(session, 'p-one', 'sk-one');
    saveProviderKey(session, 'p-one', '   ');
    expect(readProviderKey(session, memoryStorage(), 'p-one')).toBe('');

    saveProviderKey(session, 'p-one', 'sk-one');
    saveProviderKey(session, 'p-two', 'sk-two');
    const local = memoryStorage({ [SECRETS_KEY]: JSON.stringify({ 'p-one': 'sk-local' }) });
    clearProviderKey(session, local, 'p-one');
    expect(readProviderKey(session, local, 'p-one')).toBe('');
    expect(readProviderKey(session, local, 'p-two')).toBe('sk-two');

    clearAllProviderKeys(session, local);
    expect(readProviderKey(session, local, 'p-two')).toBe('');
    expect(local.getItem(SECRETS_KEY)).toBeNull();
  });

  it('finds the key of the active provider', () => {
    const session = memoryStorage();
    saveProviderKey(session, 'p-one', 'sk-one');
    saveProviderKey(session, 'p-two', 'sk-two');
    const settings = withProvider();
    expect(currentApiKey(settings, session, memoryStorage())).toBe('sk-one');
    expect(
      currentApiKey({ ...settings, activeProviderId: 'p-two' }, session, memoryStorage()),
    ).toBe('sk-two');
  });

  it('resolves the effective mode', () => {
    const live = withProvider({ mode: 'live' });
    expect(resolveMode(DEFAULT_SETTINGS, 'sk-test')).toBe('demo');
    expect(resolveMode({ ...live, forceDemo: true }, 'sk-test')).toBe('demo');
    expect(resolveMode(live, '')).toBe('demo');
    expect(resolveMode(live, 'sk-test')).toBe('live');
    expect(resolveMode({ ...live, providers: [{ ...provider, direct: true }] }, '')).toBe('live');
  });

  it('explains why the mode is not live', () => {
    const live = withProvider({ mode: 'live' });
    expect(describeMode(live, 'sk-test')).toEqual({
      mode: 'live',
      reason: '供应商、key、模型已就绪',
    });
    expect(describeMode({ ...live, providers: [{ ...provider, direct: true }] }, '')).toEqual({
      mode: 'live',
      reason: '直连端点，不需要 key',
    });
    expect(describeMode({ ...live, forceDemo: true }, 'sk-test').reason).toBe('已强制演示');
    expect(describeMode(DEFAULT_SETTINGS, 'sk-test').reason).toBe('回复来自本地模板');
    expect(describeMode({ ...live, providers: [] }, 'sk-test').reason).toBe('还没有可用的供应商');
    expect(
      describeMode({ ...live, providers: [{ ...provider, baseUrl: '  ' }] }, 'sk-test').reason,
    ).toBe('供应商还没填 base_url');
    expect(
      describeMode({ ...live, providers: [{ ...provider, models: [] }] }, 'sk-test').reason,
    ).toBe('供应商还没加模型');
    expect(describeMode(live, '').reason).toBe('还没填 API key');
  });

  it('hints on an endpoint the proxy would reject', () => {
    expect(endpointHint('', false)).toBeNull();
    expect(endpointHint('https://api.example.com/v1', false)).toBeNull();
    expect(endpointHint('http://127.0.0.1:11434/v1', true)).toBeNull();
    expect(endpointHint('api.example.com/v1', false)).toContain('http(s)://');
    expect(endpointHint('http://127.0.0.1:11434/v1', false)).toContain('直连');
    expect(endpointHint('ftp://api.example.com/v1', false)).toContain('http(s)');
  });

  it('applies appearance to the root element', () => {
    const properties: Record<string, string> = {};
    const root = {
      style: {
        setProperty: (name: string, value: string) => {
          properties[name] = value;
        },
      },
      dataset: {} as Record<string, string>,
    };
    applyAppearance(root as unknown as HTMLElement, { panelAlpha: 0.75, motion: 'reduced' });
    expect(properties['--panel-alpha']).toBe('0.75');
    expect(root.dataset.motion).toBe('reduced');
  });

  it('reads a reasoning effort and ignores an unknown one', () => {
    const read = (effort: unknown) =>
      loadSettings(memoryStorage({ [SETTINGS_KEY]: JSON.stringify({ ...withProvider(), effort }) }))
        .effort;
    expect(read('off')).toBe('off');
    expect(read('low')).toBe('low');
    expect(read('high')).toBe('high');
    expect(read('medium')).toBe('off');
    expect(read('standard')).toBe('off');
    expect(read('turbo')).toBe('off');
    expect(read(42)).toBe('off');
  });

  it('turns an older effort budget into a plain output budget', () => {
    const legacy = (effort: unknown, extra: Record<string, unknown> = {}) =>
      loadSettings(
        memoryStorage({
          [SETTINGS_KEY]: JSON.stringify({
            endpoint: 'https://api.example.com/v1',
            model: 'demo-model',
            effort,
            ...extra,
          }),
        }),
      );
    expect(legacy('light')).toMatchObject({ effort: 'off', maxOutputTokens: 512 });
    expect(legacy('standard')).toMatchObject({ effort: 'off', maxOutputTokens: OUTPUT_DEFAULT });
    expect(
      legacy('deep', { effortPresets: { light: 128, standard: 256, deep: 3000 } }),
    ).toMatchObject({ effort: 'off', maxOutputTokens: 3000 });
    expect(legacy('custom', { maxOutputTokens: 777 })).toMatchObject({
      effort: 'off',
      maxOutputTokens: 777,
    });
    expect(legacy('off', { maxOutputTokens: 1500 })).toMatchObject({
      effort: 'off',
      maxOutputTokens: 1500,
    });
  });
});
