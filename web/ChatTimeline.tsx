import { copyText } from './browser';
import { Copy, Check, LoaderCircle, Wrench, AlertCircle, Users, Paperclip } from 'lucide-react';
import type { Message, Snapshot, ToolInvocation } from '../shared/protocol';
import { Brand, IconButton } from './ui';
import { Markdown } from './Markdown';
import { Elapsed, phaseLabel, toolLabels } from './Progress';

function ToolEntry({ tool, name }: { tool: ToolInvocation; name: string }) {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(tool.arguments);
  } catch {
    /* Partial input may still be streaming. */
  }
  const detail = String(
    args.title ??
      args.query ??
      args.url ??
      args.name ??
      (args.language ? `${args.language} · isolated container` : ''),
  );
  return (
    <details className={`chat-tool ${tool.status}`}>
      <summary>
        {tool.status === 'running' ? (
          <LoaderCircle size={14} className="spin" />
        ) : tool.status === 'completed' ? (
          <Check size={14} />
        ) : (
          <AlertCircle size={14} />
        )}
        <span>
          <strong>
            {tool.preparing
              ? `Preparing ${tool.name === 'execute' ? 'an experiment' : tool.name === 'present' ? 'a canvas presentation' : tool.name.replaceAll('_', ' ')}`
              : (toolLabels[tool.name] ?? tool.name)}
          </strong>
          {detail && <small>{detail}</small>}
        </span>
        <Elapsed since={tool.createdAt} until={tool.completedAt} />
      </summary>
      <div className="tool-inspector">
        <small>
          {name} · {tool.name} · {tool.status}
        </small>
        <pre>
          {args.code
            ? String(args.code)
            : Object.keys(args).length
              ? JSON.stringify(args, null, 2)
              : tool.arguments}
        </pre>
        {tool.result && (
          <>
            <strong>Result</strong>
            <pre>{tool.result}</pre>
          </>
        )}
      </div>
    </details>
  );
}
export function ChatTimeline({
  messages,
  snapshot,
  notify,
}: {
  messages: Message[];
  snapshot: Snapshot;
  notify: (text: string) => void;
}) {
  const rows = [
    ...messages.map((message) => ({
      id: message.id,
      at: message.createdAt,
      message,
      tool: undefined as ToolInvocation | undefined,
    })),
    ...(snapshot.tools ?? []).map((tool) => ({
      id: tool.id,
      at: tool.createdAt,
      tool,
      message: undefined as Message | undefined,
    })),
  ].sort((a, b) => a.at - b.at);
  const active = snapshot.agents.filter((a) => a.status === 'running');
  return (
    <div className="messages chat-timeline">
      {rows.map((row) => {
        const m = row.message;
        if (!m)
          return (
            <ToolEntry
              key={row.id}
              tool={row.tool!}
              name={snapshot.agents.find((a) => a.id === row.tool!.agentId)?.name ?? 'Scienfactory'}
            />
          );
        const agent = snapshot.agents.find((a) => a.id === m.agentId);
        return (
          <article
            className={`message ${m.role} ${agent?.parentId ? 'specialist-message' : ''}`}
            key={m.id}
          >
            <div className="message-heading">
              {m.role === 'assistant' ? (
                <>
                  {agent?.parentId ? <Users size={16} /> : <Brand small />}
                  <strong>{agent?.parentId ? agent.name : 'Scienfactory'}</strong>
                  {agent?.parentId && <span>Specialist</span>}
                </>
              ) : m.role === 'user' ? (
                <span className="user-avatar">You</span>
              ) : (
                <>
                  <AlertCircle size={14} />
                  <strong>Research update</strong>
                </>
              )}
            </div>
            <div className="message-content">
              {!!m.artifactIds?.length && (
                <div className="message-attachments">
                  {m.artifactIds.map((id) => (
                    <span key={id}>
                      <Paperclip size={12} />
                      {snapshot.artifacts.find((a) => a.id === id)?.name ?? 'Attached file'}
                    </span>
                  ))}
                </div>
              )}
              {m.role === 'system' ? <p>{m.text}</p> : <Markdown text={m.text} />}
            </div>
            {m.role === 'assistant' && (
              <div className="message-tools">
                <IconButton
                  label="Copy response"
                  onClick={() =>
                    void copyText(m.text)
                      .then(() => notify('Response copied'))
                      .catch(() => notify('Clipboard is unavailable.'))
                  }
                >
                  <Copy size={13} />
                </IconButton>
              </div>
            )}
          </article>
        );
      })}
      {snapshot.research.status === 'running' && (
        <div className="live-researchers" role="group" aria-label="Researchers at work">
          {active.length ? (
            active.map((a) => (
              <div className="live-researcher" key={a.id}>
                <span className="status-dot ready pulse" />
                <span>
                  <strong>{a.name}</strong>
                  <small>
                    {phaseLabel(a)}
                    {a.step ? ` · step ${a.step}` : ''}
                  </small>
                </span>
                <span className="working-wave" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            ))
          ) : (
            <div className="live-researcher">
              <Wrench size={15} />
              <span>Preparing the experiment…</span>
              <LoaderCircle size={14} className="spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
