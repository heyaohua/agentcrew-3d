"use strict";

// Explicit public observation mode exposes only display resources, never Studio APIs.
function isPublicObserverRead(req) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { return false; }
  if (pathname.includes("\\") || /(^|\/)\.\.?($|\/)/.test(pathname)) return false;
  return pathname === "/observe" || pathname === "/observe/" ||
    (pathname === "/api/observer/state" && req.method === "GET") ||
    pathname.startsWith("/_next/static/") || pathname.startsWith("/office-assets/") ||
    pathname === "/favicon.ico";
}

module.exports = {isPublicObserverRead};
