import { fetch } from 'sdk';
import { WORKER_URL, SHARED_SECRET } from './config.js';

// Shared client for the Cloudflare Worker (erffanhub-ai), the only
// publishing path. Network access goes through the documented SDK fetch.

// POST (or GET) JSON to the Worker with the shared-secret headers.
// Returns the parsed JSON as-is, or { ok: false, error } on any failure.
// A 401 with an unparsable body still reports 'unauthorized' so the real
// cause (a SHARED_SECRET mismatch) is never hidden behind a generic error.
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
    let data;
    try {
      data = await res.json();
    } catch {
      return {
        ok: false,
        error: res.status === 401 ? 'unauthorized' : 'worker_http_' + res.status,
      };
    }
    if (!res.ok && (!data || data.ok !== false)) {
      return { ok: false, error: 'worker_http_' + res.status };
    }
    return data;
  } catch {
    return { ok: false, error: 'worker_unreachable' };
  }
}

