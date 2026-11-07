"use strict";

/* ErffanHub Mini App — dashboard.
   Talks to the bot ONLY through Telegram.WebApp.Serverless.call.
   No secret is ever handled here, and no request goes to Cloudflare directly. */

var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

var statusEl = document.getElementById("status");
var newsListEl = document.getElementById("news-list");
var feedsListEl = document.getElementById("feeds-list");
var draftsListEl = document.getElementById("drafts-list");
var scheduledListEl = document.getElementById("scheduled-list");
var publishedListEl = document.getElementById("published-list");

function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", !!isError);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Promise wrapper around the official Mini Apps SDK call. */
function call(name, input) {
  return new Promise(function (resolve, reject) {
    if (!tg || !tg.Serverless || typeof tg.Serverless.call !== "function") {
      reject(new Error("ارتباط با بات در دسترس نیست. داشبورد را از داخل بات باز کن."));
      return;
    }
    try {
      var out = tg.Serverless.call(name, input || {}, function (err, res) {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        } else {
          resolve(res);
        }
      });
      if (out && typeof out.then === "function") {
        out.then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

function showError(err) {
  var message = err && err.message ? err.message : "خطایی رخ داد. دوباره تلاش کن.";
  setStatus(message, true);
}

function hapticSuccess() {
  try {
    if (
      tg &&
      tg.HapticFeedback &&
      typeof tg.HapticFeedback.notificationOccurred === "function"
    ) {
      tg.HapticFeedback.notificationOccurred("success");
    }
  } catch (err) {
    /* Haptic feedback is best-effort only. */
  }
}

var tehranTime = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTime(value) {
  if (value == null || value === "") {
    return "";
  }
  var date;
  if (typeof value === "number") {
    date = new Date(value);
  } else {
    date = new Date(value);
  }
  if (isNaN(date.getTime())) {
    return String(value);
  }
  return tehranTime.format(date);
}

/* "YYYY-MM-DD HH:mm" written in Tehran time -> epoch milliseconds.
   Iran abolished daylight saving in 2022, so the +03:30 offset is fixed. */
function parseTehranDateTime(text) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) {
    return null;
  }
  var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return utc - (3 * 60 + 30) * 60 * 1000;
}

function el(tag, className, html) {
  var node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (html != null) {
    node.innerHTML = html;
  }
  return node;
}

function actionButton(label, className, onClick) {
  var btn = el("button", "btn " + className);
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function asArray(result, key) {
  if (Array.isArray(result)) {
    return result;
  }
  if (result && Array.isArray(result[key])) {
    return result[key];
  }
  if (result && Array.isArray(result.items)) {
    return result.items;
  }
  return [];
}

function itemId(item) {
  return item.id != null ? item.id : item.news_item_id;
}

/* ---------- Tabs ---------- */

document.querySelectorAll(".tab-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
      b.classList.toggle("active", b === btn);
    });
    document.querySelectorAll(".tab-panel").forEach(function (panel) {
      var show = panel.id === "tab-" + btn.dataset.tab;
      panel.hidden = !show;
      panel.classList.toggle("active", show);
    });
    if (btn.dataset.tab === "drafts") {
      loadDrafts();
    } else if (btn.dataset.tab === "scheduled") {
      loadScheduled();
    } else {
      loadNews();
      loadFeeds();
    }
  });
});

function showTab(name) {
  var btn = document.querySelector('.tab-btn[data-tab="' + name + '"]');
  if (btn) {
    btn.click();
  }
}

/* ---------- News inbox ---------- */

async function loadNews() {
  try {
    var items = asArray(await call("listNews", {}), "news");
    var fresh = items.filter(function (item) {
      return !item.status || item.status === "new";
    });
    renderNews(fresh);
  } catch (err) {
    showError(err);
  }
}

function renderNews(items) {
  newsListEl.innerHTML = "";
  items.forEach(function (item) {
    var card = el("div", "card");
    card.appendChild(el("p", "item-title", escapeHtml(item.title || "بدون عنوان")));
    var meta = [item.feed || item.source || "", formatTime(item.published_at)]
      .filter(Boolean)
      .join(" — ");
    if (meta) {
      card.appendChild(el("p", "item-meta", escapeHtml(meta)));
    }
    if (item.description) {
      card.appendChild(el("p", "item-body", escapeHtml(item.description)));
    }
    if (item.link) {
      var link = el("a", "item-meta");
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "مشاهده خبر";
      card.appendChild(link);
    }
    var actions = el("div", "actions");
    actions.appendChild(
      actionButton("ساختن پست", "btn-primary", async function () {
        try {
          setStatus("در حال ساختن پیش‌نویس…");
          var draft = await call("makePost", { newsId: itemId(item) });
          setStatus("پیش‌نویس ساخته شد.");
          showTab("drafts");
          await loadDrafts();
          if (draft && draft.id != null) {
            var target = document.querySelector('[data-draft-id="' + draft.id + '"]');
            if (target) {
              target.scrollIntoView();
            }
          }
        } catch (err) {
          showError(err);
        }
      })
    );
    card.appendChild(actions);
    newsListEl.appendChild(card);
  });
}

document
  .getElementById("refresh-news-btn")
  .addEventListener("click", async function () {
    /* Fetching fresh news is a bot command, not a dashboard endpoint:
       send /news in the bot, then the inbox here refreshes. */
    setStatus("برای گرفتن خبرهای تازه، در بات دستور /news را بفرست؛ صندوق خبر در حال به‌روزرسانی است…");
    await loadNews();
    await loadFeeds();
  });

/* ---------- Feeds ---------- */

async function loadFeeds() {
  try {
    var feeds = asArray(await call("listFeeds", {}), "feeds");
    renderFeeds(feeds);
  } catch (err) {
    showError(err);
  }
}

function renderFeeds(feeds) {
  feedsListEl.innerHTML = "";
  feeds.forEach(function (feed) {
    var card = el("div", "card");
    var row = el("div", "feed-row");
    var info = el("div");
    info.appendChild(el("div", "feed-name", escapeHtml(feed.name || feed.url)));
    info.appendChild(el("div", "feed-url", escapeHtml(feed.url || "")));
    row.appendChild(info);
    var toggle = actionButton(
      !feed.active ? "فعال کردن" : "غیرفعال کردن",
      "btn-secondary",
      async function () {
        try {
await call("toggleFeed", { id: feed.id });
          setStatus("وضعیت فید تغییر کرد.");
          await loadFeeds();
        } catch (err) {
          showError(err);
        }
      }
    );
    row.appendChild(toggle);
    card.appendChild(row);
    var actions = el("div", "actions");
    actions.appendChild(
      actionButton("حذف", "btn-danger", async function () {
        if (!window.confirm("این فید حذف شود؟")) {
          return;
        }
        try {
          await call("removeFeed", { id: feed.id });
          setStatus("فید حذف شد.");
          await loadFeeds();
        } catch (err) {
          showError(err);
        }
      })
    );
    card.appendChild(actions);
    feedsListEl.appendChild(card);
  });
}

document
  .getElementById("add-feed-form")
  .addEventListener("submit", async function (event) {
    event.preventDefault();
    var nameInput = document.getElementById("feed-name");
    var urlInput = document.getElementById("feed-url");
    var url = urlInput.value.trim();
    if (!/^https:\/\//i.test(url)) {
      setStatus("آدرس فید باید با https شروع شود.", true);
      return;
    }
    try {
      await call("addFeed", { url: url, name: nameInput.value.trim() });
      setStatus("فید اضافه شد.");
      nameInput.value = "";
      urlInput.value = "";
      await loadFeeds();
    } catch (err) {
      showError(err);
    }
  });

/* ---------- Drafts ---------- */

async function loadDrafts() {
  try {
    var drafts = asArray(await call("listDrafts", {}), "drafts");
    renderDrafts(drafts.filter(function (d) {
      return !d.status || d.status === "draft";
    }));
  } catch (err) {
    showError(err);
  }
}

function renderDrafts(drafts) {
  draftsListEl.innerHTML = "";
  drafts.forEach(function (draft) {
    var card = el("div", "card");
    if (draft.id != null) {
      card.dataset.draftId = draft.id;
    }
    card.appendChild(el("p", "item-title", escapeHtml(draft.title || "بدون عنوان")));
    if (draft.media_url) {
      var img = el("img", "item-media");
      img.src = draft.media_url;
      img.alt = "";
      card.appendChild(img);
    }
    var bodyEl = el("p", "item-body", escapeHtml(draft.body || ""));
    card.appendChild(bodyEl);
    var actions = el("div", "actions");
    actions.appendChild(
      actionButton("ویرایش", "btn-secondary", function () {
        var editor = el("textarea");
        editor.value = draft.body || "";
        bodyEl.replaceWith(editor);
        actions.innerHTML = "";
        actions.appendChild(
          actionButton("ذخیره", "btn-primary", async function () {
            try {
              await call("editDraft", { id: draft.id, body: editor.value });
              setStatus("پیش‌نویس ذخیره شد.");
              await loadDrafts();
            } catch (err) {
              showError(err);
            }
          })
        );
        actions.appendChild(
          actionButton("انصراف", "btn-secondary", function () {
            loadDrafts();
          })
        );
        editor.focus();
      })
    );
    actions.appendChild(
      actionButton("انتشار الان", "btn-primary", async function () {
        if (!window.confirm("این پست الان در کانال منتشر شود؟")) {
          return;
        }
        try {
          setStatus("در حال انتشار…");
          await call("publishDraft", { id: draft.id });
          setStatus("منتشر شد.");
          hapticSuccess();
          await loadDrafts();
        } catch (err) {
          showError(err);
        }
      })
    );
    card.appendChild(actions);
    draftsListEl.appendChild(card);
  });
}

/* ---------- Scheduled + publish history ---------- */

async function loadScheduled() {
  try {
    var drafts = asArray(await call("listDrafts", {}), "drafts");
    renderScheduled(
      drafts.filter(function (d) {
        return d.status === "scheduled";
      })
    );
    renderPublished(
      drafts.filter(function (d) {
        return d.status === "published";
      })
    );
  } catch (err) {
    showError(err);
  }
}

function renderScheduled(drafts) {
  scheduledListEl.innerHTML = "";
  drafts.forEach(function (draft) {
    var card = el("div", "card");
    card.appendChild(el("p", "item-title", escapeHtml(draft.title || "بدون عنوان")));
    card.appendChild(
      el("p", "item-meta", escapeHtml("زمان انتشار: " + formatTime(draft.publish_at)))
    );
    if (draft.body) {
      card.appendChild(el("p", "item-body", escapeHtml(draft.body)));
    }
    var actions = el("div", "actions");
    actions.appendChild(
      actionButton("لغو زمان‌بندی", "btn-danger", async function () {
        if (!window.confirm("زمان‌بندی این پست لغو شود؟")) {
          return;
        }
        try {
          await call("cancelScheduled", { id: draft.id });
          setStatus("زمان‌بندی لغو شد.");
          await loadScheduled();
        } catch (err) {
          showError(err);
        }
      })
    );
    actions.appendChild(
      actionButton("تغییر ساعت", "btn-secondary", async function () {
        var input = window.prompt(
          "ساعت جدید انتشار (به وقت تهران):",
          "YYYY-MM-DD HH:mm"
        );
        if (input == null || input.trim() === "") {
          return;
        }
        var publishAt = parseTehranDateTime(input);
        if (publishAt == null) {
          setStatus("قالب ساعت درست نیست. مثلاً: 2026-11-08 18:00", true);
          return;
        }
        try {
          await call("scheduleDraft", { id: draft.id, publish_at: publishAt });
          setStatus("ساعت انتشار تغییر کرد.");
          await loadScheduled();
        } catch (err) {
          showError(err);
        }
      })
    );
    card.appendChild(actions);
    scheduledListEl.appendChild(card);
  });
}

function renderPublished(drafts) {
  publishedListEl.innerHTML = "";
  drafts.forEach(function (draft) {
    var card = el("div", "card");
    card.appendChild(el("p", "item-title", escapeHtml(draft.title || "بدون عنوان")));
    card.appendChild(
      el("p", "item-meta", escapeHtml("منتشر شده: " + formatTime(draft.publish_at)))
    );
    publishedListEl.appendChild(card);
  });
}

/* ---------- Export ---------- */

document
  .getElementById("export-btn")
  .addEventListener("click", async function () {
    try {
      setStatus("در حال آماده‌سازی خروجی…");
      var result = await call("exportData", {});
      var data = result && result.data != null ? result.data : result;
      var blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "erffanhub-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("خروجی دانلود شد.");
    } catch (err) {
      showError(err);
    }
  });

/* ---------- Start ---------- */

async function init() {
  if (!tg) {
    setStatus("این صفحه فقط داخل تلگرام کار می‌کند.", true);
    return;
  }
  tg.ready();
  tg.expand();
  try {
    var dashboard = await call("getDashboard", {});
    var counts = [];
    if (dashboard) {
      if (dashboard.news && dashboard.news.new != null) {
        counts.push("خبر تازه: " + dashboard.news.new);
      }
      if (dashboard.drafts && dashboard.drafts.draft != null) {
        counts.push("پیش‌نویس: " + dashboard.drafts.draft);
      }
      if (dashboard.scheduled != null) {
        counts.push("زمان‌بندی‌شده: " + dashboard.scheduled);
      }
    }
    setStatus(counts.length ? counts.join(" — ") : "داشبورد آماده است.");
  } catch (err) {
    setStatus("داشبورد آماده است.");
  }
  await loadNews();
  await loadFeeds();
}

init();
