import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ModelCatalog, ProviderName } from '../shared/protocol';
import type { Send } from './connection';

export function ModelSelect({
  provider,
  value,
  connected,
  send,
  onChange,
  compact = false,
  disabled = false,
}: {
  provider: ProviderName;
  value: string;
  connected: boolean;
  send: Send;
  onChange: (model: string) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [catalog, setCatalog] = useState<ModelCatalog>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setCatalog(undefined);
    setError('');
    if (!connected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void send<ModelCatalog>({ type: 'models.list', provider, refresh: revision > 0 })
      .then((result) => {
        if (active) setCatalog(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider, connected, revision]);
  const models = catalog?.models ?? [];
  return (
    <div className={`model-field ${compact ? 'compact' : ''}`}>
      <div className="model-control">
        <select
          aria-label={compact ? 'Research model' : 'Model'}
          value={value}
          disabled={disabled || loading || !connected}
          onChange={(e) => onChange(e.target.value)}
          title={error || undefined}
        >
          {!models.some((m) => m.id === value) && (
            <option value={value}>
              {value || 'Choose a model'}
              {loading ? ' · loading…' : catalog ? ' · saved selection' : ''}
            </option>
          )}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
        {connected && (
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh available models"
            title="Refresh available models"
            disabled={loading}
            onClick={() => setRevision((n) => n + 1)}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        )}
      </div>
      {!compact && (
        <span className="field-help">
          {loading
            ? 'Loading models from your provider…'
            : error ||
              (!connected
                ? 'Save a provider key to load its models.'
                : `${models.length} text models returned by your provider. Availability can vary by endpoint.`)}
        </span>
      )}
      {compact && error && (
        <span className="model-error" role="status">
          Models unavailable · retry refresh
        </span>
      )}
    </div>
  );
}
