import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ModelCatalog, ProviderName } from '../shared/protocol';

// The models endpoint lists many modalities. This adapter supports text agents with tools.
export function supportsResearch(id: string): boolean {
  return (
    /^(gpt-(?:[5-9]|4\.1|4o)|o[3-9](?:-|$)|claude-)/.test(id) &&
    !/(audio|realtime|transcri|tts|image|search|deep-research|chat-latest|computer-use)/.test(id)
  );
}

export class ModelDirectory {
  private cache = new Map<ProviderName, { fingerprint: string; value: ModelCatalog }>();
  constructor(private transport?: typeof fetch) {}
  clear(provider: ProviderName) {
    this.cache.delete(provider);
  }
  async list(provider: ProviderName, key: string, refresh = false): Promise<ModelCatalog> {
    if (!key) throw new Error('Connect this provider in Settings to load available models.');
    const fingerprint = new Bun.CryptoHasher('sha256').update(key).digest('hex');
    const cached = this.cache.get(provider);
    if (
      !refresh &&
      cached?.fingerprint === fingerprint &&
      Date.now() - cached.value.fetchedAt < 300000
    )
      return cached.value;
    const models: ModelCatalog['models'] = [];
    if (provider === 'openai') {
      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://api.openai.com/v1',
        fetch: this.transport,
        timeout: 15000,
        maxRetries: 0,
      });
      for await (const model of client.models.list()) {
        if (supportsResearch(model.id)) models.push({ id: model.id, name: model.id });
      }
    } else {
      const client = new Anthropic({
        apiKey: key,
        baseURL: 'https://api.anthropic.com',
        fetch: this.transport,
        timeout: 15000,
        maxRetries: 0,
      });
      for await (const model of client.models.list({ limit: 100 })) {
        if (supportsResearch(model.id)) models.push({ id: model.id, name: model.display_name });
      }
    }
    models.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    const value = { provider, models, fetchedAt: Date.now() };
    this.cache.set(provider, { fingerprint, value });
    return value;
  }
}
