import { createApp } from './app';
import { resolve } from 'node:path';

const port = Number(process.env.PORT ?? 4310);
const runtime = createApp({
  root: resolve(process.env.DATA_DIR ?? '.data'),
  port,
  production: process.env.NODE_ENV === 'production',
});
runtime.app.listen({ port, hostname: process.env.BIND_ADDRESS ?? '127.0.0.1' });
console.log(`Scienfactory is listening at http://127.0.0.1:${port}`);
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await runtime.shutdown();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
