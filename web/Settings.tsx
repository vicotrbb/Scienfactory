import { useEffect, useState } from 'react';
import { Check, KeyRound, ShieldCheck, ArrowUpRight } from 'lucide-react';
import type { Bootstrap, Settings as SettingsType } from '../shared/protocol';
import type { Send } from './connection';
import { Modal } from './ui';
import { ModelSelect } from './ModelSelect';

export function Settings({
  open,
  onOpenChange,
  bootstrap,
  send,
  notify,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bootstrap: Bootstrap;
  send: Send;
  notify: (text: string) => void;
}) {
  const [draft, setDraft] = useState<SettingsType>(bootstrap.settings);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setDraft(structuredClone(bootstrap.settings));
      setKey('');
      setError('');
    }
  }, [open]);
  const updateLimit = (name: keyof SettingsType['limits'], value: number) =>
    setDraft((s) => ({ ...s, limits: { ...s.limits, [name]: value } }));
  async function save() {
    setSaving(true);
    setError('');
    try {
      await send({ type: 'settings.update', settings: draft, ...(key ? { apiKey: key } : {}) });
      setKey('');
      notify('Research settings saved');
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Make the lab yours"
      description="Choose your model and the resources for your research."
    >
      <div className="settings-body">
        <div className="provider-choice" role="group" aria-label="AI provider">
          {(['openai', 'anthropic'] as const).map((provider) => (
            <button
              key={provider}
              className={draft.provider === provider ? 'selected' : ''}
              onClick={() => {
                setDraft((s) => ({
                  ...s,
                  provider,
                  model: provider === 'openai' ? 'gpt-5-mini' : 'claude-sonnet-4-5',
                }));
                setKey('');
              }}
            >
              <span className="provider-symbol">{provider === 'openai' ? '◉' : '✳'}</span>
              {provider === 'openai' ? 'OpenAI' : 'Anthropic'}
              {draft.provider === provider && <Check size={16} />}
            </button>
          ))}
        </div>
        <label className="field">
          Model
          <ModelSelect
            provider={draft.provider}
            value={draft.model}
            connected={bootstrap.credentials[draft.provider]}
            send={send}
            onChange={(model) => setDraft((s) => ({ ...s, model }))}
          />
        </label>
        <label className="field">
          <span className="field-label">
            API key{' '}
            {bootstrap.credentials[draft.provider] && (
              <span className="key-ready">
                <Check size={12} /> Available
              </span>
            )}
          </span>
          <div className="key-input">
            <KeyRound size={16} />
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                bootstrap.credentials[draft.provider]
                  ? 'Enter a key to replace the current one'
                  : 'Paste your API key'
              }
            />
          </div>
        </label>
        <p className="security-note">
          <ShieldCheck size={16} />
          Keys stay on your local server and never enter execution containers. Keys entered here are
          held in memory for this server session.
        </p>
        <div className="section-heading">
          <h3>Research budget</h3>
          <span>Applies to new runs</span>
        </div>
        <div className="limits-grid">
          <label className="field">
            Total agents
            <input
              type="number"
              min="1"
              max="256"
              aria-label="Total agents"
              value={draft.limits.maxAgents}
              onChange={(e) => updateLimit('maxAgents', Number(e.target.value))}
            />
            <span className="field-help">1–256 per research run</span>
          </label>
          <label className="field">
            Parallel model calls
            <input
              type="number"
              min="1"
              max="32"
              aria-label="Parallel model calls"
              value={draft.limits.concurrency}
              onChange={(e) => updateLimit('concurrency', Number(e.target.value))}
            />
            <span className="field-help">Queued beyond this limit</span>
          </label>
          <label className="field">
            Steps per agent
            <input
              type="number"
              min="1"
              max="80"
              value={draft.limits.maxSteps}
              onChange={(e) => updateLimit('maxSteps', Number(e.target.value))}
            />
          </label>
          <label className="field">
            Output tokens per step
            <input
              type="number"
              min="256"
              max="16384"
              step="256"
              value={draft.limits.maxOutputTokens}
              onChange={(e) => updateLimit('maxOutputTokens', Number(e.target.value))}
            />
          </label>
        </div>
        <label className="field">
          Total token budget
          <input
            type="number"
            min="2000"
            max="2000000"
            step="1000"
            value={draft.limits.tokenBudget}
            onChange={(e) => updateLimit('tokenBudget', Number(e.target.value))}
          />
          <span className="field-help">
            Input + output tokens. Conservative admission checks can stop a run early.
          </span>
        </label>
        <div className="lab-health">
          <span className={`status-dot ${bootstrap.capabilities.image ? 'ready' : ''}`} />
          <div>
            <strong>
              {bootstrap.capabilities.image ? 'Scientific lab ready' : 'Scientific lab offline'}
            </strong>
            <p>{bootstrap.capabilities.detail}</p>
          </div>
        </div>
        <p className="field-help">
          API usage is billed by your provider, separately from a ChatGPT or Claude subscription.{' '}
          <a
            href={
              draft.provider === 'openai'
                ? 'https://platform.openai.com/usage'
                : 'https://console.anthropic.com/settings/usage'
            }
            target="_blank"
            rel="noreferrer"
          >
            View usage <ArrowUpRight size={12} />
          </a>
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <button
          className="button subtle"
          onClick={async () => {
            try {
              await send({ type: 'key.clear', provider: draft.provider });
              notify('Key removed from server memory');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
          disabled={!bootstrap.credentials[draft.provider]}
        >
          Disconnect key
        </button>
        <button className="button primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </Modal>
  );
}
