import type { Artifact } from './protocol';

/** Resolve literal file references, including nested TeX inputs, without mounting unrelated files. */
export async function latexDependencies(
  source: string,
  main: Artifact,
  files: Artifact[],
  read: (file: Artifact) => Promise<string>,
): Promise<Artifact[]> {
  const versions = new Map<string, Artifact>();
  for (const file of files.filter(
    (f) => f.researchId === main.researchId && f.name !== main.name,
  )) {
    if (!versions.has(file.name) || versions.get(file.name)!.createdAt <= file.createdAt)
      versions.set(file.name, file);
  }
  const selected = new Map<string, Artifact>();
  const visit = async (text: string) => {
    const body = text.replace(/(?<!\\)%.*$/gm, '');
    for (const match of body.matchAll(
      /\\(includegraphics\*?|bibliography|addbibresource|input|include)(?:\[[^\]]*\])?\{([^}]+)\}/g,
    )) {
      const command = match[1]!,
        names = command === 'bibliography' ? match[2]!.split(',') : [match[2]!];
      const extensions = command.startsWith('includegraphics')
        ? ['', '.pdf', '.png', '.jpg', '.jpeg']
        : /bib/.test(command)
          ? ['', '.bib']
          : ['', '.tex'];
      for (const reference of names) {
        const name = reference.trim().replace(/^inputs\//, '');
        const file = extensions.map((ext) => versions.get(name + ext)).find(Boolean);
        if (!file)
          throw new Error(
            `Missing literal LaTeX input: ${reference}. Add this file or ask the agent to select the compilation inputs.`,
          );
        if (selected.has(file.id)) continue;
        selected.set(file.id, file);
        if (selected.size > 9)
          throw new Error(
            'This manuscript exceeds the nine-file compilation input limit. Consolidate source sections or figures.',
          );
        if (file.name.endsWith('.tex')) await visit(await read(file));
      }
    }
  };
  await visit(source);
  return [...selected.values()];
}
