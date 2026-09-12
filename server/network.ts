import ipaddr from 'ipaddr.js';

export function isLanAddress(address: string) {
  try {
    return ['private', 'uniqueLocal'].includes(
      ipaddr.process(address.replace(/^\[|\]$/g, '')).range(),
    );
  } catch {
    return false;
  }
}
export function accessPolicy(port: number, production: boolean, publicOrigin?: string) {
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    ...(production ? [] : ['http://127.0.0.1:5173', 'http://localhost:5173']),
  ]);
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (!['localhost', '127.0.0.1'].includes(url.hostname) && !isLanAddress(url.hostname))
    )
      throw new Error(
        'PUBLIC_ORIGIN must be a loopback or private LAN IP origin, without credentials or a path.',
      );
    origins.add(url.origin);
  }
  const hosts = new Set([...origins].map((o) => new URL(o).host));
  return { origins, validHost: (request: Request) => hosts.has(request.headers.get('host') ?? '') };
}
