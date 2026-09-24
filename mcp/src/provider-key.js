// Provider signing key for live submit. Loaded from /tmp/ppk.txt (dev) or
// PROVIDER_KEY env. Dev convenience: the provider wallet is a local test key.
import { readFileSync, existsSync } from 'node:fs';
export function providerKey() {
  if (process.env.PROVIDER_KEY) return process.env.PROVIDER_KEY;
  if (existsSync('/tmp/ppk.txt')) return readFileSync('/tmp/ppk.txt', 'utf8').trim();
  return null;
}
