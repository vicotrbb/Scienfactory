import { networkInterfaces } from 'node:os';
import { isLanAddress } from '../server/network';
const address =
  process.env.LAN_ADDRESS ??
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal && isLanAddress(i.address))?.address;
if (!address || !isLanAddress(address))
  throw new Error('No private LAN address found. Set LAN_ADDRESS to this machine’s private IP.');
const port = process.env.PORT ?? '4310';
const host = address.includes(':') ? `[${address}]` : address;
const child = Bun.spawn(['bun', 'server/index.ts'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    BIND_ADDRESS: address,
    PUBLIC_ORIGIN: `http://${host}:${port}`,
  },
  stdout: 'inherit',
  stderr: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
process.exitCode = await child.exited;
