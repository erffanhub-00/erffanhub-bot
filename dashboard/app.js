// ErffanHub Files — owner dashboard (Mini App). Plain JS, no build
// step. Every call goes through the bot's owner-only endpoints; the
// platform verifies the Mini App init data before any endpoint runs.
// While the dashboard is open it also calls the `cleanup` endpoint
// every 30 seconds, so self-deleting messages are swept on a real
// timer without any extra setup (the Cloudflare Worker cron in
// cleanup-worker/ is the 24/7 version of the same call).

'use strict';

var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
var content = document.getElementById('content');
var toastEl = document.getElementById('toast');
var currentTab = 'stats';
var state = {}; // per-tab { q, page }

// ---------- small helpers ----------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtToman(n) {
  return (Number(n) || 0).toLocaleString('fa-IR') + ' تومان';
}

function fmtBytes(n) {
  if (n == null || n === '') return '—';
  var b = Number(n);
  if (!isFinite(b) || b < 0) return '—';
  if (b < 1024) return b + ' بایت';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' کیلوبایت';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' مگابایت';
  return (b / (1024 * 1024 * 1024)).toFixed(2) + ' گیگابایت';
}

// Timestamps are mixed: some columns store epoch seconds (unixepoch
// default), others epoch milliseconds (Date.now()). Seconds are
// ~1.8e9, milliseconds ~1.8e12 — the threshold tells them apart.
function fmtDate(v) {
  if (!v) return '—';
  var ms = Number(v) > 1e11 ? Number(v) : Number(v) * 1000;
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
  } catch (e) {
    return '—';
  }
}

function displayName(u) {
  if (!u) return '—';
  var name = [u.first_name, u.last_name].filter(Boolean).join(' ');
  if (u.username) return (name ? name + ' — ' : '') + '@' + u.username;
  return name || String(u.user_id || '—');
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(function () { toastEl.classList.remove('show'); }, 2500);
}

function call(name, input) {
  return new Promise(function (resolve, reject) {
    if (!tg || !tg.Serverless) return reject(new Error('no-telegram'));
    tg.Serverless.call(name, input || {}, function (err, res) {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

function confirmDialog(text) {
  return new Promise(function (resolve) {
    if (tg && tg.showConfirm) tg.showConfirm(text, resolve);
    else resolve(window.confirm(text));
  });
}

// ---------- tab plumbing ----------

function tabState(tab) {
  if (!state[tab]) state[tab] = { q: '', page: 0 };
  return state[tab];
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  loadTab();
}

function loadTab() {
  content.innerHTML = '<p class="muted">در حال بارگذاری…</p>';
  var fn = {
    stats: renderStats,
    users: renderUsers,
    files: renderFiles,
    tx: renderTx,
    receipts: renderReceipts,
    support: renderSupport,
    broadcast: renderBroadcast,
    db: renderDb,
  }[currentTab];
  if (fn) fn().catch(showError);
}

function showError(err) {
  var msg = (err && err.message) || 'خطا';
  if (msg === 'forbidden' || msg === 'no-telegram') {
    content.innerHTML =
      '<div class="panel"><h3>فقط مالک</h3>' +
      '<p>این داشبورد فقط برای مالک بات است. آن را از داخل تلگرام، با همان حسابی که مالک بات است، باز کن.</p></div>';
    return;
  }
  content.innerHTML = '<div class="panel"><h3>خطا</h3><p>' + esc(msg) + '</p></div>';
}

function pagerHtml(tab, page, totalPages, total) {
  var html = '<div class="pager">';
  html += '<button type="button" data-pager="-1" ' + (page <= 0 ? 'disabled' : '') + '>◀ قبلی</button>';
  html += '<span>صفحه ' + (page + 1) + ' از ' + Math.max(1, totalPages) + ' — ' + (total || 0) + ' مورد</span>';
  html += '<button type="button" data-pager="1" ' + (page >= totalPages - 1 ? 'disabled' : '') + '>بعدی ▶</button>';
  html += '</div>';
  return html;
}

function bindPager(tab, page, totalPages, total, rerender) {
  content.querySelectorAll('[data-pager]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var s = tabState(tab);
      s.page = Math.max(0, Math.min(totalPages - 1, s.page + Number(btn.dataset.pager)));
      rerender();
    });
  });
}

function searchHtml(tab, placeholder) {
  var s = tabState(tab);
  return '<div class="toolbar"><input type="search" id="search" placeholder="' + esc(placeholder) +
    '" value="' + esc(s.q) + '"></div>';
}

function bindSearch(tab, rerender) {
  var input = document.getElementById('search');
  if (!input) return;
  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var s = tabState(tab);
      s.q = input.value.trim();
      s.page = 0;
      rerender();
    }, 400);
  });
}

// ---------- stats ----------

function renderStats() {
  return call('adminStats', {}).then(function (d) {
    var cards = [
      [d.filesTotal, 'فایل'],
      [d.usersTotal, 'کاربر'],
      [d.downloadsTotal, 'دانلود'],
      [fmtToman(d.totalCharged), 'مجموع شارژها'],
      [fmtToman(d.totalPurchased), 'مجموع خریدها'],
      [d.pendingReceipts, 'رسید در انتظار'],
      [d.unansweredSupport, 'پیام پشتیبانی بی‌پاسخ'],
      [d.usersToday + ' امروز / ' + d.usersWeek + ' هفته', 'کاربر جدید'],
    ];
    var html = '<div class="cards">' + cards.map(function (c) {
      return '<div class="card"><div class="num">' + esc(c[0]) + '</div><div class="lbl">' + esc(c[1]) + '</div></div>';
    }).join('') + '</div>';
    html += '<h3>تراکنش‌های اخیر</h3>' + txTable(d.recentTransactions || []);
    html += '<h3>دانلودهای اخیر</h3>' + downloadsTable(d.recentDownloads || []);
    content.innerHTML = html;
  });
}

function txTable(rows) {
  if (!rows.length) return '<p class="muted">موردی نیست.</p>';
  var html = '<table><tr><th>کاربر</th><th>نوع</th><th>مبلغ</th><th>وضعیت</th><th>زمان</th></tr>';
  rows.forEach(function (t) {
    html += '<tr><td>' + esc(t.username ? '@' + t.username : t.user_id) + '</td>' +
      '<td>' + esc(kindLabel(t.kind)) + '</td>' +
      '<td>' + esc(fmtToman(t.amount)) + '</td>' +
      '<td>' + statusBadge(t.status) + '</td>' +
      '<td>' + esc(fmtDate(t.created_at)) + '</td></tr>';
  });
  return html + '</table>';
}

function downloadsTable(rows) {
  if (!rows.length) return '<p class="muted">موردی نیست.</p>';
  var html = '<table><tr><th>فایل</th><th>کاربر</th><th>زمان</th></tr>';
  rows.forEach(function (d) {
    html += '<tr><td>' + esc(d.file_id) + '</td>' +
      '<td>' + esc(d.username ? '@' + d.username : d.user_id) + '</td>' +
      '<td>' + esc(fmtDate(d.downloaded_at)) + '</td></tr>';
  });
  return html + '</table>';
}

function kindLabel(kind) {
  return { charge: 'شارژ', purchase: 'خرید', adjust: 'تغییر دستی' }[kind] || kind || '—';
}

function statusBadge(status) {
  if (status === 'approved') return '<span class="badge green">تایید شده</span>';
  if (status === 'rejected') return '<span class="badge red">رد شده</span>';
  if (status === 'pending') return '<span class="badge amber">در انتظار</span>';
  return esc(status || '—');
}

// ---------- users ----------

function renderUsers() {
  var s = tabState('users');
  return call('adminUsers', { q: s.q, page: s.page }).then(function (d) {
    var html = searchHtml('users', 'جستجو: نام، یوزرنیم یا آیدی…');
    html += '<table><tr><th>کاربر</th><th>موجودی</th><th>دانلود</th><th>تلفن</th><th>آخرین فعالیت</th><th></th></tr>';
    d.pageItems.forEach(function (u) {
      html += '<tr><td>' + esc(displayName(u)) + '<br><span class="muted">' + esc(u.user_id) + '</span></td>' +
        '<td>' + esc(fmtToman(u.balance)) + '</td>' +
        '<td>' + esc(u.downloads) + '</td>' +
        '<td dir="ltr">' + esc(u.phone || '—') + '</td>' +
        '<td>' + esc(fmtDate(u.last_seen)) + '</td>' +
        '<td><button type="button" class="small" onclick="showUser(' + u.user_id + ')">جزئیات</button></td></tr>';
    });
    html += '</table>' + pagerHtml('users', d.page, d.totalPages, d.total);
    content.innerHTML = html;
    bindSearch('users', renderUsers);
    bindPager('users', d.page, d.totalPages, d.total, renderUsers);
  });
}

function showUser(userId) {
  content.innerHTML = '<p class="muted">در حال بارگذاری…</p>';
  call('adminUser', { userId: userId }).then(function (d) {
    var u = d.user;
    var html = '<button type="button" class="small" onclick="setTab(\'users\')">◀ بازگشت به کاربران</button>';
    html += '<div class="panel"><h3>' + esc(displayName(u)) + '</h3>' +
      '<p>آیدی: <span dir="ltr">' + esc(u.user_id) + '</span><br>' +
      'زبان: ' + esc(u.language_code || '—') + ' | پریمیوم تلگرام: ' + (u.is_premium ? 'بله' : 'خیر') + '<br>' +
      'تلفن: <span dir="ltr">' + esc(u.phone || '—') + '</span><br>' +
      'عضو کانال/گروه: ' + (u.is_member ? 'بله' : 'خیر') + '<br>' +
      'اولین بازدید: ' + esc(fmtDate(u.first_seen)) + ' | آخرین فعالیت: ' + esc(fmtDate(u.last_seen)) + '</p></div>';
    html += '<div class="panel"><h3>💰 تغییر موجودی</h3>' +
      '<p>موجودی فعلی: <b>' + esc(fmtToman(u.balance)) + '</b></p>' +
      '<div class="field"><label>موجودی جدید (تومان)</label>' +
      '<input type="number" id="new-balance" min="0" step="1000" value="' + (Number(u.balance) || 0) + '"></div>' +
      '<button type="button" class="primary" onclick="saveBalance(' + u.user_id + ')">ذخیره موجودی</button></div>';
    html += '<div class="panel"><h3>📩 پیام به این کاربر</h3>' +
      '<div class="field"><textarea id="user-message" rows="3" placeholder="متن پیام…"></textarea></div>' +
      '<button type="button" class="primary" onclick="sendUserMessage(' + u.user_id + ')">ارسال پیام</button></div>';
    html += '<h3>دانلودها</h3>' + downloadsTable(d.downloads || []);
    html += '<h3>تراکنش‌ها</h3>' + txTable(d.transactions || []);
    content.innerHTML = html;
  }).catch(showError);
}

function saveBalance(userId) {
  var input = document.getElementById('new-balance');
  var value = Number(input.value);
  if (!isFinite(value) || value < 0) return toast('مبلغ درست نیست.');
  call('adminSetBalance', { userId: userId, balance: value }).then(function (d) {
    toast('موجودی شد ' + fmtToman(d.balance));
    showUser(userId);
  }).catch(function (err) { toast((err && err.message) || 'خطا'); });
}

function sendUserMessage(userId) {
  var input = document.getElementById('user-message');
  var text = input.value.trim();
  if (!text) return toast('متن پیام خالی است.');
  call('adminMessage', { userId: userId, text: text }).then(function () {
    toast('پیام فرستاده شد ✅');
    input.value = '';
  }).catch(function (err) { toast((err && err.message) || 'خطا'); });
}

// ---------- files ----------

function renderFiles() {
  var s = tabState('files');
  return call('adminFiles', { q: s.q, page: s.page }).then(function (d) {
    var html = searchHtml('files', 'جستجو: عنوان، دسته یا نام فایل…');
    html += '<table><tr><th>آیدی</th><th>عنوان</th><th>دسته</th><th>قیمت</th><th>دانلود</th><th></th></tr>';
    d.pageItems.forEach(function (f) {
      html += '<tr><td><b>' + esc(f.id) + '</b></td>' +
        '<td>' + esc(f.title || '—') + '</td>' +
        '<td>' + esc(f.category || '—') + '</td>' +
        '<td>' + (Number(f.price) > 0 ? '💰 ' + esc(fmtToman(f.price)) : 'رایگان') + '</td>' +
        '<td>' + esc(f.downloads) + '</td>' +
        '<td><button type="button" class="small" onclick="showFile(\'' + esc(f.id) + '\')">ویرایش</button></td></tr>';
    });
    html += '</table>' + pagerHtml('files', d.page, d.totalPages, d.total);
    content.innerHTML = html;
    bindSearch('files', renderFiles);
    bindPager('files', d.page, d.totalPages, d.total, renderFiles);
  });
}

function showFile(fileId) {
  content.innerHTML = '<p class="muted">در حال بارگذاری…</p>';
  call('adminFile', { fileId: fileId }).then(function (d) {
    var f = d.file;
    var html = '<button type="button" class="small" onclick="setTab(\'files\')">◀ بازگشت به فایل‌ها</button>';
    html += '<div class="panel"><h3>' + esc(f.id) + ' — ' + esc(f.title || '—') + '</h3>' +
      '<p>نسخه: ' + esc(f.version) + ' | پارت: ' + esc(f.parts_count) + ' | حجم: ' + esc(fmtBytes(f.size_total)) +
      '<br>دانلود: ' + esc((d.downloads || []).length) + ' | ساخته شده: ' + esc(fmtDate(f.created_at)) + '</p></div>';
    html += '<div class="panel"><h3>✏️ ویرایش فایل</h3>' +
      '<div class="field"><label>عنوان</label><input type="text" id="f-title" value="' + esc(f.title || '') + '"></div>' +
      '<div class="field"><label>توضیح</label><textarea id="f-desc" rows="2">' + esc(f.description || '') + '</textarea></div>' +
      '<div class="field"><label>دسته</label><input type="text" id="f-cat" value="' + esc(f.category || '') + '"></div>' +
      '<div class="field"><label>قیمت (تومان — ۰ یعنی رایگان)</label>' +
      '<input type="number" id="f-price" min="0" step="1000" value="' + (Number(f.price) || 0) + '"></div>' +
      '<button type="button" class="primary" onclick="saveFile(\'' + esc(f.id) + '\')">ذخیره تغییرات</button> ' +
      '<button type="button" class="danger" onclick="deleteFile(\'' + esc(f.id) + '\')">🗑️ حذف فایل</button></div>';
    if (d.versions && d.versions.length) {
      html += '<h3>نسخه‌ها</h3><table><tr><th>نسخه</th><th>عنوان</th><th>دانلود</th><th>زمان</th></tr>';
      d.versions.forEach(function (v) {
        html += '<tr><td>' + esc(v.version) + '</td><td>' + esc(v.title || '—') + '</td>' +
          '<td>' + esc(d.perVersion[v.version] || 0) + '</td><td>' + esc(fmtDate(v.created_at)) + '</td></tr>';
      });
      html += '</table>';
    }
    content.innerHTML = html;
  }).catch(showError);
}

function saveFile(fileId) {
  var price = Number(document.getElementById('f-price').value);
  if (!isFinite(price) || price < 0) return toast('قیمت درست نیست.');
  call('adminEditFile', {
    fileId: fileId,
    title: document.getElementById('f-title').value,
    description: document.getElementById('f-desc').value,
    category: document.getElementById('f-cat').value,
    price: price,
  }).then(function () {
    toast('تغییرات ذخیره شد ✅');
    showFile(fileId);
  }).catch(function (err) { toast((err && err.message) || 'خطا'); });
}

function deleteFile(fileId) {
  confirmDialog('فایل ' + fileId + ' با همه نسخه‌ها و دانلودهایش حذف شود؟').then(function (ok) {
    if (!ok) return;
    call('adminDeleteFile', { fileId: fileId }).then(function () {
      toast('فایل حذف شد.');
      setTab('files');
    }).catch(function (err) { toast((err && err.message) || 'خطا'); });
  });
}

// ---------- transactions ----------

function renderTx() {
  var s = tabState('tx');
  return call('adminTransactions', { q: s.q, page: s.page }).then(function (d) {
    var html = searchHtml('tx', 'جستجو: یوزرنیم، آیدی، نوع، وضعیت یا فایل…');
    html += txTable(d.pageItems);
    html += pagerHtml('tx', d.page, d.totalPages, d.total);
    content.innerHTML = html;
    bindSearch('tx', renderTx);
    bindPager('tx', d.page, d.totalPages, d.total, renderTx);
  });
}

// ---------- receipts ----------

function renderReceipts() {
  return call('adminReceipts', {}).then(function (d) {
    var html = '<p class="muted">رسیدهای در انتظار تایید. تایید = شارژ کیف پول + اطلاع به کاربر + تحویل خودکار فایل پولی در انتظار.</p>';
    if (!d.rows.length) {
      html += '<p class="muted">رسیدی در انتظار نیست. ✅</p>';
    } else {
      html += '<table><tr><th>کاربر</th><th>مبلغ</th><th>زمان</th><th></th></tr>';
      d.rows.forEach(function (t) {
        html += '<tr><td>' + esc(displayName(t.user)) + '<br><span class="muted">' + esc(t.user_id) + '</span></td>' +
          '<td>' + esc(fmtToman(t.amount)) + '</td>' +
          '<td>' + esc(fmtDate(t.created_at)) + '</td>' +
          '<td><button type="button" class="small primary" onclick="settleReceipt(' + t.receipt_message_id + ', true)">✅ تایید</button> ' +
          '<button type="button" class="small danger" onclick="settleReceipt(' + t.receipt_message_id + ', false)">❌ رد</button></td></tr>';
      });
      html += '</table>';
    }
    content.innerHTML = html;
  });
}

function settleReceipt(messageId, approve) {
  call('adminSettleReceipt', { messageId: messageId, approve: approve }).then(function (d) {
    toast(d.status === 'already' ? 'این رسید قبلاً تعیین تکلیف شده بود.' : (approve ? 'رسید تایید و کیف پول شارژ شد ✅' : 'رسید رد شد.'));
    renderReceipts();
  }).catch(function (err) { toast((err && err.message) || 'خطا'); });
}

// ---------- support ----------

function renderSupport() {
  var s = tabState('support');
  return call('adminSupport', { page: s.page }).then(function (d) {
    var html = '';
    if (!d.pageItems.length) {
      html += '<p class="muted">پیام پشتیبانی‌ای نیست. ✅</p>';
    } else {
      html += '<table><tr><th>کاربر</th><th>نوع</th><th>متن</th><th>وضعیت</th><th>زمان</th><th></th></tr>';
      d.pageItems.forEach(function (m) {
        html += '<tr><td>' + esc(m.username ? '@' + m.username : m.user_id) + '</td>' +
          '<td>' + esc(supportKindLabel(m.kind)) + '</td>' +
          '<td>' + esc((m.text || '—').slice(0, 120)) + '</td>' +
          '<td>' + (m.answered ? '<span class="badge green">پاسخ داده شده</span>' : '<span class="badge amber">بی‌پاسخ</span>') + '</td>' +
          '<td>' + esc(fmtDate(m.created_at)) + '</td>' +
          '<td><button type="button" class="small" onclick="replySupport(' + m.id + ')">پاسخ</button></td></tr>';
      });
      html += '</table>' + pagerHtml('support', d.page, d.totalPages, d.total);
    }
    content.innerHTML = html;
    bindPager('support', d.page, d.totalPages, d.total, renderSupport);
  });
}

function supportKindLabel(kind) {
  return { text: 'متن', photo: 'عکس', document: 'فایل', other: 'دیگر' }[kind] || kind || '—';
}

function replySupport(messageId) {
  var text = window.prompt('پاسخ به کاربر:');
  if (!text || !text.trim()) return;
  call('adminSupportReply', { messageId: messageId, text: text.trim() }).then(function () {
    toast('پاسخ فرستاده شد ✅');
    renderSupport();
  }).catch(function (err) { toast((err && err.message) || 'خطا'); });
}

// ---------- broadcast ----------

function renderBroadcast() {
  var html = '<div class="panel"><h3>📣 اطلاع‌رسانی</h3>' +
    '<div class="field"><label>مخاطب</label><select id="bc-audience">' +
    '<option value="all">همه کاربران</option>' +
    '<option value="file">کاربران یک فایل</option>' +
    '<option value="user">یک کاربر</option></select></div>' +
    '<div class="field" id="bc-file-field" style="display:none"><label>آیدی فایل (مثل F001)</label>' +
    '<input type="text" id="bc-file" placeholder="F001"></div>' +
    '<div class="field" id="bc-user-field" style="display:none"><label>آیدی عددی کاربر</label>' +
    '<input type="number" id="bc-user" placeholder="123456789"></div>' +
    '<div class="field"><label>متن پیام</label><textarea id="bc-text" rows="4" placeholder="متن اطلاع‌رسانی…"></textarea></div>' +
    '<button type="button" class="primary" onclick="sendBroadcast()">ارسال</button></div>';
  content.innerHTML = html;
  document.getElementById('bc-audience').addEventListener('change', function (e) {
    document.getElementById('bc-file-field').style.display = e.target.value === 'file' ? 'block' : 'none';
    document.getElementById('bc-user-field').style.display = e.target.value === 'user' ? 'block' : 'none';
  });
  return Promise.resolve();
}

function sendBroadcast() {
  var audience = document.getElementById('bc-audience').value;
  var text = document.getElementById('bc-text').value.trim();
  if (!text) return toast('متن پیام خالی است.');
  var input = { audience: audience, text: text };
  if (audience === 'file') {
    input.fileId = document.getElementById('bc-file').value.trim().toUpperCase();
    if (!input.fileId) return toast('آیدی فایل را بنویس.');
  }
  if (audience === 'user') {
    input.userId = Number(document.getElementById('bc-user').value);
    if (!input.userId) return toast('آیدی کاربر را بنویس.');
  }
  confirmDialog('پیام به ' + ({ all: 'همه کاربران', file: 'کاربران فایل ' + input.fileId, user: 'کاربر ' + input.userId })[audience] + ' فرستاده شود؟').then(function (ok) {
    if (!ok) return;
    call('adminBroadcast', input).then(function (d) {
      toast('فرستاده شد: ' + d.ok + ' موفق، ' + d.fail + ' ناموفق (از ' + d.total + ' نفر)');
      document.getElementById('bc-text').value = '';
    }).catch(function (err) { toast((err && err.message) || 'خطا'); });
  });
}

// ---------- database ----------

function renderDb() {
  return call('adminDb', {}).then(function (d) {
    var labels = {
      files: 'فایل‌ها', file_parts: 'پارت‌های فایل', file_versions: 'نسخه‌ها',
      downloads: 'دانلودها', users: 'کاربران', wallet_transactions: 'تراکنش‌ها',
      github_cache: 'کش گیت‌هاب', expiring_messages: 'پیام‌های در انتظار حذف',
      support_messages: 'پیام‌های پشتیبانی', settings: 'تنظیمات',
    };
    var html = '<div class="panel"><h3>🗄️ جدول‌ها</h3><table>';
    Object.keys(labels).forEach(function (k) {
      html += '<tr><td>' + esc(labels[k]) + '</td><td><b>' + esc(d.counts[k] == null ? 0 : d.counts[k]) + '</b></td></tr>';
    });
    html += '</table></div>';
    html += '<div class="panel"><h3>💾 پشتیبان</h3>' +
      '<p class="muted">دانلود کامل دیتابیس به‌صورت فایل JSON.</p>' +
      '<button type="button" class="primary" onclick="downloadBackup()">دانلود پشتیبان (JSON)</button></div>';
    html += '<div class="panel"><h3>🧹 پاک‌سازی</h3>' +
      '<p class="muted">فایل‌ها، کاربران، موجودی‌ها و تراکنش‌ها هرگز از اینجا پاک نمی‌شوند.</p>' +
      '<button type="button" onclick="clearDb(\'downloads\')">پاک کردن تاریخچه دانلودها</button> ' +
      '<button type="button" onclick="clearDb(\'cache\')">پاک کردن کش گیت‌هاب</button></div>';
    content.innerHTML = html;
  });
}

function downloadBackup() {
  call('adminBackup', {}).then(function (data) {
    var date = new Date().toISOString().slice(0, 10);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'erffanhub-backup-' + date + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('پشتیبان دانلود شد ✅');
  }).catch(function (err) { toast((err && err.message) || 'خطا'); });
}

function clearDb(target) {
  var label = target === 'downloads' ? 'تاریخچه دانلودها' : 'کش گیت‌هاب';
  confirmDialog(label + ' پاک شود؟').then(function (ok) {
    if (!ok) return;
    call('adminClear', { target: target }).then(function (d) {
      toast('پاک شد (' + d.cleared + ' مورد).');
      renderDb();
    }).catch(function (err) { toast((err && err.message) || 'خطا'); });
  });
}

// ---------- init ----------

document.querySelectorAll('#tabs button').forEach(function (b) {
  b.addEventListener('click', function () { setTab(b.dataset.tab); });
});

document.getElementById('refresh').addEventListener('click', loadTab);

if (tg) {
  tg.ready();
  try { tg.expand(); } catch (e) { /* older clients */ }
}

loadTab();

// Auto-cleanup timer: while the dashboard is open, sweep
// self-deleting messages every 30 seconds. Errors are ignored —
// the lazy sweep on bot use is the fallback.
function sweepNow() {
  call('cleanup', {}).catch(function () {});
}
sweepNow();
setInterval(sweepNow, 30000);
