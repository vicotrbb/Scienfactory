/** Canonical preview MIME for recognizable magic, with conservative extension fallback. */
export function artifactMime(name: string, supplied: string, bytes: Uint8Array): string {
  const header = Buffer.from(bytes.subarray(0, 16));
  if (header.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (header[0] === 255 && header[1] === 216 && header[2] === 255) return 'image/jpeg';
  if (header.subarray(0, 4).toString() === 'glTF') return 'model/gltf-binary';
  if (supplied && supplied !== 'application/octet-stream') return supplied;
  const extension = name.toLowerCase().split('.').at(-1)!;
  return (
    (
      {
        tex: 'text/x-tex',
        bib: 'text/plain',
        md: 'text/markdown',
        txt: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
        ipynb: 'application/json',
        py: 'text/x-python',
        lean: 'text/x-lean',
        html: 'text/html',
        svg: 'image/svg+xml',
        mp4: 'video/mp4',
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        glb: 'model/gltf-binary',
      } as Record<string, string>
    )[extension] ?? 'application/octet-stream'
  );
}
