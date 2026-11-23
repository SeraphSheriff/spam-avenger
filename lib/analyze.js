/* Spam Avenger for Gmail — analysis engine.
 * Ported from spamfighter.py. No dependencies, no network except
 * RDAP + DNS-over-HTTPS lookups of the SPAMMER's IP.
 * Works in the browser extension and in Node (for tests).
 */
(function () {
  "use strict";

  var RDAP_BASES = [
    "https://rdap.arin.net/registry/ip/",
    "https://rdap.db.ripe.net/ip/",
    "https://rdap.apnic.net/ip/",
    "https://rdap.lacnic.net/rdap/ip/",
    "https://rdap.afrinic.net/rdap/ip/"
  ];

  // Never generate complaints against the big mailbox providers' own
  // infrastructure — their IPs show up in headers for YOUR OWN mail too.
  var PROVIDER_WHITELIST = [
    "google.com", "googlemail.com", "outlook.com", "hotmail.com",
    "live.com", "microsoft.com", "yahoo.com", "aol.com", "icloud.com",
    "me.com", "mac.com", "apple.com", "proton.me", "protonmail.com", "zoho.com"
  ];

  var SKETCHY_TLDS = ["shop", "top", "xyz", "click", "buzz", "lol", "gdn",
    "win", "bid", "loan", "men", "stream", "sbs", "quest"];

  var URL_RE = /https?:\/\/[^\s<>"']+/g;

  function isPrivateIp(ip) {
    var parts = String(ip).split(".");
    if (parts.length !== 4) return true;
    var n = parts.map(function (p) { return parseInt(p, 10); });
    if (n.some(function (p) { return isNaN(p) || p < 0 || p > 255; })) return true;
    var a = n[0], b = n[1];
    return (a === 10 || a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168));
  }

  // Split raw message text into unfolded headers [{name, value}, ...].
  function parseHeaders(rawText) {
    var head = String(rawText).split(/\r?\n\r?\n/)[0] || "";
    var headers = [];
    var current = null;
    head.split(/\r?\n/).forEach(function (line) {
      if (/^[ \t]/.test(line) && current) {
        current.value += " " + line.trim();
      } else {
        var m = line.match(/^([^:]+):\s*(.*)$/);
        if (m) {
          current = { name: m[1].toLowerCase(), value: m[2] };
          headers.push(current);
        } else {
          current = null;
        }
      }
    });
    return headers;
  }

  function getAll(headers, name) {
    return headers.filter(function (h) { return h.name === name; })
      .map(function (h) { return h.value; });
  }

  function getFirst(headers, name) {
    var all = getAll(headers, name);
    return all.length ? all[0] : "";
  }

  // First public IPv4 in the oldest Received header (ingress hop).
  // Tries bracketed IPs first (highest confidence), then bare IPs.
  function originIp(headers) {
    var recvd = getAll(headers, "received");
    var bracketPat = /\[(\d{1,3}(?:\.\d{1,3}){3})\]/g;
    var barePat = /(?:^|[^0-9.])([0-9]{1,3}(?:\.[0-9]{1,3}){3})(?![0-9.])/g;
    function validIp(ip) {
      var parts = String(ip).split(".");
      if (parts.length !== 4) return false;
      return parts.every(function (p) {
        return /^\d{1,3}$/.test(p) && parseInt(p, 10) <= 255;
      });
    }
    function candsFrom(text, pat) {
      var cands = [], m;
      pat.lastIndex = 0;
      while ((m = pat.exec(text))) {
        if (validIp(m[1]) && !isPrivateIp(m[1])) cands.push(m[1]);
      }
      return cands;
    }
    function sweep(pat) {
      var cands = [];
      if (recvd.length) {
        cands = candsFrom(recvd[recvd.length - 1], pat);
      }
      for (var i = 0; i < recvd.length && !cands.length; i++) {
        cands = candsFrom(recvd[i], pat);
      }
      return cands;
    }
    var cands = sweep(bracketPat);
    if (!cands.length) cands = sweep(barePat);
    return cands.length ? cands[0] : null;
  }

  function fetchJson(url, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; resolve(null); }
      }, timeoutMs || 8000);
      fetch(url, { headers: { "Accept": "application/json" } })
        .then(function (res) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(res.ok ? res.json().catch(function () { return null; }) : null);
        })
        .catch(function () {
          if (!done) { done = true; clearTimeout(timer); resolve(null); }
        });
    });
  }

  function rdapLookup(ip) {
    var chain = Promise.resolve(null);
    RDAP_BASES.forEach(function (base) {
      chain = chain.then(function (found) {
        if (found) return found;
        return fetchJson(base + encodeURIComponent(ip), 8000);
      });
    });
    return chain;
  }

  function vcardEmail(vcardArray) {
    if (!vcardArray || vcardArray.length < 2) return null;
    var props = vcardArray[1] || [];
    for (var i = 0; i < props.length; i++) {
      var item = props[i];
      if (Array.isArray(item) && item.length >= 4 && item[0] === "email") {
        return item[3];
      }
    }
    return null;
  }

  function vcardFn(vcardArray) {
    if (!vcardArray || vcardArray.length < 2) return null;
    var props = vcardArray[1] || [];
    for (var i = 0; i < props.length; i++) {
      var item = props[i];
      if (Array.isArray(item) && item.length >= 4 && item[0] === "fn") {
        return item[3];
      }
    }
    return null;
  }

  // v1.0.71: last-resort abuse contact — some registries never
  // fill the structured abuse entity and instead write the
  // address into a free-text RDAP remark. The GhostyNet case
  // (AFRINIC block 196.251.121.0/24, Nov 4 2026): the record's
  // only abuse pointer was a remarks line, "Abuse email:
  // ghostynet@airmail.cc", so every structured-field reader
  // reported "not published". Scan remarks ONLY when the
  // remark is about abuse, so an unrelated remark that merely
  // contains an email address never surfaces as a contact.
  function abuseEmailInRemarks(obj) {
    var remarks = (obj && obj.remarks) || [];
    for (var i = 0; i < remarks.length; i++) {
      var r = remarks[i] || {};
      var parts = [];
      if (r.title) parts.push(String(r.title));
      if (Array.isArray(r.description)) {
        for (var j = 0; j < r.description.length; j++) {
          parts.push(String(r.description[j]));
        }
      } else if (r.description) {
        parts.push(String(r.description));
      }
      var text = parts.join(" ");
      if (!/abuse/i.test(text)) continue;
      var m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      if (m) return m[0];
    }
    return null;
  }

  function extractAbuse(obj) {
    if (!obj) return null;
    var ents = obj.entities || [];
    for (var i = 0; i < ents.length; i++) {
      var ent = ents[i];
      var roles = (ent.roles || []).map(function (r) { return String(r).toLowerCase(); });
      if (roles.indexOf("abuse") !== -1) {
        var em = vcardEmail(ent.vcardArray);
        if (em) return em;
      }
      var nested = extractAbuse(ent);
      if (nested) return nested;
    }
    return abuseEmailInRemarks(obj);
  }

  function extractOrg(obj) {
    if (!obj) return null;
    (obj.entities || []).forEach(function () {});
    var ents = obj.entities || [];
    for (var i = 0; i < ents.length; i++) {
      var roles = (ents[i].roles || []).map(function (r) { return String(r).toLowerCase(); });
      if (roles.indexOf("registrant") !== -1) {
        var fn = vcardFn(ents[i].vcardArray);
        if (fn) return fn;
      }
    }
    return obj.name || null;
  }

  // Reverse DNS via DNS-over-HTTPS (no raw DNS in a browser).
  function reverseDns(ip) {
    var rev = String(ip).split(".").reverse().join(".") + ".in-addr.arpa";
    return fetchJson("https://dns.google/resolve?name=" +
      encodeURIComponent(rev) + "&type=PTR", 8000).then(function (d) {
        try {
          var ans = d.Answer || [];
          for (var i = 0; i < ans.length; i++) {
            if (ans[i].type === 12 && ans[i].data) {
              return String(ans[i].data).replace(/\.$/, "");
            }
          }
        } catch (e) {}
        return "unknown";
      });
  }

  // v1.0.68: Michael's "no website" tell. A throwaway sending
  // domain often runs NO website at all — no A or AAAA records
  // for the apex or its www host — because it exists only to
  // send mail. Checked over the same dns.google permission the
  // reverse-DNS lookup above already uses; no new permissions.
  // Resolves true ONLY on a confirmed-empty result (every query
  // answered, none carrying any Answer record). Resolves false
  // when any record exists, and null on ANY error or uncertainty
  // (a failed or timed-out query, a SERVFAIL, a malformed
  // reply) — callers assert the tell only on === true and stay
  // silent otherwise. Results are cached per domain.
  var noWebsiteCache = {};
  function dnsAnswerList(name, type) {
    return fetchJson("https://dns.google/resolve?name=" +
      encodeURIComponent(name) + "&type=" + type, 3000)
      .then(function (d) {
        if (!d || typeof d.Status !== "number") return null;
        if (d.Status === 3) return []; // NXDOMAIN: the name is not there
        if (d.Status !== 0) return null; // SERVFAIL etc: no conclusion
        return Array.isArray(d.Answer) ? d.Answer : [];
      })
      .catch(function () { return null; });
  }
  function domainNoWebsite(domain) {
    domain = String(domain || "").toLowerCase().replace(/\.$/, "");
    if (!domain || domain.indexOf(".") === -1) {
      return Promise.resolve(null);
    }
    if (noWebsiteCache[domain]) return noWebsiteCache[domain];
    var jobs = [];
    [domain, "www." + domain].forEach(function (name) {
      ["A", "AAAA"].forEach(function (type) {
        jobs.push(dnsAnswerList(name, type));
      });
    });
    var p = Promise.all(jobs).then(function (rs) {
      for (var i = 0; i < rs.length; i++) {
        if (rs[i] === null) return null; // one unknown poisons the verdict
        if (rs[i].length) return false; // a record exists: it has web DNS
      }
      return true; // every name answered, all empty: no website
    }).catch(function () { return null; });
    noWebsiteCache[domain] = p;
    return p;
  }

  // Public 1.0.72 release (internal build .73): the
  // registrable domains of a domain's MX hosts, over the same
  // dns.google plumbing as the no-website tell (no new
  // permissions). Resolves an array — EMPTY when the domain
  // publishes no MX records — or null on any error or
  // uncertainty: callers treat null as "no MX data" and fall
  // back, never as "publishes no MX". Cached per domain. The
  // one consumer is the spoofed-From determination below:
  // where a domain receives its mail is the sharpest public
  // statement of what its mail infrastructure is.
  var mxCache = {};
  function mxHostDomains(domain) {
    domain = String(domain || "").toLowerCase().replace(/\.$/, "");
    if (!domain || domain.indexOf(".") === -1) {
      return Promise.resolve(null);
    }
    if (mxCache[domain]) return mxCache[domain];
    var p = dnsAnswerList(domain, "MX").then(function (ans) {
      if (ans === null) return null;
      var out = [];
      ans.forEach(function (r) {
        if (r.type !== 15 || !r.data) return;
        var host = String(r.data).trim().split(/\s+/).pop()
          .replace(/\.$/, "").toLowerCase();
        var rg = registrableDomain(host);
        if (rg && out.indexOf(rg) === -1) out.push(rg);
      });
      return out;
    }).catch(function () { return null; });
    mxCache[domain] = p;
    return p;
  }

  // --- v1.0.70: the ACID-style sender-domain trace -------------
  // The RrSG's ACID tool (acidtool.com) splits an abuse report
  // into three lanes — the mail host, the WEBSITE host, and the
  // domain's REGISTRAR — because a fraud operation is three
  // rented services, and the mail complaint only reaches one of
  // them. Michael ran the tool by hand on a real case (the
  // .shop Fifteen, Nov 3 2026) and it found two desks the mail
  // trace had missed entirely: the sites for 13 of the 15
  // domains sat on one hoster's server while the mail came from
  // another, and the registrar's own record named the
  // registrant. So the panel now traces the SENDER DOMAIN the
  // same way, from public data only (DNS-over-HTTPS + RDAP —
  // no dependence on acidtool.com):
  //
  //   lane 2, WEBSITE HOST: the From domain's A record (CNAMEs
  //   followed) -> RDAP of the resolving IP -> the hosting org
  //   and its abuse contact, with a hosting-shaped complaint —
  //   or, when the IP belongs to a form-only host (the same
  //   hyperscaler / OVH detection the mail lane uses), the
  //   form-kit presentation instead of an email.
  //
  //   lane 3, REGISTRAR: the domain's own RDAP record ->
  //   registrar name and abuse contact, the registration date
  //   with its age against the message's arrival (the
  //   fresh-domain tell: registered within 30 days before the
  //   message landed), and the registrant when the record
  //   doesn't redact it — plus a DNS Abuse complaint to the
  //   registrar's abuse desk.
  //
  // The trace runs from the PANEL, after the mail lanes render
  // (traceSenderDomain below) — never inside investigate():
  // the mail pipeline's network behavior is pinned by the
  // v1.0.68 suite (a normal sender must not trigger sender-
  // domain DNS there). It never runs for a whitelisted mailbox
  // provider's domain (a Gmail sender's "website host" is
  // Google and its registrar is a corporate registrar — noise,
  // and the mail lane already says report the account). Every
  // failure resolves to null fields: the panel simply shows
  // nothing new, exactly as it does today.

  // The registrable root of a host/domain (last two labels, or
  // three under a known multi-label suffix) — the same rule
  // lib/demand.js applies, mirrored here because the registrar
  // lane needs it and the two modules load independently.
  // Registries only answer RDAP for the root: asking for a
  // subdomain's record is a 404.
  var MULTI_LABEL_SUFFIXES = [
    "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au",
    "org.au", "co.nz", "com.br", "com.cn", "com.tw", "co.jp",
    "co.kr", "co.in", "com.mx", "com.sg", "com.hk", "co.za"
  ];

  function registrableDomain(host) {
    var s = String(host == null ? "" : host).toLowerCase().trim();
    var at = s.lastIndexOf("@");
    if (at !== -1) s = s.slice(at + 1);
    s = s.replace(/^www\./, "").replace(/\.+$/, "");
    var labels = s.split(".").filter(function (x) { return !!x; });
    if (labels.length <= 2) return labels.join(".");
    var last2 = labels.slice(-2).join(".");
    if (MULTI_LABEL_SUFFIXES.indexOf(last2) !== -1) {
      return labels.slice(-3).join(".");
    }
    return last2;
  }

  // Pure: pick the usable result out of one DoH Answer list
  // for an A query. Returns {ip} for the first public A
  // record, {cname} when the answer carries only a CNAME,
  // or null when it carries neither. (A recursive resolver
  // usually returns the CNAME *and* the target's A records in
  // one answer — the A wins when both are present.)
  function pickAFromAnswers(answer) {
    if (!Array.isArray(answer)) return null;
    var cname = null;
    for (var i = 0; i < answer.length; i++) {
      var r = answer[i] || {};
      if (r.type === 1 && r.data && !isPrivateIp(String(r.data))) {
        return { ip: String(r.data) };
      }
      if (r.type === 5 && r.data && !cname) {
        cname = String(r.data).replace(/\.$/, "").toLowerCase();
      }
    }
    return cname ? { cname: cname } : null;
  }

  // Resolve a domain's website IP: A record, following CNAMEs
  // (at most 5 hops) via the same dns.google plumbing as the
  // no-website tell. Resolves the IP string, or null when the
  // domain has no usable A record or any lookup errors — the
  // caller stays silent on null, as everywhere else here.
  function websiteIpFor(domain) {
    var start = String(domain || "").toLowerCase().replace(/\.$/, "");
    if (!start || start.indexOf(".") === -1) {
      return Promise.resolve(null);
    }
    var hops = 0;
    function step(name) {
      if (hops++ >= 5) return Promise.resolve(null);
      return dnsAnswerList(name, "A").then(function (ans) {
        if (ans === null) return null; // error: no conclusion
        var pick = pickAFromAnswers(ans);
        if (!pick) return null;
        if (pick.ip) return pick.ip;
        if (pick.cname && pick.cname !== name) return step(pick.cname);
        return null;
      });
    }
    return step(start).catch(function () { return null; });
  }

  // Pure: the website lane's form-lane key, from the website
  // IP's RDAP identity. SAME detection as the mail lane's, in
  // the same order: the hyperscaler flag wins, then the
  // v1.0.27 OVH match on the abuse contact / org. Returns
  // "google" | "aws" | "azure" | "ovh" | null.
  function websiteFormLane(info) {
    if (!info) return null;
    if (info.hyperscaler) return info.hyperscaler;
    if (/ovh/i.test(String(info.abuse || "") + " " +
        String(info.org || ""))) return "ovh";
    return null;
  }

  // The website host behind a domain: resolving IP, its PTR
  // name, and the RDAP identity (org / abuse contact / cloud
  // flag / form lane). checkedDate stamps when the resolution
  // was observed — the hosting complaint quotes it, because a
  // DNS answer is a fact about the day it was read. Resolves
  // null when the domain has no website IP or the RDAP chain
  // fails outright; an IP whose RDAP fails still resolves,
  // carrying null org/abuse (the panel shows the facts it has).
  function websiteHostFor(domain) {
    var dom = String(domain || "").toLowerCase().replace(/\.$/, "");
    return websiteIpFor(dom).then(function (ip) {
      if (!ip) return null;
      return Promise.all([rdapLookup(ip), reverseDns(ip)])
        .then(function (rs) {
          var rdap = rs[0];
          var info = {
            domain: dom,
            ip: ip,
            host: rs[1] || "unknown",
            org: rdap ? extractOrg(rdap) : null,
            abuse: rdap ? extractAbuse(rdap) : null,
            hyperscaler: rdap ? hyperscalerOf(rdap) : null,
            checkedDate: new Date().toISOString().slice(0, 10)
          };
          info.formLane = websiteFormLane(info);
          return info;
        });
    }).catch(function () { return null; });
  }

  // Domain RDAP (registrar lane): the same bootstrap chain
  // lib/demand.js established for the registration-contact
  // lookup — the IANA bootstrap (data.iana.org/rdap/dns.json,
  // cached for the session) maps the TLD to its registry's
  // RDAP base; when the bootstrap or the registry yields
  // nothing, https://rdap.org/domain/<domain> (which redirects
  // to the authoritative server) is the fallback. Registry
  // RDAP serves CORS *, so the manifest needs the two entry
  // points only — both already permitted. Resolves the parsed
  // JSON or null; never rejects.
  var domainRdapServicesCache = null;
  function loadDomainRdapServices() {
    if (domainRdapServicesCache) {
      return Promise.resolve(domainRdapServicesCache);
    }
    return fetchJson("https://data.iana.org/rdap/dns.json", 8000)
      .then(function (json) {
        domainRdapServicesCache = (json && json.services) || null;
        return domainRdapServicesCache;
      })
      .catch(function () { return null; });
  }
  function domainRdapBaseFor(services, tld) {
    if (!services) return "";
    for (var i = 0; i < services.length; i++) {
      var tlds = services[i][0] || [];
      var urls = services[i][1] || [];
      if (tlds.indexOf(tld) !== -1 && urls.length) {
        return String(urls[0]).replace(/\/?$/, "/");
      }
    }
    return "";
  }
  function fetchDomainRdap(domain) {
    var d = String(domain || "").toLowerCase().replace(/\.$/, "");
    if (!d || d.indexOf(".") === -1) return Promise.resolve(null);
    var fallback = function () {
      return fetchJson("https://rdap.org/domain/" +
        encodeURIComponent(d), 8000);
    };
    return loadDomainRdapServices().then(function (services) {
      var base = domainRdapBaseFor(services, d.split(".").pop());
      if (!base) return fallback();
      return fetchJson(base + "domain/" + encodeURIComponent(d), 8000)
        .then(function (json) { return json || fallback(); });
    }).catch(function () { return null; });
  }

  function vcardOrg(vcardArray) {
    if (!vcardArray || vcardArray.length < 2) return null;
    var props = vcardArray[1] || [];
    for (var i = 0; i < props.length; i++) {
      var item = props[i];
      if (Array.isArray(item) && item.length >= 4 && item[0] === "org") {
        return item[3];
      }
    }
    return null;
  }

  // A vCard value that survives redaction screening: many
  // registries publish the registrant entity with placeholder
  // values ("REDACTED FOR PRIVACY" and friends) instead of
  // omitting it. A redacted value is no value.
  function unredacted(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s || /redact/i.test(s)) return null;
    return s;
  }

  // The abuse email inside an entity's own subtree: the
  // entity itself when it wears the abuse role, else the
  // first abuse-role descendant (extractAbuse's walk).
  function abuseEmailWithin(ent) {
    if (!ent) return null;
    var roles = (ent.roles || []).map(function (r) {
      return String(r).toLowerCase();
    });
    if (roles.indexOf("abuse") !== -1) {
      var em = vcardEmail(ent.vcardArray);
      if (em) return em;
    }
    return extractAbuse(ent);
  }

  // Pure: a domain RDAP record -> the registrar block.
  // { registrar, registrarAbuse, registered, registrant } —
  // every field null when the record doesn't publish it.
  // registrarAbuse prefers the abuse contact inside the
  // registrar entity's own subtree; the fallback is the
  // record's first abuse contact anywhere (in a domain
  // record, an abuse entity is the registrar's desk — there
  // is no other abuse role for one to be). registrant is
  // { name, org, email } with redacted values screened out,
  // or null when nothing unredacted survives.
  function parseDomainRdap(obj) {
    var out = { registrar: null, registrarAbuse: null,
                registered: null, registrant: null };
    if (!obj || typeof obj !== "object") return out;
    (obj.events || []).forEach(function (ev) {
      var act = String((ev && ev.eventAction) || "").toLowerCase();
      if ((act === "registration" || act === "registered") &&
          ev.eventDate && !out.registered) {
        out.registered = String(ev.eventDate);
      }
    });
    var ents = obj.entities || [];
    for (var i = 0; i < ents.length; i++) {
      var roles = (ents[i].roles || []).map(function (r) {
        return String(r).toLowerCase();
      });
      if (roles.indexOf("registrar") !== -1 && !out.registrar) {
        out.registrar = unredacted(vcardFn(ents[i].vcardArray));
        out.registrarAbuse = abuseEmailWithin(ents[i]);
      }
      if (roles.indexOf("registrant") !== -1 && !out.registrant) {
        var rn = unredacted(vcardFn(ents[i].vcardArray));
        var ro = unredacted(vcardOrg(ents[i].vcardArray));
        var re = unredacted(vcardEmail(ents[i].vcardArray));
        if (rn || ro || re) {
          out.registrant = { name: rn, org: ro, email: re };
        }
      }
    }
    if (!out.registrarAbuse) out.registrarAbuse = extractAbuse(obj);
    return out;
  }

  // The stamp half of one Received header value: the date
  // after the final ";" ("... by mx.example; Sun, 08 Nov
  // 2026 12:49:02 -0500"). "" when the value carries no
  // stamp at all.
  function receivedStampOf(value) {
    var v = String(value || "");
    var i = v.lastIndexOf(";");
    return i === -1 ? "" : v.slice(i + 1).trim();
  }

  // Public 1.0.72 release (internal build .73): the
  // EFFECTIVE message date — the one moment every
  // "received on" line and every freshness computation in
  // this file means (Michael-approved fix, Nov 8 2026).
  //
  // Field autopsy: the July Name form evidence for
  // hzxhqz.com (registered 2025-03-25, ~594 days before
  // the message arrived) carried the YOUNG registrar
  // framing, because the analysis date came straight from
  // the spammer's Date header — "Sun, 4 November 2026
  // 6:33:4 0700", malformed — and Firefox's Date parser
  // rejects that string where Node/V8 accepts it. With no
  // parseable date, domainFreshness returned null (young
  // framing by default) and utcStamp echoed the raw
  // garbage into the "Date/time received (UTC)" line. Two
  // symptoms, one root: trusting the SENDER's Date header
  // as the message's moment.
  //
  // Resolution order:
  //   1. the Date header, when this engine can parse it —
  //      returned VERBATIM, so normal mail renders
  //      byte-identically everywhere it rendered before;
  //   2. the first parseable Received stamp, in header
  //      order — the topmost Received is the final
  //      delivery hop, so its stamp IS the arrival, and
  //      the Received chain is stamped by servers, not by
  //      the sender;
  //   3. with allowNow, the moment of analysis.
  // Without allowNow and with nothing parseable, the raw
  // Date header comes back unchanged: a partial hand-built
  // analysis (unit fixtures never retain Received stamps)
  // keeps the legacy rendering, raw echo included.
  function resolveEffectiveDate(dateHeader, stamps, allowNow) {
    var raw = String(dateHeader || "");
    if (raw && !isNaN(new Date(raw).getTime())) return raw;
    var list = stamps || [];
    for (var i = 0; i < list.length; i++) {
      var s = String(list[i] || "");
      if (s && !isNaN(new Date(s).getTime())) return s;
    }
    return allowNow ? new Date().toISOString() : raw;
  }

  // The accessor every date consumer routes through. An
  // analysis that came through analyze() carries its
  // resolved effectiveDate (computed there with the "now"
  // step armed); anything else resolves on the fly from
  // what it carries — Date header first, then the
  // retained Received stamps — and degrades to the raw
  // header when neither resolves.
  function effectiveDate(a) {
    if (!a) return "";
    if (typeof a.effectiveDate === "string" && a.effectiveDate) {
      return a.effectiveDate;
    }
    return resolveEffectiveDate(a.date, a.receivedStamps, false);
  }

  // Pure: a registration date against the message's arrival.
  // { daysBefore, fresh } — fresh is the tell: registered no
  // more than 30 days before the message arrived (the same
  // day counts). A registration AFTER the arrival (clock
  // games, parked-then-rebuilt records) is never "fresh".
  // Null when either date won't parse.
  function domainFreshness(registered, messageDate) {
    var reg = new Date(String(registered || ""));
    var msg = new Date(String(messageDate || ""));
    if (isNaN(reg.getTime()) || isNaN(msg.getTime())) return null;
    var days = Math.floor((msg.getTime() - reg.getTime()) / 86400000);
    return { daysBefore: days, fresh: days >= 0 && days <= 30 };
  }

  // The evidence tail both new complaints share with the mail
  // complaint: the full headers (signature blocks stripped,
  // capped) or the key-headers fallback, then the defanged
  // body excerpt — same treatment, same caps, same wording as
  // buildComplaint's, so a desk reading two of this addon's
  // reports about one operation sees the same evidence shape.
  function complaintEvidenceTail(L, a, opts) {
    var headerCap = opts.headerCap != null ? opts.headerCap : 8000;
    var bodyCap = opts.bodyCap != null ? opts.bodyCap : 4000;
    if (a.fullHeaders) {
      var th = trimHeaders(String(a.fullHeaders));
      var fh = th.text;
      var truncated = fh.length > headerCap;
      if (truncated) fh = fh.slice(0, headerCap);
      L.push("Full headers (plain text, as received):");
      fh.split("\n").forEach(function (ln) { L.push("  " + ln); });
      if (th.stripped) L.push("  [ARC/DKIM signature blocks omitted — routing and authentication headers are complete]");
      if (truncated) L.push("  [headers truncated at " + headerCap + " characters]");
      L.push("");
    } else {
      L.push("Key headers as evidence:");
      L.push("  Message-ID: " + (a.messageId || "unknown"));
      if (a.ingressReceived) L.push("  " + a.ingressReceived);
      L.push("");
    }
    if (a.bodyText && bodyCap > 0) {
      var bt = defangText(String(a.bodyText).slice(0, bodyCap));
      L.push("Message body (plain text, links defanged so spam filters don't eat this report — read hxxps as https and [.] as .):");
      bt.split("\n").forEach(function (ln) { L.push("  " + ln); });
      L.push("");
    }
  }

  function complaintLinks(L, a) {
    if (a.urls && a.urls.length) {
      L.push("  Links in message (defanged so spam filters don't eat this complaint — read hxxps as https and [.] as .):");
      a.urls.slice(0, 10).forEach(function (u) { L.push("    - " + defangUrl(u)); });
    }
  }

  // The WEBSITE HOST complaint: same {to, subject, body} shape
  // as buildComplaint, addressed to the abuse contact of the
  // network the From domain's website resolves to. Its ask is
  // the hosting ask — you host the fraud operation's website;
  // investigate and suspend hosting — and its facts are the
  // domain, the resolving IP, and the day that was checked.
  // Null when there is no website trace, no published abuse
  // contact, or the host is a form-only lane (the panel shows
  // that lane's form kit instead of an email — an emailed
  // complaint there is deflected to the form anyway).
  function buildHostingComplaint(a, opts) {
    opts = opts || {};
    if (!a || !a.websiteHost) return null;
    var w = a.websiteHost;
    if (!w.ip || !w.abuse || w.formLane) return null;
    var domain = w.domain || a.senderDomain || "unknown";
    var L = [];
    L.push("Hello Abuse Team,");
    L.push("");
    L.push("You host the website for a domain that is running a " +
      "fraud operation. The domain sent me the spam / fraud " +
      "message detailed below, and its website resolves to " +
      "your network:");
    L.push("");
    L.push("  Domain:         " + domain);
    L.push("  Website IP:     " + w.ip +
      (w.org ? " (" + w.org + ")" : "") +
      (w.checkedDate ? " — resolving there when checked on " +
        w.checkedDate : ""));
    L.push("  Claimed sender: " + (a.from || "unknown"));
    L.push("  Subject:        " + (a.subject || "unknown"));
    L.push("  Date received:  " + (effectiveDate(a) || "unknown"));
    complaintLinks(L, a);
    L.push("");
    var prsH = priorReportSection(a.priorReports);
    if (prsH) { L.push(prsH); L.push(""); }
    complaintEvidenceTail(L, a, opts);
    L.push("The sending mail hosts, the registrar, and the " +
      "registry have already been reported for this fraud. " +
      "The website is the piece of the operation still " +
      "standing. Please investigate and suspend hosting for " +
      "this domain. Thank you.");
    return {
      to: w.abuse,
      subject: "Hosting abuse complaint — fraud site for " +
        domain + " on " + w.ip,
      body: L.join("\n")
    };
  }

  // The REGISTRAR complaint (DNS Abuse): same shape again,
  // addressed to the registrar's abuse desk. Its theme is the
  // domain itself as fraud infrastructure — registered, then
  // put to fraud within days — told with the registration
  // date and the interval, because that interval is the
  // evidence a registrar can act on. That theme is the YOUNG
  // framing: past the 90-day line (see the age-framing note
  // at the intro below) the letter switches to the
  // old-domain framing and an investigate-and-notify ask.
  // Null when the record publishes no registrar abuse contact.
  function buildRegistrarComplaint(a, opts) {
    opts = opts || {};
    if (!a || !a.registrarInfo || !a.registrarInfo.registrarAbuse) {
      return null;
    }
    var ri = a.registrarInfo;
    var domain = registrableDomain(a.senderDomain || "") ||
      (senderEmail(a.from).match(/@([\w.-]+)/) || [])[1] || "unknown";
    var L = [];
    L.push("Hello Registrar Abuse Team,");
    L.push("");
    // Public 1.0.72 release (internal build .73): the AGE
    // FRAMING — Michael's call, Nov 8 2026, the young line
    // drawn at 90 days. A domain registered within 90 days
    // of the message keeps the original letter
    // byte-for-byte: born-for-fraud is the story a
    // registrar can act on, and the interval is the
    // evidence. An OLDER domain gets a different letter
    // AND a different ask: old domains sending fraud point
    // to a compromise or a spoof, and "suspend this fraud
    // infrastructure" aimed at a decades-old domain (his
    // colorami.com specimen, registered 2000, described by
    // the un-gated text as having gone "from registration
    // to fraud almost immediately" 9,616 days later) is
    // the wrong instrument — the ask becomes investigate
    // and notify the registrant. Exactly 90 is young;
    // 91+ is old. No registration date, or no computable
    // interval: the original text, no age sentence.
    var fr = ri.registered
      ? (ri.freshness || domainFreshness(ri.registered, effectiveDate(a)))
      : null;
    var oldDomain = !!(fr && fr.daysBefore > 90);
    var intro;
    if (oldDomain) {
      intro = "I am reporting fraud sent using a domain " +
        "registered through you.";
      intro += " " + domain + " was registered on " +
        utcStamp(ri.registered);
      intro += " and the fraud message below arrived " +
        fr.daysBefore + " days later.";
      intro += " The domain is long-established, so this " +
        "points to a compromise or spoofing rather than a " +
        "throwaway registration; the headers below are the " +
        "evidence.";
    } else {
      intro = "I am reporting a domain registered through " +
        "you that exists to run fraud.";
      if (ri.registered) {
        intro += " " + domain + " was registered on " +
          utcStamp(ri.registered);
        if (fr && fr.daysBefore === 0) {
          intro += " and the fraud message below arrived the same day";
        } else if (fr && fr.daysBefore === 1) {
          intro += " and the fraud message below arrived 1 day later";
        } else if (fr && fr.daysBefore > 1) {
          intro += " and the fraud message below arrived " +
            fr.daysBefore + " days later";
        }
        intro += " — the domain went from registration to fraud " +
          "almost immediately.";
      }
    }
    L.push(intro);
    L.push("");
    L.push("  Domain:         " + domain);
    if (ri.registrar) L.push("  Registrar:      " + ri.registrar);
    if (ri.registered) {
      L.push("  Registered:     " + utcStamp(ri.registered));
    }
    L.push("  Claimed sender: " + (a.from || "unknown"));
    L.push("  Subject:        " + (a.subject || "unknown"));
    L.push("  Date received:  " + (effectiveDate(a) || "unknown"));
    complaintLinks(L, a);
    L.push("");
    var prsR = priorReportSection(a.priorReports);
    if (prsR) { L.push(prsR); L.push(""); }
    complaintEvidenceTail(L, a, opts);
    if (oldDomain) {
      L.push("Please investigate, notify the registrant " +
        "that their domain is being used to send fraud, " +
        "and take appropriate action. Thank you.");
    } else {
      L.push("Spam used as a delivery mechanism for fraud and " +
        "phishing is DNS Abuse under ICANN's definition, and " +
        "this domain is fraud infrastructure, not a legitimate " +
        "registration. Please investigate and suspend the " +
        "domain. Thank you.");
    }
    return {
      to: ri.registrarAbuse,
      subject: "DNS abuse report — " + domain +
        (oldDomain ? "" : " (fraud infrastructure)"),
      body: L.join("\n")
    };
  }

  // The website lane's form-kit evidence block: the same
  // skeleton as buildFormEvidence (summary, labeled facts,
  // full headers) with website-truthful wording — the form
  // lanes' mail-shaped slices claim the message was SENT from
  // the report's IP, which is false for a website address, so
  // this lane's block says what is actually true: the domain
  // that sent the message is HOSTED there. Used when the
  // website IP belongs to a form-only host; the panel pairs
  // it with that host's own form (label/URL from the shared
  // hint table). Null when there is no website trace.
  function buildHostingFormEvidence(a, opts) {
    opts = opts || {};
    var headerCap = opts.headerCap != null ? opts.headerCap : 8000;
    if (!a || !a.websiteHost || !a.websiteHost.ip) return null;
    var w = a.websiteHost;
    var domain = w.domain || a.senderDomain || "unknown";
    var L = [];
    L.push("The website for " + domain + " — the domain that " +
      "sent the spam / fraud message below — is hosted on " +
      "your network. The domain resolves to IP address " +
      w.ip + (w.org ? " (registered to " + w.org + ")" : "") +
      (w.checkedDate ? ", checked on " + w.checkedDate : "") +
      ". Please investigate and suspend hosting for this " +
      "domain. The message details and full headers follow " +
      "as evidence.");
    L.push("");
    L.push("Website: " + domain);
    L.push("Website IP: " + w.ip);
    if (w.checkedDate) L.push("Resolving there when checked: " + w.checkedDate);
    L.push("From: " + (a.from || "unknown"));
    L.push("Subject: " + (a.subject || "unknown"));
    L.push("Date/time received (UTC): " + utcStamp(effectiveDate(a)));
    if (a.ingressReceived) L.push("Received: " + a.ingressReceived);
    if (a.urls && a.urls.length) {
      L.push("Links in message (defanged — read hxxps as https and [.] as .):");
      a.urls.slice(0, 10).forEach(function (u) { L.push("  - " + defangUrl(u)); });
    }
    L.push("");
    if (a.fullHeaders) {
      var th = trimHeaders(String(a.fullHeaders));
      var fh = th.text;
      var truncated = fh.length > headerCap;
      if (truncated) fh = fh.slice(0, headerCap);
      L.push("Full headers (plain text, as received):");
      fh.split("\n").forEach(function (ln) { L.push(ln); });
      if (th.stripped) L.push("[ARC/DKIM signature blocks omitted — routing and authentication headers are complete]");
      if (truncated) L.push("[headers truncated at " + headerCap + " characters]");
    } else if (a.ingressReceived) {
      L.push("Key headers as evidence:");
      L.push("  Message-ID: " + (a.messageId || "unknown"));
      L.push("  Received: " + a.ingressReceived);
    }
    return L.join("\n");
  }

  // --- Public 1.0.72 release (internal build .73): the July
  // Name registrar form kit (Michael's call, Nov 8 2026) ---
  // July Name Limited is a registrar-side DEFLECTOR: its own
  // auto-reply (Nov 8 2026, answering a registrar complaint
  // this addon drafted) states the abuse address "is no
  // longer designated" for abuse complaints and every report
  // must go through its web form instead. Per Michael's
  // Oct 28 2026 deflector rule — a lane that says "ready to
  // send" and then "this desk won't act" contradicts itself —
  // the registrar lane for a July Name domain is the FORM KIT
  // (evidence box + form button), exactly as deflector hosts
  // already get. Detection: the RDAP registrar name, with the
  // abuse contact's domain as the secondary signal. Every
  // other registrar keeps the email lane untouched.
  var JULYNAME_FORM_URL = "https://www.juyu.com/jubao_sy.htm";
  // v1.0.73 (queued-wanshang-form-only-registrar.md):
  // Wanshang Technology is the second form-only registrar
  // desk. Its published abuse address (abuse@kh86.cn)
  // autoresponds (Nov 20 2026, answering Michael's
  // jiuzhicui.com complaint) that the mailbox "will no
  // longer be used to receive complaints about domain name
  // misuse" — every report goes through its platform
  // instead. Michael filed there by hand on Nov 21 2026
  // (complaint WSABUSE-202611212348-8027): the form is in
  // Chinese, gates on an emailed 6-digit verification code,
  // caps the description at 2,000 characters, and its
  // abuse-URL field rejects URLs on any domain but the
  // complained one. Detection mirrors July Name's: the
  // RDAP registrar name, with the abuse contact's domain
  // as the secondary signal (the field case's RDAP name
  // was a sister company — Vantage of Convergence
  // (Chengdu) — while the abuse desk was kh86.cn's).
  var WANSHANG_FORM_URL = "https://ws.nameabuse.net/";
  // v1.0.74 (queued-newfold-form-lane.md, queued-brandfocus-
  // form-lane.md, queued-enom-form-lane.md, queued-godaddy-
  // form-lane.md — Michael's calls, Nov 23 2026): FOUR more
  // form-only registrar desks, each proven by the reply to a
  // real emailed complaint of Michael's that same morning:
  // Newfold Digital (Web.com / Network Solutions) — its
  // abuse-whois@newfold.com autoresponder says do not reply
  // and directs ALL abuse reports to https://newfold.com/
  // abuse; BrandFocus (brandfocus.cn) — its auto-reply says
  // the mailbox "will no longer accept domain name abuse
  // complaints" and points at https://zy.nameabuse.net/,
  // the same outsourced abuse platform as Wanshang's under
  // a per-registrar subdomain (ws = Wanshang, zy =
  // BrandFocus — the mapping lives in these lane entries,
  // one URL per registrar, never a shared hard-code); eNom
  // (a Tucows registrar) — the email is acknowledged, but
  // Compliance-team handling requires its form; and GoDaddy
  // — abuse@godaddy.com auto-replies that the mailbox "is
  // not monitored" and a report MUST go through its form
  // (which also names an API lane for bulk reporters).
  // Detection mirrors the two shipped lanes: the RDAP
  // registrar name, with the abuse contact's domain as the
  // secondary signal. None of the four forms had been
  // walked end-to-end yet, so no descriptionCap is claimed
  // for them — buildRegistrarShortEvidence's own 1,000-
  // character default governs their kits until a live
  // filing proves a real cap, and their panel guides are
  // marked provisional (see content.js). (v1.0.77:
  // GoDaddy's form HAS since been walked — see its URL
  // note below; the walk showed no description cap, so
  // the default still governs its kit, and only the other
  // three guides remain provisional.) Their
  // shortClosing is the headers-trimmed line: none of the
  // four forms is known to take a screenshot, so the July
  // Name screenshot closing must not be promised here.
  var NEWFOLD_FORM_URL = "https://newfold.com/abuse";
  var BRANDFOCUS_FORM_URL = "https://zy.nameabuse.net/";
  var ENOM_FORM_URL = "https://www.enom.com/help/AbusePolicy.aspx";
  // v1.0.77: GoDaddy's form has now been WALKED (Michael's
  // live walk, Nov 23 2026). The v1.0.74 lane landed on
  // abuseform.com — a category page (Phishing / Malware /
  // CSAM / IP / UK-EU / Public Safety) that makes the
  // reporter pick a door before seeing a single field.
  // The phishing report itself lives one step past it, on
  // GoDaddy's legal portal, and the lane now links
  // straight there; the lane entry below carries the
  // walked field guide (fieldsIntro + fields, the
  // hyperscaler kits' shape). The other three v1.0.74
  // desks stay provisional, as their comment above says.
  var GODADDY_FORM_URL =
    "https://legalportal.godaddy.com/abuse/phishing";
  var FORM_LANE_SHORT_CLOSING = "The full message headers " +
    "are trimmed from this text to keep it paste-ready; " +
    "the complete original message is retained by the " +
    "reporter.";
  function registrarFormLane(a) {
    var ri = a && a.registrarInfo;
    if (!ri) return null;
    var name = String(ri.registrar || "").toLowerCase();
    var abuse = String(ri.registrarAbuse || "").toLowerCase();
    if (name.indexOf("wanshang") !== -1 ||
        /(^|@|\.)kh86\.cn$/.test(abuse)) {
      return { label: "Wanshang", registrar: "Wanshang Technology",
        url: WANSHANG_FORM_URL, linkText: "ws.nameabuse.net",
        descriptionCap: 2000, kit: "wanshang",
        shortClosing: "The full message headers are trimmed " +
          "from this text to fit the form's description " +
          "limit; the complete original message is retained " +
          "by the reporter." };
    }
    if (name.indexOf("newfold") !== -1 ||
        name.indexOf("network solutions") !== -1 ||
        name.indexOf("web.com") !== -1 ||
        /(^|@|\.)newfold\.com$/.test(abuse) ||
        /(^|@|\.)web\.com$/.test(abuse)) {
      return { label: "Newfold", registrar: "Newfold Digital",
        url: NEWFOLD_FORM_URL, linkText: "newfold.com/abuse",
        kit: "newfold", shortClosing: FORM_LANE_SHORT_CLOSING };
    }
    if (name.indexOf("brandfocus") !== -1 ||
        /(^|@|\.)brandfocus\.cn$/.test(abuse)) {
      return { label: "BrandFocus", registrar: "BrandFocus",
        url: BRANDFOCUS_FORM_URL, linkText: "zy.nameabuse.net",
        kit: "brandfocus", shortClosing: FORM_LANE_SHORT_CLOSING };
    }
    if (name.indexOf("enom") !== -1 ||
        /(^|@|\.)enom\.com$/.test(abuse)) {
      return { label: "eNom", registrar: "eNom",
        url: ENOM_FORM_URL,
        linkText: "www.enom.com/help/AbusePolicy.aspx",
        kit: "enom", shortClosing: FORM_LANE_SHORT_CLOSING };
    }
    if (name.indexOf("godaddy") !== -1 ||
        /(^|@|\.)godaddy\.com$/.test(abuse)) {
      return { label: "GoDaddy", registrar: "GoDaddy",
        url: GODADDY_FORM_URL,
        linkText: "legalportal.godaddy.com/abuse/phishing",
        kit: "godaddy", shortClosing: FORM_LANE_SHORT_CLOSING,
        // v1.0.77: the walked per-field steps (Michael's
        // live walk of the real form, Nov 23 2026) — the
        // hyperscaler kits' fieldsIntro + fields shape,
        // rendered by content.js under the kit's button.
        // The form's boxes, in the form's own order; the
        // two the form requires carry its red asterisk's
        // weight in their help. Copy slices come from
        // buildFormFieldEvidence: "brand" is the From
        // display name (the same source reportfill's FTC
        // claimed-company fill uses), "urls" the message's
        // links one per line, "registrarDescription" the
        // kit's own short evidence.
        // v1.0.78: the kit's button now opens the form
        // through the auto-fill flow — reportfill.js fills
        // these boxes on the form page — so the intro says
        // so, and the email step explains where the filler
        // gets the address (the user's saved details) now
        // that "yours to fill in" is only half the story.
        // The steps stay verbatim as the by-hand fallback.
        fieldsIntro: "The form's boxes, in the form's " +
          "own order. Two are required \u2014 it marks " +
          "them with a red asterisk \u2014 and both carry " +
          "a prepared copy below. The button above opens " +
          "the form and Spam Avenger fills these boxes " +
          "in for you; these steps stay here as the " +
          "by-hand fallback. Your email address carries " +
          "no copy \u2014 if you saved your details for " +
          "the data-deletion letters, the filler uses " +
          "that address; otherwise it is yours to fill " +
          "in.",
        fields: [
          { box: "Your Email Address",
            help: "The address you report under \u2014 " +
              "it is where GoDaddy sends word about the " +
              "report. No copy to paste here: if you " +
              "saved your details for Spam Avenger's " +
              "data-deletion letters, the filler puts " +
              "that email in when the form opens; " +
              "otherwise the box is yours to fill in.",
            copy: null },
          { box: "Company or Brand Being Impersonated",
            help: "A required field. This copy is the " +
              "name the message claimed to be \u2014 the " +
              "sender's display name, which on an " +
              "impersonation spam is the impersonated " +
              "brand. If the message claimed no name, " +
              "this step does not appear and the box is " +
              "yours to fill from the message.",
            copy: "brand" },
          { box: "URL, Website, or Domain",
            help: "A required field \u2014 the form " +
              "takes one address per line, or several " +
              "separated with commas. This copy is the " +
              "message's links, one per line, " +
              "un-defanged exactly as they appeared; " +
              "the reported domain can ride on its own " +
              "line too.",
            copy: "urls" },
          { box: "Was this viewed from a mobile device?",
            help: "A checkbox about viewing the " +
              "phishing content itself. This report " +
              "comes from an email in your mailbox " +
              "\u2014 leave the box alone.",
            copy: null },
          { box: "What country did you view this " +
              "content from?",
            help: "A dropdown that starts at N/A. " +
              "Leave it there unless you want to name " +
              "the country you were in when the message " +
              "reached you.",
            copy: null },
          { box: "Description of Issue",
            help: "What happened, in the registrar " +
              "frame: the domain was registered through " +
              "GoDaddy, and the message it sent is the " +
              "evidence. This copy is the kit's report " +
              "text \u2014 the same text as the box " +
              "above: the domain, the sender, the " +
              "subject, the sending IP and the link.",
            copy: "registrarDescription" } ] };
    }
    if (name.indexOf("july name") === -1 &&
        !/(^|@|\.)julyname\.com$/.test(abuse)) {
      return null;
    }
    // descriptionCap is a PER-HOST parameter (Michael's
    // steer, Nov 8 2026): July Name's description field
    // rejects anything over 1,000 characters, so this
    // lane's kit evidence is the short form
    // (buildRegistrarShortEvidence reads the cap here).
    // The next deflector registrar that needs a kit sets
    // its own cap on its own lane entry — configuration,
    // not surgery.
    return { label: "July Name", registrar: "July Name Limited",
      url: JULYNAME_FORM_URL, linkText: "www.juyu.com/jubao_sy.htm",
      descriptionCap: 1000, kit: "julyname" };
  }

  // The registrar form kit's evidence block: the same
  // skeleton as buildHostingFormEvidence (a one-paragraph
  // summary, labeled facts, full headers) with
  // registrar-truthful wording — the report is about the
  // DOMAIN itself (registered through this registrar, then
  // put to fraud), not about the network the message was
  // sent from. Null when there is no registrar record.
  function buildRegistrarFormEvidence(a, opts) {
    opts = opts || {};
    var headerCap = opts.headerCap != null ? opts.headerCap : 8000;
    if (!a || !a.registrarInfo) return null;
    var ri = a.registrarInfo;
    var domain = registrableDomain(a.senderDomain || "") ||
      (senderEmail(a.from).match(/@([\w.-]+)/) || [])[1] || "unknown";
    var L = [];
    // The same AGE FRAMING as buildRegistrarComplaint
    // (Michael's 90-day line, Nov 8 2026 — see the note
    // there): young or undated domains keep the original
    // text byte-for-byte, suspend ask included; an old
    // domain is reported as a likely compromise or spoof
    // and the ask becomes investigate-and-notify.
    var fr = ri.registered
      ? (ri.freshness || domainFreshness(ri.registered, effectiveDate(a)))
      : null;
    var oldDomain = !!(fr && fr.daysBefore > 90);
    var intro;
    if (oldDomain) {
      intro = "I am reporting fraud sent using a domain " +
        "registered through you.";
      intro += " " + domain + " was registered on " +
        utcStamp(ri.registered) +
        " and the fraud message below arrived " +
        fr.daysBefore + " days later.";
      intro += " The domain is long-established, so this " +
        "points to a compromise or spoofing rather than a " +
        "throwaway registration; the headers below are the " +
        "evidence.";
      L.push(intro + " The message it sent is detailed " +
        "below. Please investigate, notify the registrant " +
        "that their domain is being used to send fraud, and " +
        "take appropriate action.");
    } else {
      intro = "I am reporting a domain registered through " +
        "you that exists to run fraud.";
      if (ri.registered) {
        intro += " " + domain + " was registered on " +
          utcStamp(ri.registered) + ".";
      }
      L.push(intro + " The message it sent is detailed below; " +
        "please investigate and suspend the domain.");
    }
    L.push("");
    L.push("Domain: " + domain);
    if (ri.registrar) L.push("Registrar: " + ri.registrar);
    if (ri.registered) {
      L.push("Registered: " + utcStamp(ri.registered));
    }
    L.push("From: " + (a.from || "unknown"));
    L.push("Subject: " + (a.subject || "unknown"));
    L.push("Date/time received (UTC): " + utcStamp(effectiveDate(a)));
    if (a.ip) L.push("Sending IP: " + a.ip);
    if (a.ingressReceived) L.push("Received: " + a.ingressReceived);
    if (a.urls && a.urls.length) {
      L.push("Links in message (defanged — read hxxps as https and [.] as .):");
      a.urls.slice(0, 10).forEach(function (u) { L.push("  - " + defangUrl(u)); });
    }
    L.push("");
    if (a.fullHeaders) {
      var th = trimHeaders(String(a.fullHeaders));
      var fh = th.text;
      var truncated = fh.length > headerCap;
      if (truncated) fh = fh.slice(0, headerCap);
      L.push("Full headers (plain text, as received):");
      fh.split("\n").forEach(function (ln) { L.push(ln); });
      if (th.stripped) L.push("[ARC/DKIM signature blocks omitted — routing and authentication headers are complete]");
      if (truncated) L.push("[headers truncated at " + headerCap + " characters]");
    } else if (a.ingressReceived) {
      L.push("Key headers as evidence:");
      L.push("  Message-ID: " + (a.messageId || "unknown"));
      L.push("  Received: " + a.ingressReceived);
    }
    return L.join("\n");
  }

  // The July Name kit's SHORT-FORM evidence (the rework
  // after Michael's live walk of the form, Nov 8 2026 —
  // a real report went through, case JY202611090000004):
  // the registrar's description field rejects anything
  // over its cap, so the full evidence above (headers
  // and all) can NEVER be pasted into it. For this lane
  // the panel shows, and the button copies, a description
  // built to fit the cap instead. The cap is the lane's
  // own per-host parameter (registrarFormLane's
  // descriptionCap; opts.cap overrides it) — July Name's
  // is 1,000 characters. Every other form kit keeps the
  // full evidence: their forms take it.
  //
  // Same facts, same AGE FRAMING as
  // buildRegistrarFormEvidence, compressed in the desk's
  // priority order: framing intro; Domain; Registrar;
  // Registered; From; Subject; Sending IP with the SPF
  // verdict when the message carries one; the primary
  // payload link in REAL https form — it goes to an
  // abuse desk, matching the submission the registrar
  // accepted, so unlike the email lanes it is NOT
  // defanged here; and a closing line sending the reader
  // to the attached screenshot for the full headers (the
  // form requires a screenshot, so that is where the
  // headers ride). The cap is guaranteed by
  // construction: an over-cap assembly sheds length
  // gracefully — the subject first, then the link
  // display — and is hard-sliced only as a last resort.
  // Null when there is no registrar record or the
  // registrar has no form lane.
  function buildRegistrarShortEvidence(a, opts) {
    opts = opts || {};
    if (!a || !a.registrarInfo) return null;
    var lane = registrarFormLane(a);
    if (!lane) return null;
    var cap = opts.cap != null ? opts.cap : lane.descriptionCap;
    if (cap == null) cap = 1000;
    var ri = a.registrarInfo;
    var domain = registrableDomain(a.senderDomain || "") ||
      (senderEmail(a.from).match(/@([\w.-]+)/) || [])[1] || "unknown";
    // The same AGE FRAMING as buildRegistrarFormEvidence
    // (Michael's 90-day line, Nov 8 2026): young keeps the
    // exists-to-run-fraud text and the suspension ask; an
    // old domain is reported as a likely compromise or
    // spoof and the ask becomes investigate-and-notify.
    var fr = ri.registered
      ? (ri.freshness || domainFreshness(ri.registered, effectiveDate(a)))
      : null;
    var oldDomain = !!(fr && fr.daysBefore > 90);
    var intro;
    if (oldDomain) {
      intro = "I am reporting fraud sent using a domain " +
        "registered through you.";
      intro += " " + domain + " was registered on " +
        utcStamp(ri.registered) +
        " and the fraud message below arrived " +
        fr.daysBefore + " days later.";
      intro += " The domain is long-established, so this " +
        "points to a compromise or spoofing rather than a " +
        "throwaway registration.";
      intro += " Please investigate, notify the registrant " +
        "that their domain is being used to send fraud, and " +
        "take appropriate action.";
    } else {
      intro = "I am reporting a domain registered through " +
        "you that exists to run fraud.";
      if (ri.registered) {
        intro += " " + domain + " was registered on " +
          utcStamp(ri.registered) + ".";
      }
      intro += " The message it sent is detailed below; " +
        "please investigate and suspend the domain.";
    }
    // v1.0.73: the closing line is the lane's own when it
    // carries one (Wanshang's form takes no screenshot —
    // its closing says where the headers live instead).
    // July Name's screenshot line stays the default.
    var closing = lane.shortClosing ||
      "The full message headers are in the " +
      "screenshot attached to this report.";
    var curSubject = a.subject ? String(a.subject) : "unknown";
    var curLink = primaryLink(a);
    function assemble() {
      var L = [intro, ""];
      L.push("Domain: " + domain);
      if (ri.registrar) L.push("Registrar: " + ri.registrar);
      if (ri.registered) {
        L.push("Registered: " + utcStamp(ri.registered));
      }
      L.push("From: " + (a.from || "unknown"));
      if (curSubject != null) L.push("Subject: " + curSubject);
      if (a.ip) {
        var ipLine = "Sending IP: " + a.ip;
        var spf = a.authResults && a.authResults.spf;
        if (spf) ipLine += " (SPF " + spf + ")";
        L.push(ipLine);
      }
      if (curLink) L.push("Link: " + curLink);
      L.push("");
      L.push(closing);
      return L.join("\n");
    }
    var out = assemble();
    if (out.length > cap && curSubject) {
      // The subject sheds length first: it gives up
      // exactly the overflow and keeps an ellipsis to
      // show the cut; it is dropped whole only when even
      // an ellipsized stub cannot fit.
      var over = out.length - cap;
      curSubject = curSubject.length > over + 1
        ? curSubject.slice(0, curSubject.length - over - 1) +
          "\u2026"
        : null;
      out = assemble();
    }
    if (out.length > cap && curLink) {
      // Then the link display: trimmed to fit, and in
      // the extreme down to the bare scheme + host.
      var over2 = out.length - cap;
      if (curLink.length > over2 + 1) {
        curLink = curLink.slice(0, curLink.length - over2 - 1) +
          "\u2026";
      } else {
        var hm = curLink.match(/^https?:\/\/[^/?#]+/i);
        curLink = hm ? hm[0] : null;
      }
      out = assemble();
    }
    if (out.length > cap) out = out.slice(0, cap);
    return out;
  }

  // ---- ICANN escalation (v1.0.73, queued-icann-
  // escalation.md) ----
  // The registrar lane records one report record per
  // (registrar, domain) in the panel's own store (content
  // writes them at recordLaunched). These pure functions
  // read that record set back: the escalation trigger, the
  // bulk-upload CSV in the format ICANN's compliance form
  // accepted from Michael by hand (case 01684242 and its
  // supplement: a `domain` header row, one domain per
  // line, nothing else — the bulk step rejects every other
  // shape), and the evidence file that rides with it.

  // The key a registrar's records collect under: its RDAP
  // name when the record carries one, else its abuse
  // contact. Lowercased; "" when neither exists (no key,
  // no records, no offer).
  function icannRegistrarKey(ri) {
    if (!ri) return "";
    return String(ri.registrar || ri.registrarAbuse || "")
      .toLowerCase().trim();
  }

  var ICANN_ESCALATION_MIN_DOMAINS = 3;
  var ICANN_ESCALATION_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  // The trigger: at least MIN_DOMAINS distinct domains
  // reported to this registrar, the oldest of them at
  // least MIN_AGE old (a registrar gets a reasonable
  // window to act before ICANN hears about it — RAA
  // §3.18's "reasonable and prompt steps" is the duty the
  // escalation cites). Returns null below the trigger,
  // else { count, domains (sorted), oldestTs }.
  function icannEscalationTrigger(records, key, now) {
    if (!key || !Array.isArray(records)) return null;
    var byDomain = {};
    records.forEach(function (r) {
      if (!r || r.registrar !== key || !r.domain) return;
      var ts = typeof r.ts === "number" ? r.ts : 0;
      if (!(r.domain in byDomain) || ts < byDomain[r.domain]) {
        byDomain[r.domain] = ts;
      }
    });
    var domains = Object.keys(byDomain).sort();
    if (domains.length < ICANN_ESCALATION_MIN_DOMAINS) {
      return null;
    }
    var oldest = Math.min.apply(null, domains.map(
      function (d) { return byDomain[d]; }));
    if (!oldest || (now - oldest) < ICANN_ESCALATION_MIN_AGE_MS) {
      return null;
    }
    return { count: domains.length, domains: domains,
      oldestTs: oldest };
  }

  // The bulk-upload CSV, exactly the accepted shape:
  // header row `domain`, one domain per line, no quotes,
  // no extra columns, no trailing commentary.
  function buildIcannDomainCsv(domains) {
    var rows = ["domain"];
    (domains || []).forEach(function (d) {
      var v = String(d || "").trim().toLowerCase();
      if (v) rows.push(v);
    });
    return rows.join("\n") + "\n";
  }

  // The evidence file: the escalation narrative (registrar,
  // the domain set, the window, the RAA §3.18 duty), then
  // the registrar complaint for the message on screen,
  // then the original sample (headers + body). `esc`
  // carries { registrar, registrarAbuse, domains, count,
  // oldestTs } as the panel assembled them (post-liveness:
  // only still-live domains ride).
  function buildIcannEvidence(a, esc) {
    if (!a || !esc) return null;
    var L = [];
    var regName = esc.registrar || esc.registrarAbuse ||
      "the registrar";
    L.push("ICANN Contractual Compliance \u2014 escalation " +
      "of registrar abuse reports");
    L.push("");
    L.push("Registrar: " + regName +
      (esc.registrarAbuse ? " (abuse contact: " +
        esc.registrarAbuse + ")" : ""));
    L.push("Domains reported to this registrar and not " +
      "actioned: " + esc.count + " (listed in the " +
      "accompanying CSV)");
    (esc.domains || []).forEach(function (d) {
      L.push("  - " + d);
    });
    if (esc.oldestTs) {
      L.push("Oldest report: " +
        new Date(esc.oldestTs).toISOString().slice(0, 10));
    }
    L.push("");
    L.push("Each domain above was reported to the " +
      "registrar's published abuse contact with full " +
      "evidence when the spam arrived. The reported sites " +
      "were still live when this escalation was prepared. " +
      "Under the 2013 Registrar Accreditation Agreement " +
      "\u00a73.18, a registrar must take reasonable and " +
      "prompt steps to investigate and respond to abuse " +
      "reports. This filing asks ICANN Contractual " +
      "Compliance to review the registrar's handling of " +
      "these reports.");
    L.push("");
    L.push("---- The registrar complaint for the domain " +
      "in the open message ----");
    L.push("");
    var rc = buildRegistrarComplaint(a);
    if (rc && rc.body) {
      L.push("To: " + rc.to);
      L.push("Subject: " + rc.subject);
      L.push("");
      L.push(rc.body);
    } else {
      L.push("Domain: " + (a.senderDomain || "unknown"));
      L.push("From: " + (a.from || "unknown"));
      L.push("Subject: " + (a.subject || "unknown"));
      L.push("Received: " + utcStamp(effectiveDate(a)));
      if (a.ip) L.push("Originating IP: " + a.ip);
    }
    L.push("");
    L.push("---- Original message sample ----");
    L.push("");
    if (a.fullHeaders) {
      var th = trimHeaders(String(a.fullHeaders));
      L.push(th.text);
      if (th.stripped) {
        L.push("[ARC/DKIM signature blocks omitted \u2014 " +
          "routing and authentication headers are complete]");
      }
    }
    if (a.bodyText) {
      L.push("");
      L.push("Message body (plain text, links defanged):");
      L.push(defangText(String(a.bodyText).slice(0, 4000)));
    }
    return L.join("\n");
  }

  // The panel-facing trace: fills a.websiteHost,
  // a.registrarInfo (with .freshness against the message
  // date), a.websiteComplaint and a.registrarComplaint on an
  // existing analysis, then resolves the analysis. NEVER
  // rejects — any failure leaves the new fields null and the
  // panel exactly as it was. Skips entirely (no fetches) for
  // a whitelisted mailbox provider's domain. A website that
  // resolves to the very IP and the very abuse desk the mail
  // lane already reports is suppressed: one desk, one
  // complaint — a duplicate lane would only invite a
  // duplicate send.
  // The mailbox providers' consumer From domains that the
  // host-shaped PROVIDER_WHITELIST doesn't literally contain
  // (it carries google.com, not gmail.com — it was built for
  // sending hosts). A From at one of these is a real account
  // at a big mailbox provider: the Report lane's advice
  // already covers it, and its website/registrar trace is
  // corporate noise.
  var MAILBOX_SENDER_DOMAINS = ["gmail.com", "msn.com"];

  function traceSenderDomain(a) {
    if (!a) return Promise.resolve(a);
    var domain = String(a.senderDomain || "").toLowerCase()
      .replace(/\.$/, "");
    if (!domain) {
      domain = (senderEmail(a.from).match(/@([\w.-]+)/) || [])[1] || "";
      domain = String(domain).toLowerCase();
    }
    if (!domain || domain.indexOf(".") === -1 || whitelisted(domain) ||
        MAILBOX_SENDER_DOMAINS.indexOf(domain) !== -1) {
      a.websiteHost = null;
      a.registrarInfo = null;
      a.websiteComplaint = null;
      a.registrarComplaint = null;
      a.senderMxDomains = null;
      return Promise.resolve(a);
    }
    var domainRg = registrableDomain(domain);
    return Promise.all([
      websiteHostFor(domain),
      fetchDomainRdap(domainRg),
      // Public 1.0.72 release (internal build .73): the From
      // domain's MX hosts ride the same trace — the
      // spoofed-From determination (fromDomainSpoofed below)
      // compares the sending server against them.
      mxHostDomains(domainRg)
    ]).then(function (rs) {
      var w = rs[0];
      if (w && a.ip && w.ip === a.ip && w.abuse && a.abuse &&
          String(w.abuse).toLowerCase() ===
            String(a.abuse).toLowerCase()) {
        w = null; // the mail lane already lands on this desk
      }
      a.websiteHost = w;
      var ri = parseDomainRdap(rs[1]);
      ri.freshness = ri.registered
        ? domainFreshness(ri.registered, effectiveDate(a)) : null;
      a.registrarInfo = ri;
      a.senderMxDomains = rs[2];
      a.websiteComplaint = buildHostingComplaint(a);
      a.registrarComplaint = buildRegistrarComplaint(a);
      return a;
    }).catch(function () {
      a.websiteHost = a.websiteHost || null;
      a.registrarInfo = a.registrarInfo || null;
      a.websiteComplaint = null;
      a.registrarComplaint = null;
      return a;
    });
  }

  // --- Public 1.0.72 release (internal build .73): never aim
  // the domain lanes at a spoofed From domain (Michael's
  // call, Nov 8 2026) ---
  // The website-host and registrar lanes trace the CLAIMED
  // sender domain. When that claim is forged, both complaints
  // accuse an uninvolved domain owner of running a fraud
  // operation — on the Nov 8 2026 sextortion specimen the
  // panel drafted a fraud-site complaint against the victim's
  // own domain and its real host, plus a registrar report
  // against the same domain. The spoofer never touched
  // either; he only forged the From line.
  //
  // The trigger is a COMPOSITE, and deliberately NOT the
  // details panel's "The From address is spoofed" note: that
  // note is the unconditional default for every non-Microsoft
  // message, so keying suppression to it would close the
  // domain lanes everywhere. Suppression fires only when ALL
  // THREE hold:
  //   (1) Provenance: the message did not come from the From
  //       domain's own mail infrastructure. When the domain
  //       publishes MX records, that test is decisive (the
  //       sending server's registrable domain matches none of
  //       the MX hosts' and is not the domain itself); with
  //       no MX data, the message itself must fail to
  //       authenticate as the domain — no passing DKIM and no
  //       passing SPF in the verdicts.
  //   (2) The website probe found a LIVE website on the
  //       REGISTRABLE domain of the From address (the
  //       panel's gate.senderSiteRg verdict === "live";
  //       gate.senderSite — the raw From HOST's verdict —
  //       is the fallback when no registrable verdict was
  //       taken) — independent legitimate existence. Parked
  //       does not count, and a domain with no live website
  //       (the throwaway campaign domain) never fires: its
  //       registrar lane is exactly the lane that must
  //       survive. The registrable scope is the Nov 8 2026
  //       evening fix: the lanes complain about the
  //       registrable domain (the registrar builder targets
  //       it, the MX leg reads it), so EVERY leg grades that
  //       same domain. The first build graded liveness on
  //       the raw From host, and a spoofed subdomain
  //       (support@verify.colorami.com — no website on the
  //       subdomain, a live one on colorami.com) escaped:
  //       the website lane died on the no-site gate and the
  //       registrar lane drafted a full complaint against
  //       the victim's own registrar anyway.
  //   (3) No extracted message link's domain equals the From
  //       domain — the domain is not itself the payload.
  // The panel calls this from runLaneGating (the only place
  // the site verdict exists) and, on a fire, nulls both
  // domain complaints and shows SPOOF_DOMAIN_EXPLANATION
  // where the lanes would have stood. The traced facts stay
  // on the analysis — facts are evidence.
  var SPOOF_DOMAIN_EXPLANATION = "The sender address is " +
    "spoofed, so the website and registrar of the domain in " +
    "the From line belong to somebody else \u2014 likely another " +
    "victim. No complaint was prepared against them.";
  function fromDomainSpoofed(a, gate) {
    if (!a || !a.senderDomain) return false;
    if (!gate) return false;
    // Leg (2): the liveness verdict for the REGISTRABLE
    // domain when the panel took one (senderSiteRg); the
    // From host's own verdict (senderSite) only when it
    // didn't (the two are the same verdict whenever the
    // From host IS the registrable domain).
    var siteVerdict = gate.senderSiteRg != null
      ? gate.senderSiteRg : gate.senderSite;
    if (siteVerdict !== "live") return false;
    var dom = String(a.senderDomain).toLowerCase()
      .replace(/\.$/, "");
    var domRg = registrableDomain(dom) || dom;
    // (3) A link at the From domain (or under it) makes the
    // domain the payload, not a bystander.
    var urls = a.urls || [];
    for (var i = 0; i < urls.length; i++) {
      var lh = hostOfUrl(urls[i]);
      if (!lh) continue;
      if (lh === dom ||
          lh.slice(-(dom.length + 1)) === "." + dom ||
          (registrableDomain(lh) || lh) === domRg) {
        return false;
      }
    }
    // (1) Provenance, MX form first when the data exists.
    var mx = a.senderMxDomains;
    if (mx && mx.length) {
      var srvRg = registrableDomain(a.sendingServer || "") ||
        registrableDomain(a.host || "");
      if (!srvRg || srvRg === domRg) return false;
      return mx.indexOf(srvRg) === -1;
    }
    var auth = a.authResults || {};
    return auth.spf !== "pass" && auth.dkim !== "pass";
  }

  // Public 1.0.72 release (internal build .73): the
  // evidence predicate behind the sextortion FTC
  // narrative's closing spoof sentence — was the From
  // address forged, on what the headers prove? BOTH legs
  // required: the sending server's registrable domain is
  // not the From domain's, AND DKIM did not pass aligned
  // for the From domain (a.dkimAligned, precomputed in
  // analyze from the signature domains). Deliberately
  // narrower than fromDomainSpoofed above: no website
  // gate, no MX detour — the sentence it feeds states
  // exactly these two facts and no more. No server on
  // record, the domain's own server, or an aligned DKIM
  // pass (a legitimate ESP sending for the domain): not
  // proven, no claim.
  function fromAddressSpoofed(a) {
    if (!a || !a.senderDomain) return false;
    var domRg = registrableDomain(a.senderDomain) ||
      String(a.senderDomain).toLowerCase();
    var srvRg = registrableDomain(a.sendingServer || "") ||
      registrableDomain(a.host || "");
    if (!srvRg || srvRg === domRg) return false;
    if (a.dkimAligned) return false;
    return true;
  }

  function whitelisted(host) {
    host = String(host || "").toLowerCase();
    return PROVIDER_WHITELIST.some(function (w) {
      return host === w || host.endsWith("." + w);
    });
  }

  // When mail genuinely came from a mailbox provider, the header trail
  // ends there — but the SENDER'S ACCOUNT can still be reported. Tailored
  // advice per provider; null means use the generic message.
  function providerAdvice(host) {
    host = String(host || "").toLowerCase();
    function has(d) { return host === d || host.endsWith("." + d); }
    if (has("google.com") || has("googlemail.com")) {
      return "Sent from a real Gmail account — the header trail ends here. " +
        "To kill it, report the account itself: in Gmail, open the three-dot " +
        "menu on this message and choose \u201CReport phishing\u201D.";
    }
    if (has("outlook.com") || has("hotmail.com") || has("live.com") ||
        has("msn.com") || has("protection.outlook.com")) {
      return "Sent from a real Microsoft account — the header trail ends here. " +
        "In Outlook, select the message and use Report \u2192 Report phishing " +
        "to flag the account.";
    }
    if (has("yahoo.com") || has("aol.com")) {
      return "Sent from a real Yahoo/AOL account — the header trail ends here. " +
        "Use your mail app's \u201CReport phishing\u201D option to flag the " +
        "sender's account.";
    }
    if (has("icloud.com") || has("me.com") || has("mac.com") || has("apple.com")) {
      return "Sent from a real iCloud account — the header trail ends here. " +
        "Forward it to reportphishing@apple.com to flag the account.";
    }
    return null;
  }

  // --- v1.0.67: Microsoft tenant-account detection (integrated
  // into the Report Abuse lane, Michael's correction Nov 2 2026:
  // NOT a separate lane) ---
  // When a phish is sent by a REAL Microsoft 365 tenant account,
  // the traced IP is a Microsoft outbound-protection pool address
  // shared by thousands of tenants. A host complaint to
  // abuse@microsoft.com reports Microsoft to Microsoft for running
  // Outlook and dies in that queue. The account itself is the
  // offender, and Microsoft's phishing desk
  // (phish@office365.microsoft.com) is the desk that can act on
  // the account. Detection requires BOTH: (1) the sending server
  // is the Outlook protection pool, and (2) SPF, DKIM and DMARC
  // all pass for the From domain — a real account, not a spoof.
  // When it fires, the EXISTING Report Abuse lane switches its
  // recipient and body (see buildComplaint's dispatch below);
  // there is no separate lane, section, or button.

  // Parse SPF/DKIM/DMARC verdicts out of Authentication-Results
  // and ARC-Authentication-Results. A mechanism is "pass" when
  // ANY auth block reports pass for it: the live first case
  // (Jessica Huber, Nov 2 2026) carries ARC results of
  // spf=pass / dkim=pass / dmarc=pass alongside a later
  // Authentication-Results block reading dkim=none / dmarc=none,
  // so requiring every block to agree would miss the real
  // account. Any other verdict is the first one seen.
  function parseAuthResults(headers) {
    var out = { spf: null, dkim: null, dmarc: null };
    if (!headers) return out;
    var blocks = getAll(headers, "authentication-results")
      .concat(getAll(headers, "arc-authentication-results"));
    var text = blocks.join("; ").toLowerCase();
    ["spf", "dkim", "dmarc"].forEach(function (mech) {
      var re = new RegExp(mech + "\\s*=\\s*([a-z]+)", "g");
      var m, first = null;
      while ((m = re.exec(text))) {
        if (first === null) first = m[1];
        if (m[1] === "pass") { out[mech] = "pass"; return; }
      }
      out[mech] = first;
    });
    return out;
  }

  function authAllPass(auth) {
    return !!(auth && auth.spf === "pass" &&
      auth.dkim === "pass" && auth.dmarc === "pass");
  }

  // Public 1.0.72 release (internal build .73): did DKIM
  // pass ALIGNED for the From domain — a dkim=pass whose
  // signature domain (header.d, or the @domain of
  // header.i) registrable-matches the From domain? The
  // verdict strings from parseAuthResults can't say this
  // (a dkim=pass for some OTHER domain proves nothing
  // about the From line), so the signature domains are
  // read here, with parseAuthResults' any-block philosophy
  // (a pass in ANY auth block counts — the Jessica Huber
  // lesson). The signature's properties run to the next
  // ";" in the block, so the scan is segment-bounded.
  function dkimAlignedPass(headers, fromDomain) {
    if (!headers || !fromDomain) return false;
    var domRg = registrableDomain(fromDomain);
    if (!domRg) return false;
    var blocks = getAll(headers, "authentication-results")
      .concat(getAll(headers, "arc-authentication-results"));
    var text = blocks.join("; ").toLowerCase();
    var re = /dkim\s*=\s*pass/g, m;
    while ((m = re.exec(text))) {
      var seg = text.slice(m.index);
      var semi = seg.indexOf(";");
      if (semi !== -1) seg = seg.slice(0, semi);
      var dm = /header\.d\s*=\s*([a-z0-9.-]+)/.exec(seg) ||
        /header\.i\s*=\s*@?([a-z0-9.-]+)/.exec(seg);
      if (dm && registrableDomain(dm[1]) === domRg) return true;
    }
    return false;
  }

  // True for the Outlook protection pool only:
  // protection.outlook.com itself or any subdomain of it
  // (mail-*.outbound.protection.outlook.com in the wild).
  // A bare outlook.com / prod.outlook.com internal hop is NOT
  // the outbound pool and does not fire this.
  function isMicrosoftProtectionHost(host) {
    var hst = String(host || "").trim().toLowerCase()
      .replace(/\.$/, "");
    if (!hst) return false;
    return hst === "protection.outlook.com" ||
      hst.endsWith(".protection.outlook.com");
  }

  // Hostnames named in Received headers, in header order.
  function receivedHosts(headers) {
    var out = [];
    getAll(headers, "received").forEach(function (v) {
      var m = String(v).match(/^\s*from\s+([A-Za-z0-9._-]+)/i);
      if (m && out.indexOf(m[1].toLowerCase()) === -1) {
        out.push(m[1].toLowerCase());
      }
    });
    return out;
  }

  // The sending server named in the Received hop that carried
  // the traced IP (falling back to the oldest Received hop).
  function sendingServerFor(headers, ip) {
    var recvd = getAll(headers, "received");
    function hostOf(v) {
      var m = String(v).match(/^\s*from\s+([A-Za-z0-9._-]+)/i);
      return m ? m[1] : null;
    }
    if (ip) {
      for (var i = recvd.length - 1; i >= 0; i--) {
        if (recvd[i].indexOf(ip) !== -1) return hostOf(recvd[i]);
      }
    }
    return recvd.length ? hostOf(recvd[recvd.length - 1]) : null;
  }

  function senderEmail(from) {
    var m = String(from || "").match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
    return m ? m[1] : "";
  }

  // v1.0.72: the address this message was sent TO — the To
  // header's first address, with Delivered-To as the fallback
  // (a Bcc'd or list message can carry no usable To). The
  // send-as hint (sendAsHintFor below) compares this against
  // the signed-in account's own address: a complaint carries
  // more weight, and routes its replies correctly, when it
  // leaves from the address the spam was addressed to.
  function recipientOf(headers) {
    var to = senderEmail(getFirst(headers, "to"));
    if (to) return to;
    return senderEmail(getFirst(headers, "delivered-to"));
  }

  // Where Microsoft tenant-account reports go (the phishing
  // desk). junk@office365.microsoft.com is the mere-spam sibling;
  // this addon reports phishing accounts, so the phish desk it is.
  var MS_PHISH_DESK = "phish@office365.microsoft.com";

  // The account report that REPLACES the host complaint inside
  // the Report Abuse lane for a real Microsoft tenant account.
  // Same {to, subject, body} shape as buildComplaint, same
  // header/body caps, same trimHeaders treatment. NOTE on
  // attachments: Microsoft's filters 550-block raw .eml
  // attachments (proven in the manual Nov 2 2026 send, which
  // had to ZIP the original), and the Gmail compose lane this
  // addon drives cannot attach a ZIP either — so the full
  // headers ride IN THE BODY, exactly as the normal complaint
  // already carries them. No .eml attachment is designed in.
  function buildMsAccountReport(a, opts) {
    opts = opts || {};
    var headerCap = opts.headerCap != null ? opts.headerCap : 8000;
    var bodyCap = opts.bodyCap != null ? opts.bodyCap : 4000;
    if (!a) return null;
    var account = senderEmail(a.from) || a.from || "unknown";
    var domain = (String(account).match(/@([\w.-]+)/) || [])[1] ||
      a.senderDomain || "unknown";
    var server = a.host || a.sendingServer || "unknown";
    var auth = a.authResults || {};
    function av(k) { return auth[k] ? String(auth[k]) : "unknown"; }
    var L = [];
    L.push("Hello Microsoft Phishing Team,");
    L.push("");
    L.push("I received a phishing / spam message sent by a real " +
      "Microsoft 365 account. I am reporting the account itself.");
    L.push("");
    L.push("  Sender account: " + account);
    L.push("  Subject:        " + (a.subject || "unknown"));
    L.push("  Date received:  " + (effectiveDate(a) || "unknown"));
    L.push("  Sending server: " + displayHost(server));
    L.push("  Source IP:      " + (a.ip || "unknown") +
      " (Microsoft's shared outbound protection pool — not the " +
      "sender's own server)");
    L.push("  Authentication: SPF " + av("spf") + ", DKIM " +
      av("dkim") + ", DMARC " + av("dmarc") +
      " for " + domain + " — this is a live tenant account, " +
      "not a spoofed address.");
    // v1.0.68: the no-website tell, as one body line — only
    // when investigate confirmed it (senderDomainNoWebsite is
    // set solely on a confirmed-empty DNS result).
    if (a.senderDomainNoWebsite) {
      L.push("  Website:        " + domain + " has no website " +
        "(no A or AAAA records for the domain or www." + domain +
        "). It exists only to send mail.");
    }
    if (a.urls && a.urls.length) {
      L.push("  Links in message (defanged so spam filters don't eat this report — read hxxps as https and [.] as .):");
      a.urls.slice(0, 10).forEach(function (u) { L.push("    - " + defangUrl(u)); });
    }
    L.push("");
    var prsM = priorReportSection(a.priorReports);
    if (prsM) { L.push(prsM); L.push(""); }
    L.push("The account itself is the offender. The sending IP is " +
      "Microsoft's shared outbound pool, used by thousands of " +
      "unrelated tenants, so action against the IP or a host " +
      "complaint to the IP's abuse contact cannot stop this " +
      "sender. Please investigate this account and take " +
      "appropriate action on the account.");
    L.push("");
    if (a.fullHeaders) {
      var th = trimHeaders(String(a.fullHeaders));
      var fh = th.text;
      var truncated = fh.length > headerCap;
      if (truncated) fh = fh.slice(0, headerCap);
      L.push("Full headers (plain text, as received):");
      fh.split("\n").forEach(function (ln) { L.push("  " + ln); });
      if (th.stripped) L.push("  [ARC/DKIM signature blocks omitted — routing and authentication headers are complete]");
      if (truncated) L.push("  [headers truncated at " + headerCap + " characters]");
      L.push("");
    } else {
      L.push("Key headers as evidence:");
      L.push("  Message-ID: " + (a.messageId || "unknown"));
      if (a.ingressReceived) L.push("  " + a.ingressReceived);
      L.push("");
    }
    if (a.bodyText && bodyCap > 0) {
      var bt = defangText(String(a.bodyText).slice(0, bodyCap));
      L.push("Message body (plain text, links defanged so spam filters don't eat this report — read hxxps as https and [.] as .):");
      bt.split("\n").forEach(function (ln) { L.push("  " + ln); });
      L.push("");
    }
    L.push("Thank you.");
    return {
      to: MS_PHISH_DESK,
      subject: "Phishing account report: " + account,
      body: L.join("\n")
    };
  }

  // v1.0.68: the details-panel note for the Microsoft
  // tenant-account case. The generic panel line ('The "From"
  // address is makeup. The IP is the face underneath.') is
  // BACKWARDS here: the From account is real and is itself the
  // offender, and the IP is just Microsoft's shared outbound
  // pool. Michael's live test of v1.0.67 caught the old line
  // sitting on the Huber message; this is the flipped line,
  // naming the account. It gains the no-website sentence only
  // when investigate confirmed it (a.senderDomainNoWebsite —
  // set solely on a confirmed-empty DNS result, never on an
  // error). Returns null when the case doesn't fire.
  function msDetailsNote(a) {
    if (!a || !(a.msAccountReport || isMsAccountCase(a))) return null;
    var account = senderEmail(a.from) || a.from || "The sender account";
    var note = "No makeup this time: " + account + " is the face. " +
      "The IP is just Microsoft's shared mail truck.";
    if (a.senderDomainNoWebsite) {
      var domain = (String(account).match(/@([\w.-]+)/) || [])[1] ||
        a.senderDomain || "";
      if (domain) {
        note += " " + domain + " doesn't even run a website. " +
          "It exists only to send mail.";
      }
    }
    return note;
  }

  // True when the analysis (headers + optionally the PTR host /
  // RDAP org gathered by investigate) is the Microsoft
  // tenant-account case: protection-pool sending server AND
  // SPF/DKIM/DMARC all passing.
  function isMsAccountCase(a) {
    if (!a || !authAllPass(a.authResults)) return false;
    if (a.msProtectionHost) return true;
    if (isMicrosoftProtectionHost(a.host)) return true;
    if (isMicrosoftProtectionHost(a.sendingServer)) return true;
    var hosts = a.receivedHosts || [];
    for (var i = 0; i < hosts.length; i++) {
      if (isMicrosoftProtectionHost(hosts[i])) return true;
    }
    return false;
  }

  // The abuse POC's identity (fn / email / handle) of the first
  // abuse-role entity in the record, nested or top-level — the
  // same traversal as extractAbuse. The POC is where an emailed
  // complaint actually lands, so when a provider parks one
  // dedicated cloud-abuse desk on a block, that identity says
  // "cloud" even when the net name and org don't (see below).
  function abusePoc(obj) {
    if (!obj || !obj.entities) return null;
    for (var i = 0; i < obj.entities.length; i++) {
      var ent = obj.entities[i];
      var roles = (ent.roles || []).map(function (r) {
        return String(r).toLowerCase();
      });
      if (roles.indexOf("abuse") !== -1) {
        return {
          fn: String(vcardFn(ent.vcardArray) || ""),
          email: String(vcardEmail(ent.vcardArray) || ""),
          handle: String(ent.handle || "")
        };
      }
      var nested = abusePoc(ent);
      if (nested) return nested;
    }
    return null;
  }

  // Hyperscaler CLOUD blocks: spam sent from a rented cloud VM
  // traces to the provider's giant network block (GOOGLE-CLOUD,
  // an Amazon allocation, MSFT ...). The RDAP abuse contact
  // exists, but those compliance desks are deflection-grade —
  // the providers' abuse FORMS are the lane that acts (the
  // OVHcloud lesson, one size up). Detection reads only the RDAP
  // identity already fetched (network name, registrant org, and
  // the abuse POC's identity) and demands a cloud-provider
  // identity, so big MAILBOX providers never trip it:
  // Gmail/Outlook sending is the skipComplaint path and stays
  // untouched.
  // Returns "google" | "aws" | "azure" | null.
  function hyperscalerOf(rdap) {
    if (!rdap) return null;
    var net = String(rdap.name || "").toUpperCase();
    var org = "";
    var ents = rdap.entities || [];
    for (var i = 0; i < ents.length; i++) {
      var roles = (ents[i].roles || []).map(function (r) {
        return String(r).toLowerCase();
      });
      if (roles.indexOf("registrant") !== -1) {
        org = String(vcardFn(ents[i].vcardArray) || "").toUpperCase();
        if (org) break;
      }
    }
    var poc = abusePoc(rdap) || { fn: "", email: "", handle: "" };
    var pocFn = poc.fn.toUpperCase();
    var pocEmail = poc.email.toLowerCase();
    var pocHandle = poc.handle.toUpperCase();
    // Google Cloud — net names like GOOGLE-CLOUD, a Google
    // Cloud org, OR the GC Abuse POC. The POC signal is load-
    // bearing: some Cloud allocations wear neither marker —
    // GOOGL-2 (NET-34-128-0-0-1) is plain "Google LLC" space by
    // name/org, but its abuse desk is the same GCABU-ARIN
    // "GC Abuse" <google-cloud-compliance@google.com> as
    // GOOGLE-CLOUD's, so the complaint lands on Cloud
    // Compliance either way. Plain GOOGLE / GOGL blocks do NOT
    // carry that POC (verified 2026-10-28 on 142.250.80.1 and
    // 8.8.8.8: ABUSE5250-ARIN "Abuse" <network-abuse@google
    // .com>), so generic Google addresses never fire this.
    if ((net.indexOf("GOOGLE") !== -1 && net.indexOf("CLOUD") !== -1) ||
        org.indexOf("GOOGLE CLOUD") !== -1 ||
        pocEmail === "google-cloud-compliance@google.com" ||
        pocHandle === "GCABU-ARIN" ||
        pocFn.indexOf("GC ABUSE") !== -1) return "google";
    // Amazon AWS — AMAZON / AMAZON-EC2-* net names, or an Amazon
    // registrant org (some AWS allocations carry handle-style
    // net names — the 52.0.0.0/10 block is "AT-88-Z" — so the
    // registrant org is the reliable marker there), OR the
    // AEA8-ARIN "Amazon EC2 Abuse" POC, which rides every AWS
    // allocation checked (AT-88-Z, AMAZON-S3; 2026-10-28).
    if (net.indexOf("AMAZON") !== -1 || /(^|[-_])AWS([-_]|$)/.test(net) ||
        org.indexOf("AMAZON") !== -1 ||
        pocFn.indexOf("AMAZON EC2") !== -1) return "aws";
    // Microsoft Azure — AZURE net names, or MICROSOFT / MSFT
    // net names registered to Microsoft Corporation. Deliber-
    // ately NOT keyed on the abuse POC: MAC74-ARIN "Microsoft
    // Abuse Contact" <abuse@microsoft.com> is Microsoft's
    // general abuse desk (mail included), not cloud-distinct.
    if (net.indexOf("AZURE") !== -1 ||
        (/(^|[-_])(MICROSOFT|MSFT)([-_]|$)/.test(net) &&
         org.indexOf("MICROSOFT") !== -1)) return "azure";
    return null;
  }

  function stripTags(html) {
    return String(html)
      .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, " $1 ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  // v1.0.65 test2 (Michael's live catch, 2026-10-30): phish kits
  // ship hrefs with multiplied slashes — the Safe Browsing lane
  // was handed "https://////w2.xiongmao-outdoor.com////////
  // g4herty////////s234r3wa1.html" verbatim and the mangled
  // string landed in the report form's URL field. A user cannot
  // be expected to clean slashes by hand, so collection
  // normalizes every URL: in the part before any ? or #, each
  // run of 2+ slashes collapses to one and the scheme separator
  // comes out as exactly "://". Query and fragment pass through
  // byte-for-byte (a "//" inside a query value can be data, not
  // sloppiness), an already-clean URL is unchanged, and a string
  // with no http(s) scheme is returned as-is. Runs here, inside
  // extractUrls(), so every downstream lane — Safe Browsing and
  // FTC stash/prefill, the URL picker, complaint text, form-kit
  // evidence — gets the clean form, and defangUrl() parses it
  // again (it silently no-ops on a slash-mangled URL).
  function normalizeUrl(u) {
    var s = String(u);
    var m = s.match(/^(https?:)\/+([\s\S]*)$/i);
    if (!m) return s;
    var rest = m[2];
    var cut = rest.length;
    var qi = rest.indexOf("?"), fi = rest.indexOf("#");
    if (qi !== -1 && qi < cut) cut = qi;
    if (fi !== -1 && fi < cut) cut = fi;
    return m[1] + "//" +
      rest.slice(0, cut).replace(/\/{2,}/g, "/") + rest.slice(cut);
  }

  function extractUrls(text) {
    var urls = [];
    var m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text))) {
      var u = m[0].replace(/[.,;!)\]}"'=]+$/, "");
      u = normalizeUrl(u);
      if (u && urls.indexOf(u) === -1 && urls.length < 20) urls.push(u);
    }
    return urls;
  }

  // v1.0.64 (Michael's live-test catch, 2026-10-28): an asset URL —
  // one whose path ends in an image/media/font/style extension —
  // is set dressing (a hotlinked logo, a tracking pixel), never the
  // phishing landing page. Both report lanes lead with urls[0]
  // (the FTC "Phishing URL:" line, the Safe Browsing URL field),
  // and on the Medicare Kit lure that slot went to a Wikimedia
  // logo (.svg.png) while the real phish page sat third.
  function isAssetUrl(u) {
    var p = String(u).split(/[?#]/)[0].toLowerCase();
    return /\.(png|jpe?g|gif|svg|webp|bmp|ico|tiff?|avif|mp4|mp3|woff2?|ttf|css)$/.test(p);
  }

  // Stable partition: page candidates first (original order),
  // asset URLs after (original order). Nothing is dropped — the
  // complaint body still quotes every link as evidence — only the
  // ORDER changes, so urls[0] is a page whenever the message has
  // one. If every link is an asset, the order is untouched.
  function leadWithPages(urls) {
    var pages = [], assets = [];
    urls.forEach(function (u) { (isAssetUrl(u) ? assets : pages).push(u); });
    return pages.concat(assets);
  }

  function redFlags(fromAddr, urls, text) {
    var flags = [];
    var dm = (String(fromAddr || "").match(/@([\w.-]+)/) || [])[1] || "";
    dm = dm.toLowerCase();
    var tld = dm.indexOf(".") !== -1 ? dm.split(".").pop() : "";
    if (SKETCHY_TLDS.indexOf(tld) !== -1) {
      flags.push("Sender uses a ." + tld + " domain — throwaway domains scammers burn through by the dozen.");
    }
    var urlHosts = {};
    urls.forEach(function (u) {
      var hm = u.match(/https?:\/\/([^/]+)/);
      if (hm) urlHosts[hm[1].toLowerCase().replace(/^www\./, "")] = 1;
    });
    urlHosts = Object.keys(urlHosts);
    if (dm && urlHosts.length && !urlHosts.some(function (h) {
      return dm.indexOf(h) !== -1 || h.indexOf(dm) !== -1;
    })) {
      flags.push("The links go somewhere completely different from the sender's domain — classic redirector trick.");
    }
    var low = String(text || "").toLowerCase();
    [["act now", "pressure tactic ('act now')"],
     ["limited time", "pressure tactic ('limited time')"],
     ["verify your account", "phishing phrase ('verify your account')"],
     ["suspended", "threat that your account is 'suspended'"],
     ["gift card", "gift-card mention — huge scam marker"],
     ["{{", "unfilled template placeholders like {{date}} — mass-sent phish kit"]
    ].forEach(function (pair) {
      if (low.indexOf(pair[0]) !== -1) flags.push("Contains " + pair[1] + ".");
    });
    return { flags: flags, senderDomain: dm, urlHosts: urlHosts };
  }

  // --- Public 1.0.72 release (internal build .73): sextortion
  // detection (Michael's call, Nov 8 2026) ---
  // A sextortion message is a ransom bluff: the sender claims
  // to have recorded the recipient through their webcam on an
  // adult site and demands crypto payment under a deadline.
  // It is not phishing (no impersonator, usually no lure
  // link), and Michael ruled it is not "fraud" for lane
  // purposes either — the FTC lane carries it, and the
  // classifier never reads this flag, so the APWG + CISA
  // forward stays hidden. Detection is deliberately
  // conservative: a crypto wallet PLUS at least one demand
  // marker, or at least THREE distinct extortion markers. A
  // single marker (a legitimate mail mentioning "webcam"
  // once) never flags.
  var SEXTORTION_WALLET_RES = [
    /\b0x[a-fA-F0-9]{40}\b/,              // Ethereum
    /\bbc1[a-z0-9]{25,60}\b/i,            // Bitcoin (bech32)
    /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/ // Bitcoin (legacy)
  ];
  var SEXTORTION_MARKERS = [
    /recorded you/,
    /webcam/,
    /embarrassing videos?/,
    /adult sites?/,
    /embedded malware/,
    /installed malware/,
    /access to your device/,
    /camera and microphone/,
    /send (it|the video|this) to (your|all) contacts/,
    /pay in bitcoin/,
    /buy bitcoin/,
    /within (24|48|72) hours/,
    /or i will (send|leak|publish|share)/
  ];
  function detectSextortion(text) {
    var raw = String(text || "");
    var wallet = null;
    for (var i = 0; i < SEXTORTION_WALLET_RES.length; i++) {
      var wm = raw.match(SEXTORTION_WALLET_RES[i]);
      if (wm) { wallet = wm[0]; break; }
    }
    var low = raw.toLowerCase();
    var hits = 0;
    SEXTORTION_MARKERS.forEach(function (re) {
      if (re.test(low)) hits++;
    });
    return {
      flagged: !!((wallet && hits >= 1) || hits >= 3),
      wallet: wallet
    };
  }

  // Defang a URL for safe transit inside an abuse complaint: hxxp(s)
  // scheme and bracketed dots in the host. A complaint that quotes live
  // phishing links scores as spam at the receiving desk's filter — the
  // report gets eaten (or the reporter listed) before a human sees it.
  // The path stays byte-for-byte intact so the desk loses nothing.
  function defangUrl(u) {
    var s = String(u || "");
    var m = s.match(/^(https?):\/\/([^/?#]+)([\s\S]*)$/i);
    if (!m) return s;
    var scheme = m[1].toLowerCase() === "https" ? "hxxps" : "hxxp";
    return scheme + "://" + m[2].replace(/\./g, "[.]") + m[3];
  }

  // Defang every URL inside a block of text (for quoted message bodies).
  function defangText(t) {
    return String(t || "").replace(/(https?):\/\/([A-Za-z0-9\-._~%!$&'()*+,;=]+)/gi,
      function (m, scheme, host) {
        return (scheme.toLowerCase() === "https" ? "hxxps" : "hxxp") +
          "://" + host.replace(/\./g, "[.]");
      });
  }

  // Cryptographic signature headers (Google's ARC seals, the sender's
  // DKIM) are kilobytes of base64 that say nothing an abuse desk can
  // act on — the desk needs the routing chain and the authentication
  // VERDICTS, which live in Received / Authentication-Results. Left
  // in, the signatures bloat a complaint until Gmail's compose link
  // refuses it outright (v1.0.57 field failure: Error 400 on
  // Open-in-Gmail). Strip the signature blocks, folded lines and all.
  var SIGNATURE_HEADERS = {
    "arc-seal": true, "arc-message-signature": true,
    "dkim-signature": true, "domainkey-signature": true
  };

  function trimHeaders(raw) {
    var lines = String(raw || "").split(/\r?\n/);
    var out = [];
    var dropping = false, stripped = false;
    lines.forEach(function (ln) {
      if (/^[ \t]/.test(ln)) {           // folded continuation line
        if (!dropping) out.push(ln);
        return;
      }
      var m = ln.match(/^([A-Za-z0-9-]+):/);
      if (m && SIGNATURE_HEADERS[m[1].toLowerCase()]) {
        dropping = true; stripped = true;
        return;
      }
      dropping = false;
      out.push(ln);
    });
    return { text: out.join("\n"), stripped: stripped };
  }

  // Some sending IPs carry placeholder reverse DNS — the classic being
  // "undefined.hostname.localhost", seen live on the Anthem EFT phish
  // (103.244.33.253, Oct 20 2026). Printing the junk verbatim makes the
  // complaint itself look broken to the abuse desk reading it, so
  // placeholders collapse to a plain statement that there is no real
  // record. Display-only: a.host keeps the raw PTR value because the
  // whitelist / provider logic upstream keys off it.
  function displayHost(host) {
    var raw = String(host || "").trim().replace(/\.$/, "");
    var h = raw.toLowerCase();
    if (!h || h === "unknown" || h === "localhost" ||
        h.endsWith(".localhost") || h.indexOf("undefined") === 0) {
      return "no valid reverse DNS record";
    }
    return raw;
  }

  // fitForCompose fits the MAIL complaint, whose desk account
  // comes from the analysis. The website and registrar lanes
  // carry their own {to, subject, body}, so they need the same
  // length logic against an arbitrary complaint: direct when
  // the compose URL fits the budget, else paste mode (the URL
  // carries only the paste note; the caller copies the full
  // text). plan.complaint keeps the FULL complaint in both
  // modes — the caller renders the textarea from it and the
  // user reads exactly what will be sent.
  function fitGivenComplaint(acct, complaint) {
    if (!complaint || !complaint.to) return null;
    var full = composeUrl(acct, complaint);
    if (full.length <= COMPOSE_URL_BUDGET) {
      return { mode: "direct", complaint: complaint, url: full };
    }
    return {
      mode: "paste",
      complaint: complaint,
      url: composeUrl(acct, complaint, PASTE_NOTE)
    };
  }

  function buildComplaint(a, opts) {
    opts = opts || {};
    var headerCap = opts.headerCap != null ? opts.headerCap : 8000;
    var bodyCap = opts.bodyCap != null ? opts.bodyCap : 4000;
    // v1.0.67: the Microsoft tenant-account case switches THIS
    // lane's target and body — same Report Abuse lane, same
    // review-first compose flow, no separate lane. It fires
    // before the skipComplaint / abuse-contact guards because
    // the whole point is that there is no usable host complaint
    // for a shared-pool IP: the report goes to Microsoft's
    // phishing desk about the account instead. A traced IP is
    // still required — no origin, no account report.
    if (a && a.ip && (a.msAccountReport || isMsAccountCase(a))) {
      return buildMsAccountReport(a, opts);
    }
    if (a.skipComplaint || !a.ip || !a.abuse) return null;
    var L = [];
    L.push("Hello Abuse Team,");
    L.push("");
    L.push("I received spam originating from your network:");
    L.push("");
    L.push("  Source IP:      " + a.ip);
    L.push("  Server name:    " + displayHost(a.host));
    L.push("  Claimed sender: " + (a.from || "unknown"));
    L.push("  Subject:        " + (a.subject || "unknown"));
    L.push("  Date received:  " + (effectiveDate(a) || "unknown"));
    if (a.urls && a.urls.length) {
      L.push("  Links in message (defanged so spam filters don't eat this complaint — read hxxps as https and [.] as .):");
      a.urls.slice(0, 10).forEach(function (u) { L.push("    - " + defangUrl(u)); });
    }
    L.push("");
    var prsC = priorReportSection(a.priorReports);
    if (prsC) { L.push(prsC); L.push(""); }
    if (a.fullHeaders) {
      // Desks (AWS Trust & Safety explicitly) bounce complaints that
      // offer headers "on request" — attach the full block: it is
      // evidence. Two trims keep it shippable: signature blocks are
      // stripped (trimHeaders, above), and the result is capped so a
      // pathological header block can't bloat the complaint past
      // usability.
      var th = trimHeaders(String(a.fullHeaders));
      var fh = th.text;
      var truncated = fh.length > headerCap;
      if (truncated) fh = fh.slice(0, headerCap);
      L.push("Full headers (plain text, as received):");
      fh.split("\n").forEach(function (ln) { L.push("  " + ln); });
      if (th.stripped) L.push("  [ARC/DKIM signature blocks omitted — routing and authentication headers are complete]");
      if (truncated) L.push("  [headers truncated at " + headerCap + " characters]");
      L.push("");
    } else {
      L.push("Key headers as evidence:");
      L.push("  Message-ID: " + (a.messageId || "unknown"));
      if (a.ingressReceived) L.push("  " + a.ingressReceived);
      L.push("");
    }
    if (a.bodyText && bodyCap > 0) {
      var bt = defangText(String(a.bodyText).slice(0, bodyCap));
      L.push("Message body (plain text, links defanged so spam filters don't eat this complaint — read hxxps as https and [.] as .):");
      bt.split("\n").forEach(function (ln) { L.push("  " + ln); });
      L.push("");
    }
    L.push("Please investigate the account or customer responsible and take appropriate action. Thank you.");
    return {
      to: a.abuse,
      subject: "Network abuse complaint — spam from " + a.ip,
      body: L.join("\n")
    };
  }

  // Render a header date as a UTC stamp for the form-evidence
  // block ("Wed, 28 Oct 2026 09:27:25 UTC"). Unparseable input
  // passes through raw — a form reviewer can still read it.
  function utcStamp(s) {
    var raw = String(s || "").trim();
    if (!raw) return "unknown";
    var d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toUTCString().replace("GMT", "UTC");
    return raw;
  }

  // Form-kit evidence (v1.0.64): some hosts act ONLY on reports
  // filed through their own abuse form — the hyperscaler clouds
  // (a.hyperscaler) and OVHcloud. An emailed complaint to those
  // desks is deflected to the form anyway, so for those panels
  // buildComplaint's email is never shown; instead the user
  // gets ONE paste-ready evidence block for the form's
  // details/description field: a summary paragraph, the labeled
  // facts the forms ask for, and the full headers with the same
  // trimHeaders treatment the emailed complaint gets (signature
  // blocks stripped, capped), so the paste stays shippable.
  // Returns the block text, or null when there is no traced IP
  // to report.
  //
  // v1.0.69: opts.mirrorComplaint (the Azure/MSRC kit) adds the
  // two labeled facts the emailed complaint carries that the
  // standard block omits — the server name and the defanged
  // links (same slice cap of 10, same defangUrl) — so the block
  // mirrors the complaint's evidence. The headers treatment is
  // unchanged (trimHeaders, same 8000 cap). Default off: the
  // other form kits' blocks stay byte-identical to before.
  // v1.0.70: the block's paste target is the MSRC form's
  // Additional information box (15,000-character cap), reached
  // as the azure kit's "additionalInfo" field slice.
  function buildFormEvidence(a, opts) {
    opts = opts || {};
    var headerCap = opts.headerCap != null ? opts.headerCap : 8000;
    if (!a || !a.ip) return null;
    var L = [];
    L.push("I received a spam/phishing message originating from " +
      "your network. It was sent from IP address " + a.ip +
      (a.org ? " (registered to " + a.org + ")" : "") +
      " and received on " + utcStamp(effectiveDate(a)) + ". " +
      "Please investigate the account or customer responsible " +
      "and take appropriate action. The message details and " +
      "full headers follow as evidence.");
    L.push("");
    L.push("Source IP: " + a.ip);
    if (opts.mirrorComplaint) L.push("Server: " + displayHost(a.host));
    L.push("Date/time (UTC): " + utcStamp(effectiveDate(a)));
    L.push("From: " + (a.from || "unknown"));
    L.push("Subject: " + (a.subject || "unknown"));
    if (a.ingressReceived) L.push("Received: " + a.ingressReceived);
    if (opts.mirrorComplaint && a.urls && a.urls.length) {
      L.push("Links in message (defanged \u2014 read hxxps as https and [.] as .):");
      a.urls.slice(0, 10).forEach(function (u) { L.push("  - " + defangUrl(u)); });
    }
    L.push("");
    if (a.fullHeaders) {
      var th = trimHeaders(String(a.fullHeaders));
      var fh = th.text;
      var truncated = fh.length > headerCap;
      if (truncated) fh = fh.slice(0, headerCap);
      L.push("Full headers (plain text, as received):");
      fh.split("\n").forEach(function (ln) { L.push(ln); });
      if (th.stripped) L.push("[ARC/DKIM signature blocks omitted — routing and authentication headers are complete]");
      if (truncated) L.push("[headers truncated at " + headerCap + " characters]");
    } else if (a.ingressReceived) {
      L.push("Key headers as evidence:");
      L.push("  Message-ID: " + (a.messageId || "unknown"));
      L.push("  Received: " + a.ingressReceived);
    }
    return L.join("\n");
  }

  // Per-field form evidence (v1.0.69, combined build): the
  // Google Cloud / AWS / OVHcloud abuse forms do NOT share one
  // shape — each splits the report across its own boxes
  // (verified against the live forms and the providers' own
  // reporting docs, 2026-11-02). One paste block fits none
  // of them: Google caps its "Abuse details" box at 1,000
  // characters and takes the headers as an uploaded log file
  // instead; AWS asks for the incident as log-style lines
  // (source IP, ISO date/time, time zone) plus log extracts;
  // OVHcloud asks for a location (IP or URL), a description it
  // forwards to the service owner, and logs/technical elements
  // separately. v1.0.70: the MSRC form joins them — Michael
  // filed it by hand and screenshotted both of its steps
  // (2026-11-02): a Contact Information step whose Additional
  // information box caps at 15,000 characters (the v1.0.69
  // mirror-complaint block fits it, and stays as that box's
  // paste), then a Report Details step with Incident date /
  // time / Time zone pickers, a Source IP box of its own, and
  // a Report notes box capped at 2,000 characters. So the
  // panel's form kits declare their
  // form's fields (content.js HYPER_FORM_HINTS `fields`) and
  // each field's Copy button carries the slice built here,
  // keyed by the field's `copy` name:
  //   "ip"            the bare source IP (a location/IP box)
  //   "date"          the message day, ISO YYYY-MM-DD (a date box)
  //   "urls"          the message's URLs, one per line, RAW —
  //                   a dedicated URL box is where the desk
  //                   needs the literal addresses (same call as
  //                   the Safe Browsing lane's URL box), cap 10
  //   "googleDetails" the facts sized for Google's 1,000-char
  //                   details box: summary, IP, From/Subject,
  //                   defanged links that fit; headers are NOT
  //                   here — they ride the logs upload instead
  //   "awsIncident"   AWS's incident lines: type, ISO 8601
  //                   date/time, time zone (UTC), source IP,
  //                   claimed sender, subject
  //   "logs"          the log slice: the ingress Received line
  //                   plus the full headers (trimHeaders, the
  //                   usual 8000 cap) — an email's log extract
  //   "description"   a facts-only narrative for OVHcloud's
  //                   description box: what arrived, from
  //                   where, when, the defanged links, a body
  //                   excerpt; no headers (the logs field
  //                   carries them) and no reporter identity —
  //                   OVHcloud transfers the description to the
  //                   service owner, so it is facts only
  //   "incidentStamp" (v1.0.70) the message's received moment
  //                   presented for the MSRC form's Incident
  //                   date / time / Time zone pickers: the day
  //                   and the HH:MM in UTC, plus the compact
  //                   full stamp; null when the date won't
  //                   parse (the panel skips the step)
  //   "additionalInfo" (v1.0.70) the MSRC form's Additional
  //                   information box (Contact Information
  //                   step, 15,000-character cap): the full
  //                   details block — buildFormEvidence with
  //                   opts.mirrorComplaint, the v1.0.69 block,
  //                   kept and retargeted at the box it
  //                   actually fits (Michael pasted it there
  //                   by hand: ~9,200 of 15,000 used)
  //   "msrcNotes"     (v1.0.70) the MSRC form's Report notes
  //                   text (Report Details step), built to a
  //                   HARD 2,000-character cap (the box's own
  //                   limit): the narrative (an Azure-rented
  //                   computer, the account/customer ask),
  //                   From, Subject, source IP, server, date,
  //                   the defanged links (cap 10), and the
  //                   ingress Received line. NO full headers
  //                   — they live in the Additional
  //                   information paste. No reporter identity.
  // Returns the slice text, or null when the slice cannot be
  // built (no traced IP, no URLs for "urls", no headers or
  // Received line for "logs", an unparseable date for "date"
  // or "incidentStamp") — the panel skips a step whose slice
  // is null. Reporter-identity fields are never built here at
  // all: name/email boxes on these forms are the user's own
  // to fill in.
  function isoDayStamp(s) {
    var d = new Date(String(s || "").trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  function isoFullStamp(s) {
    var d = new Date(String(s || "").trim());
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  function buildFormFieldEvidence(a, key) {
    if (!a) return null;
    // v1.0.77: two slices that do NOT depend on a traced
    // sending IP, served ahead of the ip guard below —
    // both feed GoDaddy's walked phishing form (see the
    // lane entry in registrarFormLane).
    if (key === "brand") {
      // Who the message CLAIMS to be: the From display
      // name, which on an impersonation spam is the
      // impersonated company. The same derivation as
      // reportfill's FTC claimed-company fill: a
      // bare-address From names nobody and yields null,
      // so the form step is skipped and the box stays
      // the reporter's to fill.
      var bfm = String(a.from || "")
        .match(/^\s*"?([^"<@]+?)"?\s*<[^>]+>\s*$/);
      if (!bfm) return null;
      var bname = bfm[1].replace(/\s+/g, " ").trim();
      if (bname.length < 2 || bname.length > 60) return null;
      return bname;
    }
    if (key === "registrarDescription") {
      // The registrar kit's own standard complaint text
      // (the short evidence the kit's box carries) —
      // GoDaddy's Description of Issue field takes the
      // report in the registrar frame, not the
      // sender-IP frame of the "description" slice.
      return buildRegistrarShortEvidence(a);
    }
    if (!a.ip) return null;
    if (key === "ip") return a.ip;
    if (key === "date") return isoDayStamp(effectiveDate(a));
    if (key === "urls") {
      if (!a.urls || !a.urls.length) return null;
      return a.urls.slice(0, 10).join("\n");
    }
    if (key === "googleDetails") {
      var gd = [];
      gd.push("Spam/phishing email received from IP address " + a.ip +
        (a.org ? " (registered to " + a.org + ")" : "") +
        " on " + utcStamp(effectiveDate(a)) + ".");
      gd.push("Source IP: " + a.ip);
      gd.push("From: " + (a.from || "unknown"));
      gd.push("Subject: " + (a.subject || "unknown"));
      if (a.urls && a.urls.length) {
        gd.push("Links in the message (defanged \u2014 read hxxps " +
          "as https and [.] as .):");
        for (var gi = 0; gi < a.urls.length && gi < 10; gi++) {
          var line = "  - " + defangUrl(a.urls[gi]);
          if (gd.join("\n").length + line.length + 1 > 1000) break;
          gd.push(line);
        }
      }
      if (a.fullHeaders) {
        var note = "Full message headers are in the logs file " +
          "attached to this report (Additional logs).";
        if (gd.join("\n").length + note.length + 1 <= 1000) gd.push(note);
      }
      var gout = gd.join("\n");
      return gout.length > 1000 ? gout.slice(0, 1000) : gout;
    }
    if (key === "awsIncident") {
      var aw = [];
      aw.push("Type of abuse: Spam / phishing email");
      aw.push("Date/time of incident (ISO 8601): " +
        (isoFullStamp(effectiveDate(a)) || utcStamp(effectiveDate(a))));
      aw.push("Time zone: UTC");
      aw.push("Source IP address: " + a.ip);
      aw.push("Claimed sender: " + (a.from || "unknown"));
      aw.push("Subject: " + (a.subject || "unknown"));
      return aw.join("\n");
    }
    if (key === "logs") {
      if (!a.fullHeaders && !a.ingressReceived) return null;
      var lg = [];
      if (a.ingressReceived) lg.push("Received: " + a.ingressReceived);
      if (a.fullHeaders) {
        var lth = trimHeaders(String(a.fullHeaders));
        var lfh = lth.text;
        var ltrunc = lfh.length > 8000;
        if (ltrunc) lfh = lfh.slice(0, 8000);
        if (lg.length) lg.push("");
        lg.push("Full headers (plain text, as received):");
        lfh.split("\n").forEach(function (ln) { lg.push(ln); });
        if (lth.stripped) lg.push("[ARC/DKIM signature blocks omitted \u2014 routing and authentication headers are complete]");
        if (ltrunc) lg.push("[headers truncated at 8000 characters]");
      } else {
        lg.push("Message-ID: " + (a.messageId || "unknown"));
      }
      return lg.join("\n");
    }
    if (key === "description") {
      var de = [];
      de.push("I received a spam/phishing message originating from " +
        "your network. It was sent from IP address " + a.ip +
        (a.org ? " (registered to " + a.org + ")" : "") +
        " and received on " + utcStamp(effectiveDate(a)) + ". " +
        "Please investigate the account or customer responsible " +
        "and take appropriate action. The message details follow " +
        "as evidence.");
      de.push("");
      de.push("Source IP: " + a.ip);
      de.push("Server: " + displayHost(a.host));
      de.push("Date/time (UTC): " + utcStamp(effectiveDate(a)));
      de.push("From: " + (a.from || "unknown"));
      de.push("Subject: " + (a.subject || "unknown"));
      if (a.ingressReceived) de.push("Received: " + a.ingressReceived);
      if (a.urls && a.urls.length) {
        de.push("Links in message (defanged \u2014 read hxxps as " +
          "https and [.] as .):");
        a.urls.slice(0, 10).forEach(function (u) {
          de.push("  - " + defangUrl(u));
        });
      }
      var dout = de.join("\n");
      if (a.bodyText) {
        var btHead = "\n\nMessage body (plain text, links defanged):\n";
        var room = 4000 - dout.length - btHead.length - 40;
        if (room > 0) {
          var dbt = defangText(String(a.bodyText));
          var cut = dbt.length > room;
          dout += btHead + dbt.slice(0, room) +
            (cut ? "\n[body excerpt truncated]" : "");
        }
      }
      if (dout.length > 4000) {
        dout = dout.slice(0, 4000 - 40) + "\n[description truncated]";
      }
      return dout;
    }
    if (key === "incidentStamp") {
      var isd = new Date(effectiveDate(a));
      if (isNaN(isd.getTime())) return null;
      var iIso = isd.toISOString();
      return "Date: " + iIso.slice(0, 10) + " \u00B7 Time: " +
        iIso.slice(11, 16) + " UTC\n" +
        "Full stamp (UTC): " +
        iIso.slice(0, 19).replace("T", " ") + " UTC \u2014 in " +
        "the form\u2019s Time zone box, pick UTC/GMT if offered.";
    }
    if (key === "additionalInfo") {
      // The full details block (the v1.0.69 mirror block),
      // retargeted: the MSRC form's Additional information
      // box caps at 15,000 characters and the block fits it
      // (its headers are already capped at 8,000 by
      // buildFormEvidence). Null propagates: no traced IP,
      // no block, step skipped.
      return buildFormEvidence(a, { mirrorComplaint: true });
    }
    if (key === "msrcNotes") {
      // HARD cap: the MSRC Report notes box stops at 2,000
      // characters (live counter on the form, 2026-11-02).
      // The SHORT slice: narrative + facts + defanged links
      // + the ingress Received line. NO full headers — they
      // live in the Additional information paste above. If a
      // pathological From/Subject/links set still overflows,
      // link lines drop from the end before anything else
      // gives; the final slice is the belt-and-braces guard.
      var NOTE_CAP = 2000;
      var mn = [];
      mn.push("Spam/phishing email sent from a computer rented " +
        "on Microsoft Azure. It was sent from IP address " +
        a.ip + (a.org ? " (registered to " + a.org + ")" : "") +
        " and received on " + utcStamp(effectiveDate(a)) + ". " +
        "Please investigate the account or customer " +
        "responsible and take appropriate action. Full " +
        "headers are in the Additional information field of " +
        "this report.");
      mn.push("");
      mn.push("From: " + (a.from || "unknown"));
      mn.push("Subject: " + (a.subject || "unknown"));
      mn.push("Source IP: " + a.ip);
      mn.push("Server: " + displayHost(a.host));
      mn.push("Date/time (UTC): " + utcStamp(effectiveDate(a)));
      if (a.ingressReceived) mn.push("Received: " + a.ingressReceived);
      if (a.urls && a.urls.length) {
        mn.push("Links in message (defanged \u2014 read hxxps " +
          "as https and [.] as .):");
        var mLinks = a.urls.slice(0, 10).map(function (u) {
          return "  - " + defangUrl(u);
        });
        while (mLinks.length &&
          mn.join("\n").length + 1 +
            mLinks.join("\n").length > NOTE_CAP) {
          mLinks.pop();
        }
        mLinks.forEach(function (l) { mn.push(l); });
      }
      var mout = mn.join("\n");
      return mout.length > NOTE_CAP ? mout.slice(0, NOTE_CAP) : mout;
    }
    if (key === "headersBody") {
      // v1.0.73 (queued-guided-form-fields.md): the AWS
      // form's "Complete email header and body" box on the
      // LINK-host report — the whole message in one paste:
      // headers first (trimmed the way the logs slice trims
      // them), then the defanged body. Either half alone
      // still builds the slice; neither means no step.
      if (!a.fullHeaders && !a.bodyText) return null;
      var hb = [];
      if (a.fullHeaders) {
        var hth = trimHeaders(String(a.fullHeaders));
        var hfh = hth.text;
        var htrunc = hfh.length > 8000;
        if (htrunc) hfh = hfh.slice(0, 8000);
        hb.push("Full headers (plain text, as received):");
        hfh.split("\n").forEach(function (ln) { hb.push(ln); });
        if (hth.stripped) hb.push("[ARC/DKIM signature blocks " +
          "omitted \u2014 routing and authentication headers " +
          "are complete]");
        if (htrunc) hb.push("[headers truncated at 8000 characters]");
      }
      if (a.bodyText) {
        if (hb.length) hb.push("");
        hb.push("Message body (plain text, links defanged):");
        hb.push(defangText(String(a.bodyText).slice(0, 2500)));
        if (String(a.bodyText).length > 2500) {
          hb.push("[body excerpt truncated]");
        }
      }
      return hb.join("\n");
    }
    if (key === "linkComment") {
      // v1.0.73 (queued-guided-form-fields.md): the Comments
      // box on the LINK-host report — the hosting frame
      // stated plainly: the site is HOSTED by the provider
      // being written to and was ADVERTISED in the spam; the
      // sender is a separate matter with its own lane.
      // Facts from the traced link host; no headers here —
      // they have their own field (headersBody, above).
      var lhx = a.linkHost || {};
      var lc = [];
      lc.push("I am reporting a website hosted by " +
        (lhx.host || lhx.org || "this provider") +
        " that was advertised in an unsolicited bulk email " +
        "(spam) I received. The site is the destination the " +
        "spam directs its recipients to; I am asking you to " +
        "review the hosting of that site. The message's " +
        "sender is reported separately, through the " +
        "sender-IP report on the same form.");
      lc.push("");
      if (lhx.url) lc.push("Advertised page: " + lhx.url);
      if (lhx.domain) lc.push("Advertised domain: " + lhx.domain);
      if (lhx.ip) lc.push("Website IP: " + lhx.ip);
      lc.push("Spam received: " + utcStamp(effectiveDate(a)));
      lc.push("From: " + (a.from || "unknown"));
      lc.push("Subject: " + (a.subject || "unknown"));
      if (a.ip) lc.push("Originating IP: " + a.ip);
      lc.push("");
      lc.push("The complete email header and body are in " +
        "the field above this one on the form.");
      var lcout = lc.join("\n");
      return lcout.length > 10000 ? lcout.slice(0, 10000) : lcout;
    }
    return null;
  }

  // Gmail's compose-by-link (?view=cm) rejects very long URLs with a
  // bare "Error 400" — no explanation, dead end (v1.0.57 field
  // failure). Keep every compose URL under a conservative budget by
  // shrinking the complaint in steps (body excerpt first, headers
  // last — the links section is never cut), and if even the smallest
  // useful complaint won't fit, fall back to paste mode: the caller
  // copies the FULL complaint to the clipboard and opens a compose
  // carrying only To/Subject plus a short "press Ctrl+V" note. The
  // panel's complaint text (and its Copy button) always carries the
  // unshrunk complaint.
  //
  // v1.0.59: the budget itself was wrong, not just optimistic.
  // v1.0.58 budgeted 10,000 chars and STILL field-failed with a
  // 400 (Oct 20, 2026, iCloud phish from 82.152.197.57): the
  // ladder landed that complaint at an 8,997-char URL — inside
  // the budget, dead anyway. Probed against mail.google.com the
  // same day with content-free URLs: an absolute URL of 8,200
  // chars is accepted (302 to login), 8,201 chars gets the 400 —
  // a hard length cliff at Gmail's edge, nothing to do with the
  // complaint's content (the real 8,997-char URL and a synthetic
  // one of the same length both 400; an 8,200-char one doesn't).
  // Budget is now 8,000: under the measured cliff, with a small
  // margin for URL-shape variance (account index, delegated
  // paths) the probe didn't exercise.
  var COMPOSE_URL_BUDGET = 8000;

  // v1.0.72: the paste stub's instructions are REPLACE, not
  // append (queued-registrar-paste-mode.md item 3, Michael's
  // call Nov 8 2026). Field failure: the old note said only
  // "press Ctrl+V", so the pasted complaint landed AFTER the
  // stub text — running onto its last line ("…then click
  // Send.Hello Registrar Abuse Team,") — and the stub itself
  // rode into the sent email as a preamble. The stub now
  // tells the user to select it (Ctrl+A) before pasting, so
  // the full complaint replaces it whole: no stub text in
  // the sent mail, no run-on line. The clipboard payload
  // (the complaint itself) is unchanged.
  var PASTE_NOTE = "The complaint was too long for a direct email link, " +
    "so Spam Avenger copied it to your clipboard instead.\n\n" +
    "Click in this box, press Ctrl+A (Cmd+A on a Mac) to select " +
    "this note, then press Ctrl+V (Cmd+V on a Mac) to paste the " +
    "full complaint in its place, then click Send.";

  // v1.0.72: the panel's paste-mode warning (same spec,
  // item 2). When a complaint will open in paste mode, the
  // lane's section says so BEFORE the click, next to the
  // button — the user should never discover paste mode by
  // surprise inside the compose. Michael's wording.
  var PASTE_MODE_WARNING = "This complaint is too long to " +
    "send across automatically. It opens in Gmail as a " +
    "short note \u2014 the full text is copied for you, and " +
    "you paste it in.";

  function composeUrl(acct, c, bodyOverride) {
    return "https://mail.google.com/mail/u/" + acct +
      "/?view=cm&fs=1" +
      "&to=" + encodeURIComponent(c.to) +
      "&su=" + encodeURIComponent(c.subject) +
      "&body=" + encodeURIComponent(
        bodyOverride != null ? bodyOverride : c.body);
  }

  function fitForCompose(acct, a) {
    var full = a.complaint || buildComplaint(a);
    if (!full) return null;
    var url = composeUrl(acct, full);
    if (url.length <= COMPOSE_URL_BUDGET) {
      return { mode: "direct", complaint: full, url: url };
    }
    var ladder = [
      { bodyCap: 2000 }, { bodyCap: 800 }, { bodyCap: 0 },
      { bodyCap: 0, headerCap: 3000 }, { bodyCap: 0, headerCap: 1500 }
    ];
    for (var i = 0; i < ladder.length; i++) {
      var c2 = buildComplaint(a, ladder[i]);
      if (!c2) continue;
      var u2 = composeUrl(acct, c2);
      if (u2.length <= COMPOSE_URL_BUDGET) {
        return { mode: "shrunk", complaint: c2, url: u2 };
      }
    }
    return { mode: "paste", complaint: full,
             url: composeUrl(acct, full, PASTE_NOTE) };
  }

  // Decode RFC 2047 encoded-words: =?charset?Q?...?= / =?charset?B?...?=
  function decodeMimeWords(s) {
    return String(s || "").replace(/=\?([^?\s]+)\?([qQbB])\?([^?]*)\?=/g,
      function (m, charset, enc, text) {
        try {
          var bytes;
          if (enc.toUpperCase() === "B") {
            var bin = atob(text);
            bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          } else {
            var qp = text.replace(/_/g, " ");
            var arr = [];
            for (var j = 0; j < qp.length; j++) {
              if (qp[j] === "=" && j + 2 < qp.length &&
                  /^[0-9a-fA-F]{2}$/.test(qp.substr(j + 1, 2))) {
                arr.push(parseInt(qp.substr(j + 1, 2), 16));
                j += 2;
              } else {
                arr.push(qp.charCodeAt(j) & 0xff);
              }
            }
            bytes = new Uint8Array(arr);
          }
          return new TextDecoder(charset || "utf-8").decode(bytes);
        } catch (e) {
          return m;
        }
      });
  }

  // Decode quoted-printable body text (soft breaks + =XX escapes).
  function decodeQP(text) {
    return String(text || "")
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, function (m, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      });
  }

  function decodeBody(bodyText, headers) {
    var cte = getFirst(headers, "content-transfer-encoding").toLowerCase();
    var t = String(bodyText || "");
    try {
      if (cte.indexOf("base64") !== -1 && t.length > 100) {
        var bin = atob(t.replace(/\s+/g, ""));
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder("utf-8").decode(bytes);
      }
    } catch (e) {}
    // v1.0.33: decode quoted-printable ONLY when this entity/part
    // actually declares it, or the text shows QP soft line breaks
    // ("=" at end of line). The old bare /=[0-9A-Fa-f]{2}/ sniff
    // false-fired on innocent plain text containing "=32" etc.
    // (e.g. "pid=32344&vid=222…"): decodeQP then converted "=32" to
    // "2" and "=22" to a `"` byte, which truncated URLs at the
    // extractUrls regex — real links came out mangled.
    if (cte.indexOf("quoted-printable") !== -1 || /=\r?\n/.test(t)) {
      try { return decodeQP(t); } catch (e) {}
    }
    return t;
  }

  // --- MIME part walking (v1.0.32) ---
  // Typical spam is multipart/*: the TOP-LEVEL headers rarely declare
  // a Content-Transfer-Encoding — each MIME part carries its own.
  // decodeBody() alone only honors the top level, so a base64 HTML
  // part was never decoded and extractUrls() scanned base64 gibberish
  // (the confirmed root cause of empty link lists on multipart spam).

  // Boundary parameter out of the Content-Type header, or null.
  function mimeBoundary(headers) {
    var ct = getFirst(headers, "content-type");
    var m = ct.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
    if (!m) return null;
    return m[1] || m[2] || null;
  }

  // Split a multipart entity's body into [{headers, body}, ...].
  // Returns [] when the entity isn't multipart or has no boundary.
  function mimeParts(bodyText, headers) {
    var ct = getFirst(headers, "content-type").toLowerCase();
    if (ct.indexOf("multipart/") !== 0) return [];
    var boundary = mimeBoundary(headers);
    if (!boundary) return [];
    var segments = String(bodyText).split("--" + boundary);
    var parts = [];
    for (var i = 1; i < segments.length; i++) { // [0] is the preamble
      var seg = segments[i];
      if (/^--/.test(seg)) break; // closing delimiter; rest is epilogue
      seg = seg.replace(/^[ \t]*\r?\n/, "").replace(/\r?\n[ \t]*$/, "");
      if (!seg.trim()) continue;
      parts.push({
        headers: parseHeaders(seg),
        body: seg.split(/\r?\n\r?\n/).slice(1).join("\n\n")
      });
    }
    return parts;
  }

  // Decode every MIME part per its OWN Content-Transfer-Encoding.
  // One level of nesting is walked (e.g. multipart/alternative
  // inside multipart/mixed). Returns an array of decoded part bodies.
  function decodeMimeParts(bodyText, headers) {
    var out = [];
    mimeParts(bodyText, headers).forEach(function (p) {
      out.push(decodeBody(p.body, p.headers));
      mimeParts(p.body, p.headers).forEach(function (sub) {
        out.push(decodeBody(sub.body, sub.headers));
      });
    });
    return out;
  }

  // The Received header the traced IP actually came from (best evidence).
  function evidenceHeader(headers, ip) {
    var recvd = getAll(headers, "received");
    if (!ip || !recvd.length) {
      return recvd.length ? recvd[recvd.length - 1].slice(0, 300) : null;
    }
    for (var i = recvd.length - 1; i >= 0; i--) {
      if (recvd[i].indexOf(ip) !== -1) return recvd[i].slice(0, 300);
    }
    return recvd[recvd.length - 1].slice(0, 300);
  }

  function analyze(rawText) {
    var headers = parseHeaders(rawText);
    var rawBody = String(rawText).split(/\r?\n\r?\n/).slice(1).join("\n\n");
    var bodyText = decodeBody(rawBody, headers);
    var text = stripTags(bodyText).slice(0, 100000);
    var from = decodeMimeWords(getFirst(headers, "from"));
    var subject = decodeMimeWords(getFirst(headers, "subject"));
    var date = getFirst(headers, "date");
    var messageId = getFirst(headers, "message-id");
    // v1.0.32: also decode each MIME part on its own terms (a base64
    // or quoted-printable part inside a multipart message) and scan
    // the decoded part bodies — raw and tag-stripped — for links.
    var urlText = bodyText + " " + text;
    decodeMimeParts(rawBody, headers).forEach(function (partBody) {
      urlText += " " + partBody + " " + stripTags(partBody);
    });
    var urls = leadWithPages(extractUrls(urlText));
    var ip = originIp(headers);
    var rf = redFlags(from, urls, text);
    // v1.0.67: Microsoft tenant-account signals, from the
    // headers alone (investigate re-checks with the PTR host).
    var authResults = parseAuthResults(headers);
    var recvHosts = receivedHosts(headers);
    // v1.0.72 (.73): retain the Received stamps (header
    // order) and resolve the effective message date once,
    // here — see resolveEffectiveDate. The raw Date header
    // stays on .date for anything that quotes it.
    var recvStamps = getAll(headers, "received").map(receivedStampOf);
    var sendingServer = sendingServerFor(headers, ip);
    var a0 = {
      from: from, subject: subject, date: date, messageId: messageId,
      recipient: recipientOf(headers),
      ip: ip, urls: urls, urlHosts: rf.urlHosts, senderDomain: rf.senderDomain,
      flags: rf.flags,
      sextortion: detectSextortion(text),
      ingressReceived: evidenceHeader(headers, ip),
      fullHeaders: String(rawText).split(/\r?\n\r?\n/)[0] || "",
      bodyText: text,
      bodyPreview: text.slice(0, 1500),
      authResults: authResults,
      authAllPass: authAllPass(authResults),
      dkimAligned: dkimAlignedPass(headers, rf.senderDomain),
      receivedHosts: recvHosts,
      receivedStamps: recvStamps,
      effectiveDate: resolveEffectiveDate(date, recvStamps, true),
      sendingServer: sendingServer,
      msProtectionHost: recvHosts.some(isMicrosoftProtectionHost) ||
        isMicrosoftProtectionHost(sendingServer)
    };
    a0.msAccountReport = isMsAccountCase(a0);
    return a0;
  }

  // Full pipeline: analyze -> RDAP -> PTR -> complaint.
  function investigate(rawText, onProgress) {
    var a = analyze(rawText);
    function prog(s) { if (onProgress) { try { onProgress(s); } catch (e) {} } }
    if (!a.ip) {
      a.stage = "no-ip";
      return Promise.resolve(a);
    }
    prog("Looking up " + a.ip + "…");
    return rdapLookup(a.ip).then(function (rdap) {
      a.org = rdap ? extractOrg(rdap) : null;
      a.abuse = rdap ? extractAbuse(rdap) : null;
      a.hyperscaler = rdap ? hyperscalerOf(rdap) : null;
      prog("Reverse DNS…");
      return reverseDns(a.ip);
    }).then(function (host) {
      a.host = host;
      // v1.0.67: re-check the Microsoft tenant-account case with
      // the PTR host in hand (the headers alone usually settle
      // it — the protection hostname rides the ingress Received
      // hop — but a PTR naming the pool counts too). When it
      // fires, the Report Abuse lane is NOT skipped: it switches
      // to the account report built by buildComplaint below.
      a.msAccountReport = isMsAccountCase(a);
      a.skipComplaint = a.msAccountReport
        ? false : whitelisted(host);
      a.providerAdvice = (!a.msAccountReport && a.skipComplaint)
        ? providerAdvice(host) : null;
      // Gmail's report flow can be driven from the page; other providers can't.
      a.gmailAutoReport = !!(a.skipComplaint &&
        /google\.com|googlemail\.com/i.test(String(host || "")));
      // v1.0.68: in the Microsoft tenant-account case only,
      // check the "no website" tell for the sender domain
      // (A/AAAA for the apex and the www host, via dns.google).
      // The flag is set ONLY on a confirmed-empty result; any
      // error or uncertainty leaves it unset and nothing is
      // asserted anywhere. The four queries run in parallel
      // on a short timeout and any failure falls through to
      // the normal finish — the panel never blocks on this.
      var finish = function () {
        var c = buildComplaint(a);
        a.complaint = c;
        a.stage = "done";
        return a;
      };
      if (a.msAccountReport) {
        var dom = (senderEmail(a.from).match(/@([\w.-]+)/) || [])[1] ||
          a.senderDomain || "";
        return domainNoWebsite(dom).then(function (none) {
          a.senderDomainNoWebsite = none === true;
          return finish();
        }).catch(function () { return finish(); });
      }
      return finish();
    });
  }

  // --- v1.0.72: lane gating — live-website checks, real-host
  // discovery, repeat-offender memory, three-way classification
  // (queued Nov 6 2026 from two field cases the same day: the
  // Stoltz Syndicate working-capital pitch, whose sender domain
  // had NO website while the panel drafted a hosting complaint
  // against a front-door address, and a Capital One phish whose
  // sending IP Michael had already reported four days earlier).
  // Michael's rule, his words: a domain with no website is a
  // flag in itself, and the panel should only recommend useful
  // lanes. Every lane shown must be a lane that can do
  // something. The pure decision logic lives here (Node-tested);
  // the network work (site probes, DoH, crt.sh) runs through
  // the background worker and content.js orchestration.
  //
  // Panel copy is plain sentences that say what a thing means
  // AND what follows from it — never cryptic tech shorthand.
  // The two explanation lines below are Michael's wording.

  // Shown when the sender domain has no live website: the
  // website-host lane is suppressed entirely (no button, no
  // drafted complaint) and this sentence stands in its place.
  var NO_SITE_EXPLANATION = "The domain is only used to send " +
    "spam and has no live website, so reporting abuse to a " +
    "hosting company is not viable/useful.";

  // Shown when a website exists but the company actually
  // hosting it cannot be identified from outside (the site
  // sits behind a front-door proxy whose origin never leaks).
  // Names nobody — the front-door company is never mentioned
  // to the user, at all.
  var HOST_HIDDEN_EXPLANATION = "The company hosting this " +
    "website is hidden, so a hosting complaint can't be " +
    "delivered.";

  // Registrar parking / placeholder signatures. Conservative
  // on purpose: a marker must be parking-specific (a parking
  // service's own name, or the sale/parked phrasing itself) —
  // a thin but REAL small-business page carries none of these,
  // and "for sale" alone (a shop selling things) never trips:
  // every sale marker below is about the DOMAIN being sold.
  var PARKED_MARKERS = [
    "sedoparking", "parkingcrew", "parklogic", "bodis parking",
    "bodis.com", "parked domain", "domain is parked",
    "this domain is parked", "web page is parked",
    "domain is for sale", "this domain is for sale",
    "buy this domain", "domain name is for sale",
    "the domain name is for sale", "purchase this domain",
    "this domain name is for sale", "domain has been registered",
    "has been parked", "parked free of charge",
    "future home of", "website coming soon",
    "this page is parked", "parking page"
  ];

  // True when fetched page text is a registrar parking page or
  // a placeholder. The empty-shell case (a response whose
  // visible text is nearly empty) counts ONLY when the raw
  // page is also small and scriptless — a script-driven page
  // (a real site, or a lure kit) always carries scripts and
  // bulk, and must never read as "no website". The visible
  // length is measured on the probe's extracted TEXT, never
  // re-derived from the raw HTML: a small real page says who
  // it is in its text even when its markup is tiny.
  function isParkedPage(text, rawHtml) {
    var t = String(text || "").toLowerCase();
    for (var i = 0; i < PARKED_MARKERS.length; i++) {
      if (t.indexOf(PARKED_MARKERS[i]) !== -1) return true;
    }
    var raw = String(rawHtml || "");
    if (t.trim().length < 20 && raw.length < 2000 &&
        raw.toLowerCase().indexOf("<script") === -1) return true;
    return false;
  }

  // The live-website verdict for one domain, from the two
  // facts the panel gathers: the confirmed-empty DNS result
  // (domainNoWebsite's semantics: true ONLY when every A/AAAA
  // query for the apex and www answered empty) and the site
  // probe the background worker ran ({outcome:"response",
  // status, text, raw} or {outcome:"error"} or null).
  //   "live"   — a server answered with real content (any HTTP
  //              status: a real host answering 4xx/5xx is still
  //              a host with an abuse desk)
  //   "parked" — a parking/placeholder page answered
  //   "nosite" — confirmed-empty DNS, or a front-door address
  //              answering with its origin-error codes
  //              (520–523: the proxy itself says no working
  //              origin stands behind it)
  //   "unknown"— anything else. A probe that fails at network
  //              level while DNS records exist proves nothing
  //              (bot walls, TLS faults, geo-blocks), and the
  //              panel asserts NOTHING on unknown — the lanes
  //              render exactly as they did before v1.0.72.
  function classifySiteProbe(input) {
    var p = (input && input.probe) || null;
    if (p && p.outcome === "response") {
      // Parking/placeholder pages serve success statuses; an
      // error response from a real server is a live host
      // refusing, never a parking page — so the parked test
      // runs on 2xx answers only.
      if (p.status >= 200 && p.status < 300 &&
          isParkedPage(p.text, p.raw)) return "parked";
      if (input.frontDoor && p.status >= 520 && p.status <= 523) {
        return "nosite";
      }
      return "live";
    }
    if (input && input.dnsEmpty === true) return "nosite";
    return "unknown";
  }

  // Front-door proxy networks: the site's public address
  // belongs to a company that only passes traffic through to
  // the real host behind it (Cloudflare's published ranges,
  // the case that started this feature — the Stoltz domain's
  // website IP 104.21.31.65). Detection exists ONLY so the
  // panel can hunt the real host; the front-door company is
  // never named in panel copy.
  var FRONT_DOOR_V4 = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22",
    "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22",
    "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "172.64.0.0/13", "131.0.72.0/22"
  ];
  var FRONT_DOOR_V6 = [
    "2606:4700:", "2803:f800:", "2405:b500:", "2405:8100:",
    "2a06:98c0:"
  ];

  function ipv4ToInt(ip) {
    var parts = String(ip || "").split(".");
    if (parts.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) {
      var v = parseInt(parts[i], 10);
      if (isNaN(v) || v < 0 || v > 255) return null;
      n = n * 256 + v;
    }
    return n;
  }

  function ipv4InCidr(ip, cidr) {
    var bits = String(cidr || "").split("/");
    var base = ipv4ToInt(bits[0]);
    var addr = ipv4ToInt(ip);
    var len = parseInt(bits[1], 10);
    if (base === null || addr === null || isNaN(len)) return false;
    if (len === 0) return true;
    var div = Math.pow(2, 32 - len);
    return Math.floor(addr / div) === Math.floor(base / div);
  }

  function isFrontDoorIp(ip) {
    var s = String(ip || "").trim().toLowerCase();
    if (!s) return false;
    if (s.indexOf(":") !== -1) {
      return FRONT_DOOR_V6.some(function (p) {
        return s.indexOf(p) === 0;
      });
    }
    return FRONT_DOOR_V4.some(function (c) {
      return ipv4InCidr(s, c);
    });
  }

  // Origin discovery's payoff: the first candidate address
  // that is a real, public, non-front-door host. Candidates
  // come from the leaks a front-door setup leaves (grey-cloud
  // subdomains, MX targets, SPF ip4 mechanisms, crt.sh names);
  // null when every candidate is the front door itself or
  // unusable — the origin is then genuinely hidden from
  // outside, and the lane turns off instead of guessing.
  function pickOriginIp(ips) {
    if (!Array.isArray(ips)) return null;
    for (var i = 0; i < ips.length; i++) {
      var ip = String(ips[i] || "").trim();
      if (!ip) continue;
      if (ip.indexOf(":") === -1 && isPrivateIp(ip)) continue;
      if (isFrontDoorIp(ip)) continue;
      return ip;
    }
    return null;
  }

  // websiteHostFor's sibling for an address origin discovery
  // already found: same info shape, same RDAP/PTR identity —
  // the website complaint then aims at the REAL host's desk.
  function websiteHostForIp(domain, ip) {
    var dom = String(domain || "").toLowerCase().replace(/\.$/, "");
    if (!ip) return Promise.resolve(null);
    return Promise.all([rdapLookup(ip), reverseDns(ip)])
      .then(function (rs) {
        var rdap = rs[0];
        var info = {
          domain: dom,
          ip: ip,
          host: rs[1] || "unknown",
          org: rdap ? extractOrg(rdap) : null,
          abuse: rdap ? extractAbuse(rdap) : null,
          hyperscaler: rdap ? hyperscalerOf(rdap) : null,
          checkedDate: new Date().toISOString().slice(0, 10)
        };
        info.formLane = websiteFormLane(info);
        return info;
      }).catch(function () { return null; });
  }

  // The one-statement authentication summary for the details
  // block. Michael's exact words for the all-missing case:
  // "Missing standard SPF, DKIM, and DMARC authentication" —
  // the term list adapts to whichever mechanisms are actually
  // missing. "Missing" means the mechanism produced no result
  // at all (SPF "none" — no record published; no DKIM
  // signature; no DMARC result): a mechanism that FAILED is
  // present-but-broken, a different fact the flags and the
  // complaint already carry, and it is NOT listed here.
  // Null when nothing is missing (no summary line).
  function authSummaryLine(auth) {
    if (!auth) return null;
    var names = [["spf", "SPF"], ["dkim", "DKIM"], ["dmarc", "DMARC"]];
    var missing = [];
    names.forEach(function (pair) {
      var v = auth[pair[0]];
      if (v === "none" || v === null || typeof v === "undefined") {
        missing.push(pair[1]);
      }
    });
    if (!missing.length) return null;
    var list;
    if (missing.length === 1) list = missing[0];
    else if (missing.length === 2) list = missing.join(" and ");
    else list = missing.slice(0, -1).join(", ") + ", and " + missing[2];
    return "Missing standard " + list + " authentication";
  }

  // The message's primary link: a.urls already leads with page
  // candidates (leadWithPages in analyze), so the first entry
  // is the payload/CTA link whenever the message carries one.
  function primaryLink(a) {
    if (!a || !a.urls || !a.urls.length) return null;
    return a.urls[0];
  }

  function hostOfUrl(u) {
    var m = String(u || "").match(/^https?:\/\/([^/?#]+)/i);
    if (!m) return "";
    return m[1].split("@").pop().split(":")[0].toLowerCase()
      .replace(/^www\./, "");
  }

  function primaryLinkDomain(a) {
    var u = primaryLink(a);
    if (!u) return null;
    var host = hostOfUrl(u);
    if (!host || host.indexOf(".") === -1) return null;
    return registrableDomain(host);
  }

  // The LINK host complaint: the website complaint's sibling,
  // aimed at whoever hosts the page the message's link leads
  // to — phish payloads virtually never live on the From
  // domain; they live where the button points. Same {to,
  // subject, body} shape, same evidence tail. Null when there
  // is no link trace, no published abuse contact, or the host
  // is a form-only lane (the panel shows that lane's form kit
  // instead, via buildLinkFormEvidence).
  function buildLinkComplaint(a, opts) {
    opts = opts || {};
    if (!a || !a.linkHost) return null;
    var w = a.linkHost;
    if (!w.ip || !w.abuse || w.formLane) return null;
    var domain = w.domain || primaryLinkDomain(a) || "unknown";
    var L = [];
    L.push("Hello Abuse Team,");
    L.push("");
    L.push("You host a web page that a fraud message is using " +
      "as its landing page. The message detailed below sends " +
      "its readers to this page on your network:");
    L.push("");
    L.push("  Page:           " + (w.url || "unknown"));
    L.push("  Domain:         " + domain);
    L.push("  Website IP:     " + w.ip +
      (w.org ? " (" + w.org + ")" : "") +
      (w.checkedDate ? " — resolving there when checked on " +
        w.checkedDate : ""));
    L.push("  Claimed sender: " + (a.from || "unknown"));
    L.push("  Subject:        " + (a.subject || "unknown"));
    L.push("  Date received:  " + (effectiveDate(a) || "unknown"));
    complaintLinks(L, a);
    L.push("");
    var prsL = priorReportSection(a.priorReports);
    if (prsL) { L.push(prsL); L.push(""); }
    complaintEvidenceTail(L, a, opts);
    L.push("The page is the piece of the operation its readers " +
      "are sent to. Please investigate and suspend hosting " +
      "for it. Thank you.");
    return {
      to: w.abuse,
      subject: "Hosting abuse complaint — fraud page at " +
        domain + " on " + w.ip,
      body: L.join("\n")
    };
  }

  // The link lane's form-kit evidence block: buildHostingForm-
  // Evidence's sibling for a form-only link host — the mail
  // kit's slices claim the message was SENT from the report's
  // IP, false for a link address, so this block says what is
  // true: the message's LINK leads to a page hosted there.
  function buildLinkFormEvidence(a, opts) {
    opts = opts || {};
    var headerCap = opts.headerCap != null ? opts.headerCap : 8000;
    if (!a || !a.linkHost || !a.linkHost.ip) return null;
    var w = a.linkHost;
    var domain = w.domain || primaryLinkDomain(a) || "unknown";
    var L = [];
    L.push("A spam / fraud message I received sends its " +
      "readers to a page hosted on your network: " +
      (w.url || domain) + ". The page is hosted at IP address " +
      w.ip + (w.org ? " (registered to " + w.org + ")" : "") +
      (w.checkedDate ? ", checked on " + w.checkedDate : "") +
      ". Please investigate and suspend hosting for this " +
      "page. The message details and full headers follow as " +
      "evidence.");
    L.push("");
    L.push("Page: " + (w.url || "unknown"));
    L.push("Domain: " + domain);
    L.push("Website IP: " + w.ip);
    if (w.checkedDate) L.push("Resolving there when checked: " + w.checkedDate);
    L.push("From: " + (a.from || "unknown"));
    L.push("Subject: " + (a.subject || "unknown"));
    L.push("Date/time received (UTC): " + utcStamp(effectiveDate(a)));
    if (a.ingressReceived) L.push("Received: " + a.ingressReceived);
    if (a.urls && a.urls.length) {
      L.push("Links in message (defanged — read hxxps as https and [.] as .):");
      a.urls.slice(0, 10).forEach(function (u) { L.push("  - " + defangUrl(u)); });
    }
    L.push("");
    if (a.fullHeaders) {
      var th = trimHeaders(String(a.fullHeaders));
      var fh = th.text;
      var truncated = fh.length > headerCap;
      if (truncated) fh = fh.slice(0, headerCap);
      L.push("Full headers (plain text, as received):");
      fh.split("\n").forEach(function (ln) { L.push(ln); });
      if (th.stripped) L.push("[ARC/DKIM signature blocks omitted — routing and authentication headers are complete]");
      if (truncated) L.push("[headers truncated at " + headerCap + " characters]");
    } else if (a.ingressReceived) {
      L.push("Key headers as evidence:");
      L.push("  Message-ID: " + (a.messageId || "unknown"));
      L.push("  Received: " + a.ingressReceived);
    }
    return L.join("\n");
  }

  // --- Repeat-offender memory -------------------------------
  // A sighting is one small record in the extension's own
  // local storage (content.js owns the storage calls; these
  // are the pure shapes): { ip, domain, ts, desk, action,
  // msg }. "analyzed" sightings mark a panel analysis; every
  // other action is a launched report lane. The repeat note
  // and the complaint section count REPORTS only — opening
  // a panel was never a report, and the panel copy says
  // "report". v1.0.73: the record also carries `msg`, the
  // message key of the message the lane was launched on —
  // matchReports counts DISTINCT reports (one per message),
  // not lane launches: working one message through five
  // lanes is one report of its sender, not five. Records
  // written before v1.0.73 have no `msg`; they fall back to
  // one count per calendar day in matchReports.
  var SIGHTINGS_CAP = 500;

  function cleanSighting(s) {
    if (!s || typeof s !== "object") return null;
    var ts = typeof s.ts === "number" ? s.ts : 0;
    if (!(ts > 0)) return null;
    return {
      ip: String(s.ip || ""),
      domain: String(s.domain || "").toLowerCase(),
      ts: ts,
      desk: String(s.desk || ""),
      action: String(s.action || ""),
      msg: String(s.msg || "")
    };
  }

  // Oldest-first valid list, capped. When the cap bites,
  // "analyzed" sightings drop before reports — the reports
  // are the memory that matters.
  function pruneSightings(list, cap) {
    var max = (typeof cap === "number" && cap > 0) ? cap : SIGHTINGS_CAP;
    var valid = [];
    (Array.isArray(list) ? list : []).forEach(function (s) {
      var c = cleanSighting(s);
      if (c) valid.push(c);
    });
    valid.sort(function (x, y) { return x.ts - y.ts; });
    if (valid.length <= max) return valid;
    var reports = valid.filter(function (s) {
      return s.action !== "analyzed";
    });
    var analyzed = valid.filter(function (s) {
      return s.action === "analyzed";
    });
    var kept = reports.concat(analyzed.slice(
      Math.max(0, analyzed.length - (max - reports.length))));
    kept.sort(function (x, y) { return x.ts - y.ts; });
    return kept.slice(kept.length - max);
  }

  // Prior REPORTS of this sender: the origin IP is the strong
  // key (infrastructure moves slowly; domains are disposable),
  // the From domain the fallback. Returns { count, lastTs,
  // dates, matchedBy } with dates ascending, or null when
  // there is no prior report — the panel treats null as
  // "first sighting" and shows no repeat note.
  //
  // v1.0.73 (queued-repeat-counter-lane-launches.md): count
  // is DISTINCT reports, not lane launches. Sightings carry
  // the message key (`msg`) of the message each lane was
  // launched on, so the several lanes worked on ONE message
  // collapse into the single report they are. Records from
  // before the key existed carry no `msg`; those collapse
  // per calendar day instead — one morning's five-lane
  // session on one message still reads as one report, never
  // five. `dates` holds one date per distinct report (its
  // earliest sighting); `lastTs` is the newest sighting of
  // any of them.
  function matchReports(list, ip, domain) {
    var reports = pruneSightings(list, Number.MAX_SAFE_INTEGER)
      .filter(function (s) { return s.action !== "analyzed"; });
    var dom = String(domain || "").toLowerCase();
    var byIp = ip ? reports.filter(function (s) {
      return s.ip && s.ip === ip;
    }) : [];
    var chosen = byIp, by = byIp.length ? "ip" : null;
    if (!chosen.length && dom) {
      chosen = reports.filter(function (s) {
        return s.domain && s.domain === dom;
      });
      by = chosen.length ? "domain" : null;
    }
    if (!chosen.length) return null;
    var groups = {};
    chosen.forEach(function (s) {
      var key;
      if (s.msg) {
        key = "m|" + s.msg;
      } else {
        var d = new Date(s.ts);
        key = "d|" + d.getFullYear() + "-" + d.getMonth() +
          "-" + d.getDate();
      }
      if (groups[key] == null || s.ts < groups[key]) {
        groups[key] = s.ts;
      }
    });
    var dates = Object.keys(groups).map(function (k) {
      return groups[k];
    }).sort(function (x, y) { return x - y; });
    return {
      count: dates.length,
      lastTs: chosen[chosen.length - 1].ts,
      dates: dates,
      matchedBy: by
    };
  }

  var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // "Nov 2, 2026" — local time, the form Michael's panel copy
  // takes ("Your last report of this sender was on <date>.").
  function formatReportDate(ts) {
    if (typeof ts !== "number" || !(ts > 0)) return "";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return MONTHS_SHORT[d.getMonth()] + " " + d.getDate() +
      ", " + d.getFullYear();
  }

  function ordinal(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return n + "st";
    if (m10 === 2 && m100 !== 12) return n + "nd";
    if (m10 === 3 && m100 !== 13) return n + "rd";
    return n + "th";
  }

  // The panel's repeat note — worded to encourage, never to
  // discourage (Michael's call): it leads with his anchor
  // sentence, then the encouragement grows with the count,
  // because each repeat genuinely is worth more (repeat after
  // notice is the escalation argument). NEVER "still sending"
  // framing — that reads as "your report failed".
  function repeatPanelNote(match) {
    if (!match || !match.count) return null;
    var out = "Your last report of this sender was on " +
      formatReportDate(match.lastTs) + ".";
    if (match.count === 1) {
      out += " This is your 2nd report of this sender — a " +
        "repeat sighting strengthens your complaint, and the " +
        "new report will note the earlier one.";
    } else {
      out += " This is your " + ordinal(match.count + 1) +
        " report of this sender — it has kept abusing after " +
        match.count + " earlier reports, and the new report " +
        "will put that pattern on the record.";
    }
    return out;
  }

  // The prior-report section a complaint gains on a repeat.
  // Desk-neutral ("this sender", never "your network" — the
  // earlier reports may have gone to a different desk of the
  // same operation) and scaling the same way the panel note
  // does: one prior report is a fact; several are a pattern
  // the desk is asked to treat as persistent abuse.
  function priorReportSection(match) {
    if (!match || !match.count) return "";
    var dates = (match.dates || []).map(formatReportDate)
      .filter(function (d) { return !!d; });
    if (match.count === 1) {
      return "Prior report: I have reported this sender " +
        "before, on " + (dates[0] || "an earlier date") +
        ". The abuse has continued since that report.";
    }
    var shown = dates.slice(0, 5);
    var list = shown.join(", ");
    if (dates.length > shown.length) {
      list += ", and " + (dates.length - shown.length) + " more";
    }
    return "Prior reports: I have reported this sender " +
      match.count + " times before — on " + list + ". The " +
      "abuse has continued after repeated notice. This is " +
      "report number " + (match.count + 1) + "; please treat " +
      "this sender as a persistent abuse pattern, not a first " +
      "offense.";
  }

  // --- Three-way classification ------------------------------
  // (a) "fraud" — phishing/fraud signals: report lanes lead,
  //     and the APWG + CISA forward is offered ONLY here (a
  //     plain sales pitch is not phishing, and those desks'
  //     intake is phishing — the Stoltz pitch correctly fails
  //     this gate; the Capital One phish clears it).
  // (b) "uce" — throwaway unsolicited commercial mail: the
  //     mail-host complaint and the FTC lane lead.
  // (c) "legit" — a real company, merely unwanted: auth all
  //     passing, a live website, not one red flag. The
  //     existing "Not Spam but still unwanted" PID lane is
  //     presented as the primary action — the only lane with
  //     legal teeth for that bucket.
  // gate: { senderSite, linkSite } site verdicts from
  // classifySiteProbe ("live" | "parked" | "nosite" |
  // "unknown" | null when not probed).
  function classifyBucket(a, gate) {
    if (!a) return "uce";
    gate = gate || {};
    var flags = a.flags || [];
    function hasFlag(sub) {
      return flags.some(function (f) {
        return String(f).indexOf(sub) !== -1;
      });
    }
    var linkMismatch = hasFlag(
      "links go somewhere completely different");
    var phishy = hasFlag("phishing phrase") ||
      hasFlag("gift-card mention") || hasFlag("mass-sent phish kit") ||
      hasFlag("account is 'suspended'");
    var auth = a.authResults || {};
    var anyMissing = ["spf", "dkim", "dmarc"].some(function (k) {
      return auth[k] === "none" || auth[k] === null ||
        typeof auth[k] === "undefined";
    });
    // Fraud needs a lure signal of its own: phishing content,
    // or links that leave the sender's domain WHILE the
    // message carries no working authentication (the Capital
    // One shape: brand name, unrelated sender domain, every
    // mechanism missing, button pointing at a third domain).
    // A live off-domain link by itself is NOT enough — a
    // throwaway sales pitch links to its landing page too,
    // and calling that fraud would offer the phishing desks'
    // forward on ordinary junk (the Stoltz shape).
    var fraud = phishy || (linkMismatch && anyMissing);
    if (fraud) return "fraud";
    if (a.authAllPass && !a.msAccountReport && !a.skipComplaint &&
        gate.senderSite === "live" && flags.length === 0) {
      return "legit";
    }
    return "uce";
  }

  // Google Safe Browsing reports a URL — the lane is offered
  // when the message's primary link is a LIVE page. A link
  // whose host has no live website gives the form nothing to
  // act on, and a message with no link at all likewise. An
  // UNPROBED or uncertain link keeps the lane (the panel
  // asserts nothing on uncertainty, as everywhere here).
  function sbLaneVisible(a, gate) {
    if (!a || !a.urls || !a.urls.length) return false;
    gate = gate || {};
    if (gate.linkSite === "live") return true;
    if (gate.linkSite === "nosite" || gate.linkSite === "parked") {
      return false;
    }
    return true;
  }

  // v1.0.72: the send-as hint (queued-send-as-hint.md,
  // Michael's call Nov 8 2026 — he widened the trigger
  // himself in the asking). A fresh compose opened by the
  // panel defaults its From to the account's DEFAULT
  // identity, but plenty of users read mail addressed to
  // another identity inside the same account — a fetched
  // custom domain (his mjf@colorami.com, pulled into Gmail
  // from his own server) or a second Gmail address. The
  // complaint then leaves from the wrong address unless the
  // user notices and switches it in the compose's From
  // dropdown, as he had to by hand on the vitluma.fun
  // registrar complaint. The panel never switches the
  // identity itself — it REMINDS, in every lane that opens
  // a Gmail compose.
  //
  // sendAsHintFor(recipient, accountEmail) returns the
  // recipient address to name in the hint, or null for no
  // hint. The comparison is the widened trigger: whenever
  // the address the spam was sent to differs from the
  // signed-in account's own address, whatever either
  // domain is. When the account address could not be read
  // from the page (content.js passes ""), fall back to the
  // custom-domain rule — a non-Gmail recipient fires (the
  // fetched-domain case always works), a @gmail.com
  // recipient stays silent rather than guessing (it may
  // well BE the account's own address).
  function sendAsHintFor(recipient, accountEmail) {
    var rcpt = String(recipient || "").trim();
    if (!rcpt || rcpt.indexOf("@") === -1) return null;
    var acct = String(accountEmail || "").trim();
    if (acct && acct.indexOf("@") !== -1) {
      return rcpt.toLowerCase() === acct.toLowerCase() ? null : rcpt;
    }
    var dom = rcpt.slice(rcpt.lastIndexOf("@") + 1).toLowerCase();
    if (dom === "gmail.com" || dom === "googlemail.com") return null;
    return rcpt;
  }

  // The hint line itself, naming the recipient address from
  // the headers — never a hardcoded one. `what` is the thing
  // being opened ("complaint" in the report lanes, "letter"
  // in the PID lane, whose send is a demand letter).
  function sendAsHintText(recipient, what) {
    return "This spam was addressed to " + recipient + ". " +
      "If the " + (what || "complaint") + " opens under a " +
      "different From address, use the From dropdown in " +
      "the compose and send it as " + recipient + ".";
  }

  // v1.0.72: the own-forward catch (queued-own-forward-
  // catch.md, Michael's find Nov 8 2026; Oct 28 precedent).
  // Clicking the shield on the user's OWN forward of a spam
  // message — the APWG + CISA forward, looped back into his
  // Spam folder — fails the header fetch with the exhausted
  // signature ("download had no headers… try 2: HTTP 404;
  // try 3: HTTP 404"), because a forward does not carry the
  // original's headers in a form Gmail will hand over. The
  // panel's "Something broke" reads like an addon bug;
  // nothing is broken, and the user needs the ORIGINAL.
  //
  // ownForwardVerdict(signals) is the pure detector over
  // what the panel can see on the page (content.js gathers
  // them): the thread subject, the anchored message's
  // visible sender address and display name, its
  // recipients, its body text, and the signed-in account's
  // address and holder name. It fires when the sender IS
  // the account's own identity — that alone settles it.
  // Short of that, it fires when the body carries a
  // "Forwarded message" block AND at least two of these
  // corroborate: the subject begins Fwd:/FW:; the sender's
  // display name equals the account holder's name; the
  // recipients are the APWG + CISA desk pair
  // (reportphishing@apwg.org + contact@cisa.dhs.gov — the
  // pair this addon's own forward lane addresses); the
  // sender is the account (already a lone fire above, so
  // it counts here only for symmetry with the rule).
  //
  // Why two-of: the first build required subjectFwd AND
  // block whenever the sender was a send-as identity, on
  // the strength of ONE field specimen (Nov 8, 5:09 PM —
  // subject "Fwd: [Black Friday 2026 Deals]…", so the
  // subject and the block WERE both there). The second
  // specimen that same evening (5:43 PM, the rjfzzo bag
  // forward) had NO Fwd: prefix — subject "[Black Friday
  // 2026] Vintage Style. Leather Travel Bag…" — and the
  // catch missed it in the field. Its block, its sender
  // name (the account holder's own), and its desk-pair
  // recipients were all there to see. A single
  // corroborator never fires the block path: someone
  // else's forward TO the user carries a block and often
  // a Fwd: subject, but not the holder's name, the desk
  // pair, or the account identity. The catch itself is
  // additionally gated in content.js on the
  // exhausted-headers error, so a normal message with a
  // genuine failure keeps "Something broke".
  var OWN_FORWARD_EXPLANATION = "This is your own forward " +
    "of a spam message, not the original. Gmail won't hand " +
    "over the original's headers from a forward, so there's " +
    "nothing to trace here. Open the original message and " +
    "click the shield there.";
  function ownForwardVerdict(signals) {
    var s = signals || {};
    var subjectFwd = /^\s*(fwd|fw)\s*:/i
      .test(String(s.subject || ""));
    var block = /forwarded message/i
      .test(String(s.bodyText || ""));
    var sender = String(s.senderEmail || "").trim().toLowerCase();
    var acct = String(s.accountEmail || "").trim().toLowerCase();
    var ownSender = !!sender && !!acct && sender === acct;
    if (ownSender) return true;
    if (!block) return false;
    // The block path (see the note above): at least two
    // corroborators. Names compare exactly after case and
    // whitespace normalization — a first name alone, or
    // any partial match, never counts.
    function normName(v) {
      return String(v || "").trim()
        .replace(/\s+/g, " ").toLowerCase();
    }
    var sName = normName(s.senderName);
    var aName = normName(s.accountName);
    var nameMatch = !!sName && !!aName && sName === aName;
    var rcpts = s.recipientEmails || [];
    var deskSeen = {};
    for (var i = 0; i < rcpts.length; i++) {
      deskSeen[String(rcpts[i] || "").trim()
        .toLowerCase()] = true;
    }
    var deskPair = !!deskSeen["reportphishing@apwg.org"] &&
      !!deskSeen["contact@cisa.dhs.gov"];
    var corroborators = (subjectFwd ? 1 : 0) +
      (nameMatch ? 1 : 0) + (deskPair ? 1 : 0) +
      (ownSender ? 1 : 0);
    return corroborators >= 2;
  }

  var api = {
    parseHeaders: parseHeaders, originIp: originIp, isPrivateIp: isPrivateIp,
    analyze: analyze, investigate: investigate, buildComplaint: buildComplaint,
    buildFormEvidence: buildFormEvidence,
    buildFormFieldEvidence: buildFormFieldEvidence,
    displayHost: displayHost,
    trimHeaders: trimHeaders, fitForCompose: fitForCompose,
    composeUrl: composeUrl, COMPOSE_URL_BUDGET: COMPOSE_URL_BUDGET,
    defangUrl: defangUrl, defangText: defangText,
    extractAbuse: extractAbuse, extractOrg: extractOrg, whitelisted: whitelisted,
    providerAdvice: providerAdvice, hyperscalerOf: hyperscalerOf,
    parseAuthResults: parseAuthResults, authAllPass: authAllPass,
    isMicrosoftProtectionHost: isMicrosoftProtectionHost,
    buildMsAccountReport: buildMsAccountReport,
    buildMicrosoftAccountReport: buildMsAccountReport,
    isMsAccountCase: isMsAccountCase, senderEmail: senderEmail,
    MS_PHISH_DESK: MS_PHISH_DESK, msDetailsNote: msDetailsNote,
    domainNoWebsite: domainNoWebsite,
    redFlags: redFlags, RDAP_BASES: RDAP_BASES,
    isAssetUrl: isAssetUrl, leadWithPages: leadWithPages,
    normalizeUrl: normalizeUrl, extractUrls: extractUrls,
    fitGivenComplaint: fitGivenComplaint,
    pickAFromAnswers: pickAFromAnswers,
    websiteIpFor: websiteIpFor, websiteHostFor: websiteHostFor,
    websiteFormLane: websiteFormLane,
    fetchDomainRdap: fetchDomainRdap,
    parseDomainRdap: parseDomainRdap,
    domainFreshness: domainFreshness,
    effectiveDate: effectiveDate,
    buildHostingComplaint: buildHostingComplaint,
    buildRegistrarComplaint: buildRegistrarComplaint,
    icannRegistrarKey: icannRegistrarKey,
    icannEscalationTrigger: icannEscalationTrigger,
    buildIcannDomainCsv: buildIcannDomainCsv,
    buildIcannEvidence: buildIcannEvidence,
    buildHostingFormEvidence: buildHostingFormEvidence,
    traceSenderDomain: traceSenderDomain,
    detectSextortion: detectSextortion,
    mxHostDomains: mxHostDomains,
    registrableDomain: registrableDomain,
    fromDomainSpoofed: fromDomainSpoofed,
    fromAddressSpoofed: fromAddressSpoofed,
    OWN_FORWARD_BANNER: "This is your own forward of a spam " +
      "message, not the original \u2014 open the original to " +
      "work from its headers.",
    dkimAlignedPass: dkimAlignedPass,
    SPOOF_DOMAIN_EXPLANATION: SPOOF_DOMAIN_EXPLANATION,
    registrarFormLane: registrarFormLane,
    buildRegistrarFormEvidence: buildRegistrarFormEvidence,
    buildRegistrarShortEvidence: buildRegistrarShortEvidence,
    NO_SITE_EXPLANATION: NO_SITE_EXPLANATION,
    HOST_HIDDEN_EXPLANATION: HOST_HIDDEN_EXPLANATION,
    isParkedPage: isParkedPage, classifySiteProbe: classifySiteProbe,
    isFrontDoorIp: isFrontDoorIp, pickOriginIp: pickOriginIp,
    websiteHostForIp: websiteHostForIp,
    authSummaryLine: authSummaryLine,
    primaryLink: primaryLink, hostOfUrl: hostOfUrl,
    primaryLinkDomain: primaryLinkDomain,
    buildLinkComplaint: buildLinkComplaint,
    buildLinkFormEvidence: buildLinkFormEvidence,
    SIGHTINGS_CAP: SIGHTINGS_CAP,
    pruneSightings: pruneSightings, matchReports: matchReports,
    formatReportDate: formatReportDate, ordinal: ordinal,
    repeatPanelNote: repeatPanelNote,
    priorReportSection: priorReportSection,
    classifyBucket: classifyBucket, sbLaneVisible: sbLaneVisible,
    recipientOf: recipientOf,
    sendAsHintFor: sendAsHintFor, sendAsHintText: sendAsHintText,
    PASTE_NOTE: PASTE_NOTE, PASTE_MODE_WARNING: PASTE_MODE_WARNING,
    ownForwardVerdict: ownForwardVerdict,
    OWN_FORWARD_EXPLANATION: OWN_FORWARD_EXPLANATION
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api; // Node (tests)
  } else {
    window.SpamAvenger = api; // browser
  }
})();
