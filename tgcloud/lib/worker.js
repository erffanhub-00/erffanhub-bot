import { fetch } from 'sdk';
import { WORKER_URL, SHARED_SECRET } from './config.js';

// Shared client for the Cloudflare Worker (erffanhub-ai), the only
// publishing path. Network access goes through the documented SDK fetch.

// POST (or GET) JSON to the Worker with the shared-secret headers.
// Returns the parsed JSON as-is, or { ok: false, error } on any failure.
export async function callWorker(path, body, method = 'POST') {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Erffan-Secret': SHARED_SECRET,
      'X-Timestamp': String(Math.floor(Date.now() / 1000)),
    };
    const options = { method, headers };
    if (method !== 'GET') options.body = JSON.stringify(body ?? {});
    const res = await fetch(WORKER_URL + path, options);
    return await res.json();
  } catch {
    return { ok: false, error: 'worker_unreachable' };
  }
}

