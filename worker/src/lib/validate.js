// Shared URL validation for every outbound fetch this Worker makes.
// Only public https URLs are allowed. Private, loopback and link-local
// addresses are blocked so a feed URL can never be used to reach an
// internal service (SSRF).

function isPrivateIpv4(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => {
    if (!/^\d+$/.test(p)) return -1;
    const n = Number(p);
    return n >= 0 && n <= 255 ? n : -1;
  });
  if (nums.some((n) => n < 0)) return false;
  const [a, b] = nums;
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

export function validateUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim() === "") {
    return { ok: false, reason: "empty_url" };
  }
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "https_only" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials_not_allowed" };
  }
  const host = url.hostname.toLowerCase();
  if (host === "" ) {
    return { ok: false, reason: "missing_host" };
  }
  if (host === "localhost" || host.endsWith(".local")) {
    return { ok: false, reason: "blocked_host" };
  }
  if (host === "::1" || host === "[::1]") {
    return { ok: false, reason: "blocked_host" };
  }
  if (isPrivateIpv4(host)) {
    return { ok: false, reason: "private_ip" };
  }
  return { ok: true };
}
