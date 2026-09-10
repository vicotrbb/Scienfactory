import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

/** Resolve once and pin the connection to that public address, including redirects. */
export async function publicFetch(
  raw: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<{ url: string; mime: string; text: string }> {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error('Only public HTTPS URLs on port 443 are allowed.');
  if (redirects > 3) throw new Error('Too many redirects.');
  signal.throwIfAborted();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error('Private or reserved network addresses are not allowed.');
  const address = addresses[0]!;
  const response = await new Promise<{
    status: number;
    location?: string;
    mime: string;
    text: string;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        // Every retrieval must use the address validated for this request.
        // Avoid reusing an HTTPS agent socket across independent DNS checks.
        agent: false,
        headers: {
          'User-Agent': 'Scienfactory/0.1 (research workspace)',
          Accept: 'text/html, application/json, text/plain',
        },
        lookup: (_host, _options, cb) =>
          cb(null, [{ address: address.address, family: address.family }]),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024)
            req.destroy(new Error('Source exceeds the 2 MB retrieval limit.'));
          else chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            mime: res.headers['content-type'] ?? 'text/plain',
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );
    req.setTimeout(20000, () => req.destroy(new Error('Source retrieval timed out.')));
    req.on('error', reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && response.location)
    return publicFetch(new URL(response.location, url).href, signal, redirects + 1);
  if (response.status < 200 || response.status >= 300)
    throw new Error(`Source returned HTTP ${response.status}.`);
  if (!/text|json|xml/.test(response.mime))
    throw new Error(
      'This source is not text. Upload binary documents to the workbench for container analysis.',
    );
  return { url: url.href, mime: response.mime, text: response.text };
}

export function readableText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchLiterature(query: string, signal: AbortSignal) {
  const response = await publicFetch(
    `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=8&select=DOI,title,author,published,URL,abstract`,
    signal,
  );
  const data = JSON.parse(response.text) as {
    message: {
      items: {
        DOI: string;
        title?: string[];
        URL: string;
        abstract?: string;
        author?: { given?: string; family?: string }[];
        published?: { 'date-parts': number[][] };
      }[];
    };
  };
  return data.message.items.map((item) => ({
    title: item.title?.[0] ?? item.DOI,
    url: item.URL,
    excerpt: readableText(
      item.abstract ??
        `DOI: ${item.DOI}. ${
          item.author
            ?.slice(0, 3)
            .map((a) => `${a.given ?? ''} ${a.family ?? ''}`)
            .join(', ') ?? ''
        }. Publication year: ${item.published?.['date-parts'][0]?.[0] ?? 'unknown'}. Metadata only; full text has not been retrieved.`,
    ).slice(0, 3000),
  }));
}
