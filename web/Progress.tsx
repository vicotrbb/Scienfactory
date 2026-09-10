import { useEffect, useState } from 'react';
import { Check, Circle, LoaderCircle, Pause, ChevronDown } from 'lucide-react';
import type { Snapshot, Agent } from '../shared/protocol';

export const toolLabels: Record<string, string> = {
  inspect_file: 'Reading file contents',
  article_guide: 'Preparing the manuscript',
  compile_latex: 'Typesetting the article',
  review_article: 'Checking the manuscript',
  execute: 'Running an experiment',
  execute_batch: 'Comparing experiments',
  research_search: 'Searching literature',
  read_source: 'Reading a source',
  import_data: 'Importing a dataset',
  delegate: 'Coordinating researchers',
  present: 'Updating the canvas',
  update_plan: 'Updating the research plan',
  write_artifact: 'Writing a file',
  read_artifact: 'Inspecting a file',
  list_artifacts: 'Inspecting research files',
  record_finding: 'Recording a finding',
  instruments: 'Selecting scientific instruments',
};
export function phaseLabel(agent: Agent) {
  if (agent.status !== 'running') return agent.status;
  if (agent.phase === 'tool') return toolLabels[agent.currentTool ?? ''] ?? 'Using a tool';
  return (
    {
      queued: 'Waiting for a model slot',
      thinking: 'Working on the next step',
      writing: 'Writing',
      delegating: 'Waiting for specialists',
      finished: 'Finished',
    }[agent.phase ?? 'thinking'] ?? 'Working'
  );
}
export function Elapsed({ since, until }: { since: number; until?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  const seconds = Math.max(0, Math.floor(((until ?? now) - since) / 1000));
  return (
    <span>{seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`}</span>
  );
}
export function ResearchProgress({ snapshot }: { snapshot: Snapshot }) {
  const run = snapshot.runs.at(-1);
  const agents = snapshot.agents.filter((a) => a.runId === run?.id);
  const lead = agents.find((a) => !a.parentId);
  const plan = snapshot.plans?.find((p) => p.agentId === lead?.id);
  const running = snapshot.research.status === 'running';
  if (!run && !running) return null;
  const active = agents.filter((a) => a.status === 'running');
  const complete = plan?.steps.filter((s) => s.status === 'complete').length ?? 0;
  const activeSteps = plan?.steps.filter((s) => s.status === 'active') ?? [];
  return (
    <div className={`research-progress ${running ? 'running' : ''}`}>
      <details>
        <summary>
          <span className="progress-symbol">
            {running ? (
              <LoaderCircle className="spin" size={16} />
            ) : snapshot.research.status === 'completed' ? (
              <Check size={16} />
            ) : (
              <Pause size={16} />
            )}
          </span>
          <span className="progress-heading">
            <strong>
              {running
                ? (activeSteps[0]?.title ?? (lead ? phaseLabel(lead) : 'Starting experiment'))
                : `Research ${snapshot.research.status}`}
            </strong>
            <small>
              {plan
                ? `${complete} of ${plan.steps.length} steps complete`
                : `${agents.filter((a) => a.status === 'completed').length} researchers finished`}
              {running ? ` · ${active.length} active` : ''}
            </small>
          </span>
          {run && (
            <Elapsed
              since={run.createdAt}
              until={!running ? snapshot.research.updatedAt : undefined}
            />
          )}
          <ChevronDown size={14} />
        </summary>
        {plan && (
          <ol className="plan-steps" aria-label="Research plan">
            {plan.steps.map((step) => (
              <li key={step.id} className={step.status}>
                {step.status === 'complete' ? (
                  <Check size={14} />
                ) : step.status === 'active' ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Circle size={13} />
                )}
                <span>
                  <strong>{step.title}</strong>
                  {step.detail && <small>{step.detail}</small>}
                </span>
                <small>{step.status}</small>
              </li>
            ))}
          </ol>
        )}
        {agents.length > 0 && (
          <div className="progress-team">
            {agents.map((a) => (
              <div key={a.id}>
                <span className={`status-dot ${a.status === 'running' ? 'ready pulse' : ''}`} />
                <strong>{a.name}</strong>
                <span>{phaseLabel(a)}</span>
              </div>
            ))}
          </div>
        )}
      </details>
      {plan && (
        <div
          className="step-track"
          role="progressbar"
          aria-valuenow={complete}
          aria-valuemin={0}
          aria-valuemax={plan.steps.length}
          aria-label={`${complete} of ${plan.steps.length} plan steps completed`}
        >
          {plan.steps.map((s) => (
            <i key={s.id} className={s.status} />
          ))}
        </div>
      )}
    </div>
  );
}
