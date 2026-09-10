import { z } from 'zod';

export const ProviderName = z.enum(['openai', 'anthropic']);
export type ProviderName = z.infer<typeof ProviderName>;
export const Language = z.enum([
  'python',
  'javascript',
  'lean',
  'latex',
  'r',
  'blender',
  'graphviz',
]);
export type Language = z.infer<typeof Language>;
export const Limits = z.object({
  maxAgents: z.number().int().min(1).max(256),
  concurrency: z.number().int().min(1).max(32),
  maxSteps: z.number().int().min(1).max(80),
  maxOutputTokens: z.number().int().min(256).max(16384),
  tokenBudget: z.number().int().min(2000).max(2000000),
});
export type Limits = z.infer<typeof Limits>;
export const defaultLimits: Limits = {
  maxAgents: 16,
  concurrency: 4,
  maxSteps: 24,
  maxOutputTokens: 4096,
  tokenBudget: 200000,
};
export const Settings = z.object({
  provider: ProviderName,
  model: z.string().trim().min(1).max(100),
  limits: Limits,
});
export type Settings = z.infer<typeof Settings>;
const id = z.string().min(1).max(100);
export const Command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sync'), requestId: id }),
  z.object({
    type: z.literal('models.list'),
    requestId: id,
    provider: ProviderName,
    refresh: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('research.create'),
    requestId: id,
    title: z.string().trim().min(1).max(160),
  }),
  z.object({
    type: z.literal('research.rename'),
    requestId: id,
    researchId: id,
    title: z.string().trim().min(1).max(160),
  }),
  z.object({ type: z.literal('research.delete'), requestId: id, researchId: id }),
  z.object({ type: z.literal('research.open'), requestId: id, researchId: id }),
  z.object({
    type: z.literal('chat.send'),
    requestId: id,
    researchId: id,
    text: z.string().trim().min(1).max(32000),
    artifactIds: z.array(id).max(20).optional(),
  }),
  z.object({ type: z.literal('run.cancel'), requestId: id, researchId: id }),
  z.object({
    type: z.literal('settings.update'),
    requestId: id,
    settings: Settings,
    apiKey: z.string().min(10).max(512).optional(),
  }),
  z.object({ type: z.literal('key.clear'), requestId: id, provider: ProviderName }),
  z.object({
    type: z.literal('lab.run'),
    requestId: id,
    researchId: id,
    language: Language,
    code: z.string().min(1).max(100000),
  }),
  z.object({ type: z.literal('artifact.read'), requestId: id, researchId: id, artifactId: id }),
  z.object({ type: z.literal('artifact.inspect'), requestId: id, researchId: id, artifactId: id }),
  z.object({
    type: z.literal('artifact.compile'),
    requestId: id,
    researchId: id,
    sourceArtifactId: id,
    inputArtifactIds: z.array(id).max(9).default([]),
  }),
  z.object({
    type: z.literal('artifact.write'),
    requestId: id,
    researchId: id,
    name: z.string().min(1).max(160),
    content: z.string().max(200000),
    mime: z.enum([
      'text/markdown',
      'text/plain',
      'text/x-tex',
      'text/x-python',
      'text/x-lean',
      'application/json',
      'text/csv',
    ]),
  }),
  z.object({
    type: z.literal('artifact.upload'),
    requestId: id,
    researchId: id,
    name: z.string().min(1).max(160),
    mime: z.string().max(100),
    data: z.string().max(12000000),
  }),
  z.object({ type: z.literal('research.export'), requestId: id, researchId: id }),
  z.object({ type: z.literal('ping'), requestId: id }),
]);
export type Command = z.infer<typeof Command>;
export type CommandInput = Command extends infer C
  ? C extends Command
    ? Omit<C, 'requestId'>
    : never
  : never;
export type Status = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
export interface Research {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: Status;
}
export interface Message {
  artifactIds?: string[];
  id: string;
  researchId: string;
  agentId: string | null;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  createdAt: number;
}
export interface Agent {
  id: string;
  researchId: string;
  runId: string;
  parentId: string | null;
  name: string;
  task: string;
  status: Status;
  createdAt: number;
  phase?: 'queued' | 'thinking' | 'writing' | 'tool' | 'delegating' | 'finished';
  currentTool?: string;
  step?: number;
}
export interface ModelOption {
  id: string;
  name: string;
}
export interface ModelCatalog {
  provider: ProviderName;
  models: ModelOption[];
  fetchedAt: number;
}
export interface CanvasItem {
  id: string;
  researchId: string;
  agentId: string;
  kind: 'artifact' | 'experiment';
  title: string;
  caption: string;
  status: Status;
  artifactIds: string[];
  sourceId?: string;
  language?: Language;
  code?: string;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  createdAt: number;
  updatedAt: number;
}
export interface ResearchPlan {
  id: string;
  researchId: string;
  agentId: string;
  goal: string;
  steps: {
    id: string;
    title: string;
    status: 'pending' | 'active' | 'complete' | 'blocked';
    detail: string;
  }[];
  updatedAt: number;
}
export interface ToolInvocation {
  id: string;
  researchId: string;
  agentId: string;
  name: string;
  arguments: string;
  status: Status;
  result?: string;
  createdAt: number;
  completedAt?: number;
  preparing?: boolean;
}
export interface Artifact {
  id: string;
  researchId: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  createdAt: number;
  provenance: string;
}
export interface Source {
  kind?: 'metadata' | 'read';
  id: string;
  researchId: string;
  title: string;
  url: string;
  excerpt: string;
  retrievedAt: number;
}
export interface Activity {
  id: number;
  researchId: string;
  agentId: string | null;
  type: string;
  text: string;
  createdAt: number;
}
export interface Run {
  id: string;
  researchId: string;
  status: Status;
  inputTokens: number;
  outputTokens: number;
  settings: Settings;
  createdAt: number;
  error: string | null;
}
export interface Snapshot {
  research: Research;
  messages: Message[];
  agents: Agent[];
  artifacts: Artifact[];
  sources: Source[];
  activity: Activity[];
  runs: Run[];
  canvas: CanvasItem[];
  plans: ResearchPlan[];
  tools: ToolInvocation[];
}
export interface SnapshotPatch {
  researchId: string;
  changes: Partial<Snapshot>;
}
export interface Capabilities {
  documents?: boolean;
  speech?: string;
  mathlib?: string;
  docker: boolean;
  image: boolean;
  detail: string;
}
export interface Bootstrap {
  researches: Research[];
  settings: Settings;
  credentials: Record<ProviderName, boolean>;
  capabilities: Capabilities;
}
export type ServerEvent =
  | { type: 'reply'; requestId: string; ok: boolean; data?: unknown; error?: string }
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'patch'; data: SnapshotPatch }
  | { type: 'bootstrap'; data: Bootstrap }
  | { type: 'delta'; researchId: string; agentId: string; messageId: string; text: string }
  | { type: 'activity'; data: Activity };
