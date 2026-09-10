import { z } from 'zod';
import type { Artifact, CanvasItem, ResearchPlan } from '../shared/protocol';
import type { ToolContext } from './toolkit';

export const presentationSchema = z.object({
  title: z.string().min(1).max(160),
  caption: z.string().max(2000).default(''),
  artifactIds: z.array(z.string()).max(12).default([]),
  content: z.string().max(200000).optional(),
  format: z.enum(['markdown', 'html', 'svg']).default('markdown'),
  itemId: z.string().optional(),
});
export const planSchema = z.object({
  goal: z.string().min(1).max(1000),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: z.string().min(1).max(200),
        status: z.enum(['pending', 'active', 'complete', 'blocked']),
        detail: z.string().max(1000).default(''),
      }),
    )
    .min(1)
    .max(16),
});

export async function present(args: unknown, ctx: ToolContext) {
  const request = presentationSchema.parse(args);
  const previous = request.itemId ? ctx.store.get<CanvasItem>('canvas', request.itemId) : undefined;
  if (
    request.itemId &&
    (!previous || previous.researchId !== ctx.researchId || previous.kind !== 'artifact')
  )
    throw new Error('Presentation not found in this research.');
  for (const id of request.artifactIds) {
    const artifact = ctx.store.get<Artifact>('artifact', id);
    if (!artifact || artifact.researchId !== ctx.researchId)
      throw new Error('Canvas files must belong to this research.');
  }
  if (!request.content?.trim() && !request.artifactIds.length)
    throw new Error('Present content or at least one artifact.');
  const artifactIds = [...request.artifactIds];
  if (request.content) {
    const mime = { markdown: 'text/markdown', html: 'text/html', svg: 'image/svg+xml' }[
      request.format
    ];
    const ext = { markdown: 'md', html: 'html', svg: 'svg' }[request.format];
    const artifact = await ctx.store.artifact(
      ctx.researchId,
      `${request.title}.${ext}`,
      mime,
      Buffer.from(request.content),
      `Canvas presentation by ${ctx.agentId}`,
    );
    artifactIds.unshift(artifact.id);
  }
  const now = Date.now();
  const item = ctx.store.put<CanvasItem>('canvas', {
    id: previous?.id ?? crypto.randomUUID(),
    researchId: ctx.researchId,
    agentId: ctx.agentId,
    kind: 'artifact',
    title: request.title,
    caption: request.caption,
    artifactIds,
    status: 'completed',
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  });
  ctx.changed();
  return { itemId: item.id, artifactIds: item.artifactIds, displayed: true };
}

export function updatePlan(args: unknown, ctx: ToolContext) {
  const request = planSchema.parse(args);
  if (new Set(request.steps.map((s) => s.id)).size !== request.steps.length)
    throw new Error('Plan step IDs must be unique.');
  const plan = ctx.store.put<ResearchPlan>('plan', {
    ...request,
    id: ctx.agentId,
    researchId: ctx.researchId,
    agentId: ctx.agentId,
    updatedAt: Date.now(),
  });
  ctx.changed();
  return plan;
}
