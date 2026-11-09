"use strict";

const httpPolicy = value => Array.isArray(value) ? value.map(httpPolicy) :
  String(value).split(";").map(part => part.trim())
    .filter(part => part && part.toLowerCase() !== "upgrade-insecure-requests").join("; ");

// Next's production headers are baked at build time, while the observer's
// transport is selected at startup. Adapt only HTTP observation responses at
// the final header write; HTTPS and the regular Studio keep their policies.
function adaptObserverHttpResponse(res) {
  const writeHead = res.writeHead;
  res.writeHead = function(status, message, headers) {
    const supplied = typeof message === "string" ? headers : message;
    let filtered = supplied;
    if (Array.isArray(supplied)) {
      filtered = [];
      for (let i = 0; i < supplied.length; i += 2) {
        const name = String(supplied[i]).toLowerCase();
        if (name === "strict-transport-security") continue;
        filtered.push(supplied[i], name === "content-security-policy" ? httpPolicy(supplied[i + 1]) : supplied[i + 1]);
      }
    } else if (supplied) {
      filtered = {};
      for (const [name, value] of Object.entries(supplied)) {
        if (name.toLowerCase() === "strict-transport-security") continue;
        filtered[name] = name.toLowerCase() === "content-security-policy" ? httpPolicy(value) : value;
      }
    }
    const existing = this.getHeader("Content-Security-Policy");
    if (existing !== undefined) this.setHeader("Content-Security-Policy", httpPolicy(existing));
    this.removeHeader("Strict-Transport-Security");
    return typeof message === "string"
      ? writeHead.call(this, status, message, filtered)
      : writeHead.call(this, status, filtered);
  };
}

module.exports = {adaptObserverHttpResponse};
