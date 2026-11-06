import { lookup } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import ipaddr from "ipaddr.js";
import { DomainError, type Evidence } from "@revisionpay/domain";
import { canonical, sealEvidence, sha256 } from "@revisionpay/domain/crypto";

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let ip = ipaddr.parse(address);
  if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())
    ip = (ip as ipaddr.IPv6).toIPv4Address();
  return ip.range() === "unicast";
}
export function validateCaptureUrl(
  raw: string,
  allowedHosts: string[],
  allowLocal = false,
): URL {
  const u = new URL(raw);
  const local =
    allowLocal &&
    !process.env.VERCEL &&
    ["localhost", "127.0.0.1"].includes(u.hostname);
  if (
    u.username ||
    u.password ||
    u.hash ||
    (!local &&
      (u.protocol !== "https:" ||
        u.port ||
        ipaddr.isValid(u.hostname.replace(/[\[\]]/g, "")))) ||
    (!local && !allowedHosts.includes(u.hostname)) ||
    (local && !["http:", "https:"].includes(u.protocol))
  ) {
    throw new DomainError(
      "SOURCE_NOT_ALLOWED",
      "This website is not approved for capture.",
      400,
    );
  }
  return u;
}
export async function collect(
  raw: string,
  requestId: string,
  options: { allowedHosts: string[]; allowLocal?: boolean },
) {
  const url = validateCaptureUrl(raw, options.allowedHosts, options.allowLocal);
  const local = Boolean(
    options.allowLocal &&
      !process.env.VERCEL &&
      ["localhost", "127.0.0.1"].includes(url.hostname),
  );
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !local &&
    (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
  )
    throw new DomainError(
      "UNSAFE_DESTINATION",
      "The website resolves to an unsupported address.",
      400,
    );
  const chosen = addresses.find((a) => a.family === 4) || addresses[0];
  const profile = "/tmp/revisionpay-browser-" + randomUUID();
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    executablePath,
    args: [
      ...chromium.args,
      "--disable-features=DnsOverHttps",
      "--host-resolver-rules=MAP " +
        url.hostname +
        " " +
        (chosen.family === 6 ? "[" + chosen.address + "]" : chosen.address) +
        ", MAP * ~NOTFOUND",
    ],
    headless: "shell",
    userDataDir: profile,
    env: Object.fromEntries(
      ["PATH", "LD_LIBRARY_PATH", "FONTCONFIG_PATH", "LANG"]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k]!]),
    ),
    protocolTimeout: 25000,
  });
  const watchdog = setTimeout(() => {
    void browser.close().catch(() => undefined);
  }, 35000);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.emulateTimezone("UTC");
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await page.setBypassServiceWorker(true);
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    const blocked = new Set<string>();
    let requests = 0;
    page.on("request", (r) => {
      const target = r.url();
      let permitted = false;
      try {
        const u = new URL(target);
        permitted =
          ++requests <= 100 &&
          ["GET", "HEAD"].includes(r.method()) &&
          (u.origin === url.origin || u.protocol === "data:") &&
          !["media", "websocket"].includes(r.resourceType());
      } catch {
        /* fail closed */
      }
      if (!permitted) {
        blocked.add(r.resourceType());
        void r.abort().catch(() => undefined);
      } else void r.continue().catch(() => undefined);
    });
    browser.on("targetcreated", async (t) => {
      if (t.type() === "page") {
        const p = await t.page();
        if (p && p !== page) await p.close().catch(() => undefined);
      }
    });
    const response = await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    if (
      !response ||
      response.status() >= 400 ||
      new URL(page.url()).origin !== url.origin
    )
      throw new DomainError(
        "CAPTURE_FAILED",
        "The agreed page could not be loaded completely.",
      );
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    const extracted = await page.evaluate(() => {
      const root = document.body;
      const seen = new Map<Element, string[]>();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        const text = n.textContent?.replace(/\s+/g, " ").trim();
        if (!p || !text || p.closest("script, style, noscript, template"))
          continue;
        if (
          !p.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        )
          continue;
        const container =
          p.closest("h1,h2,h3,h4,p,li,button,a,[data-rp-evidence]") || p;
        const existing = seen.get(container) || [];
        existing.push(text);
        seen.set(container, existing);
      }
      const blocks = Array.from(seen).map(([el, parts], i) => ({
        id: "block:" + (i + 1),
        text: parts.join(" "),
        kind: /^H[1-6]$/.test(el.tagName)
          ? "heading"
          : el.tagName === "LI"
            ? "list"
            : ["A", "BUTTON"].includes(el.tagName)
              ? "button"
              : el.tagName === "P"
                ? "paragraph"
                : "text",
      }));
      const anchors = Array.from(
        root.querySelectorAll<HTMLAnchorElement>("a[href]"),
      ).filter(
        (a) =>
          a.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
          a.innerText.trim(),
      );
      const primary =
        anchors.find((a) => a.hasAttribute("data-primary")) ||
        anchors.find((a) => a.closest("main")) ||
        anchors[0];
      const links = anchors.map((a, i) => ({
        id: "link:" + (i + 1),
        text: a.innerText.replace(/\s+/g, " ").trim(),
        href: a.href,
        primary: a === primary,
      }));
      return {
        title: document.title,
        blocks,
        links,
        height: document.documentElement.scrollHeight,
      };
    });
    if (
      extracted.height > 6000 ||
      extracted.blocks.length > 120 ||
      extracted.links.length > 80 ||
      Buffer.byteLength(
        canonical({ blocks: extracted.blocks, links: extracted.links }),
      ) > 12288
    )
      throw new DomainError(
        "PAGE_TOO_LARGE",
        "Use one concise pricing or service page (up to 12 KiB of text and links).",
      );
    if (!extracted.blocks.length)
      throw new DomainError(
        "EMPTY_EVIDENCE",
        "The page did not provide readable content.",
      );
    const screenshot = Buffer.from(
      await page.screenshot({ type: "jpeg", quality: 55, fullPage: true }),
    );
    if (screenshot.length > 524288)
      throw new DomainError(
        "SCREENSHOT_TOO_LARGE",
        "The page screenshot exceeds the evidence limit.",
      );
    const criticalBlocked = [...blocked].some((type) =>
      ["document", "stylesheet", "script", "fetch", "xhr"].includes(type),
    );
    const evidence = sealEvidence({
      schemaVersion: "1",
      requestId,
      sourceUrl: url.href,
      finalUrl: page.url(),
      capturedAt: new Date().toISOString(),
      policyVersion: "copy-v1",
      viewport: { width: 1440, height: 1000 },
      title: extracted.title.slice(0, 240),
      blocks: extracted.blocks as Evidence["blocks"],
      links: extracted.links,
      complete: !criticalBlocked,
      warnings: blocked.size
        ? [
            "Some requests were blocked by the agreed capture policy: " +
              [...blocked].join(", "),
          ]
        : [],
      screenshotHash: sha256(screenshot),
      collector: "browser",
    });
    return { evidence, screenshotBase64: screenshot.toString("base64") };
  } finally {
    clearTimeout(watchdog);
    await browser.close().catch(() => undefined);
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}
