// Map a Worker failure to the real reason, in Persian. The bot must
// never collapse a failure into a bare "خطایی رخ داد" — the owner needs
// to know what is actually wrong so they can fix it. Unknown codes are
// shown raw, never swallowed.

const WORKER_ERROR_FA = {
  unauthorized:
    'سکرت مشترک (SHARED_SECRET) در config.js با سکرت Worker یکی نیست — هر دو را یکی کن و دوباره push بده.',
  worker_unreachable:
    'Worker در دسترس نیست — WORKER_URL را چک کن و مطمئن شو wrangler deploy انجام شده.',
  ai_unavailable:
    'Workers AI در دسترس نیست — در داشبورد Cloudflare لاگ Worker را ببین.',
  ai_empty_response:
    'Workers AI جواب خالی داد — دوباره تلاش کن؛ اگر تکرار شد لاگ Worker را ببین.',
  ai_error:
    'Workers AI خطا داد — در داشبورد Cloudflare لاگ Worker را ببین.',
  kv_not_configured:
    'KV در Worker تنظیم نشده — دستور wrangler kv namespace create را بزن و آیدی را در wrangler.toml بگذار.',
};

// Returns the Persian explanation for a callWorker result, or null when
// the result is a success.
export function workerErrorMessage(res) {
  if (!res || res.ok === true) return null;
  const code = String(res.error || 'unknown_error');
  if (WORKER_ERROR_FA[code]) return WORKER_ERROR_FA[code];
  if (code.startsWith('ai_')) {
    return (
      'Workers AI جواب نداد — در داشبورد Cloudflare لاگ Worker را ببین. (' +
      code +
      ')'
    );
  }
  if (code.startsWith('worker_http_')) {
    return 'Worker با خطای HTTP ' + code.slice('worker_http_'.length) + ' جواب داد.';
  }
  return 'خطای Worker: ' + code;
}
