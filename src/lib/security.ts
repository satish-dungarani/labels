/**
 * Client-side protection layer — ACTIVE ONLY IN PRODUCTION BUILDS.
 *
 * Development (`npm run dev`) is completely unaffected.
 *
 * Layers:
 *  1. file:// lock        — saved / offline copies are killed before the app boots
 *  2. host allow-list     — optional hard lock to specific domain(s)
 *  3. right-click shield  — context menu disabled (except inside form fields)
 *  4. shortcut blocking   — F12, DevTools combos, view-source, save, print
 *  5. DevTools watcher    — warning overlay + debugger trap while tools are open
 *  6. console mute        — console.log/info/debug silenced
 */

/* ------------------------------------------------------------------
 * DEPLOYMENT CONFIG — the only knobs you should ever need to touch.
 * ------------------------------------------------------------------ */

/**
 * Hard lock the app to your live domain(s). Leave EMPTY to allow any host.
 * Examples: ["labels.yourshop.com", "www.yourshop.com"]
 * NOTE: localhost / 127.0.0.1 / *.local are ALWAYS allowed, so your own
 * preview keeps working even with this filled in.
 */
const PRODUCTION_HOSTS: string[] = [];

/**
 * When DevTools is detected open, spam `debugger` statements so stepping
 * through the code becomes painful. Only fires while tools are open.
 */
const ARM_DEBUGGER_TRAP = true;

/* ------------------------------------------------------------------ */

const DEVTOOLS_THRESHOLD_PX = 160;
const DEVTOOLS_POLL_MS = 1200;

let installed = false;

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

/** Replaces the entire document with a static "blocked" page and halts load. */
function renderBlockedPage(title: string, message: string): void {
  const markup = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SATISH-LABEL</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0f16; font-family: system-ui, -apple-system, sans-serif; }
  body { display: flex; align-items: center; justify-content: center; }
  .card { max-width: 420px; text-align: center; padding: 40px 32px; border: 1px solid rgba(148,163,184,.18);
          border-radius: 20px; background: rgba(30,41,59,.5); }
  .shield { width: 56px; height: 56px; margin: 0 auto 20px; border-radius: 16px; display: flex; align-items: center;
            justify-content: center; background: rgba(249,115,22,.12); border: 1px solid rgba(249,115,22,.3); }
  h1 { color: #fff; font-size: 18px; margin: 0 0 10px; letter-spacing: .5px; }
  p { color: #8b94a3; font-size: 13px; line-height: 1.6; margin: 0; }
  .brand { color: #525c6b; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; margin-top: 24px; }
</style>
</head>
<body>
  <div class="card">
    <div class="shield">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      </svg>
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="brand">SATISH-LABEL</p>
  </div>
</body>
</html>`;

  try {
    document.open();
    document.write(markup);
    document.close();
  } catch {
    document.documentElement.innerHTML = "";
    document.body.innerHTML = `<div style="color:#fff;font-family:sans-serif;padding:40px;text-align:center"><h1>${title}</h1><p>${message}</p></div>`;
  }
  try {
    window.stop();
  } catch {
    /* noop */
  }
}

/** DevTools keyboard shortcuts + view/save/print combos. */
function isBlockedCombo(e: KeyboardEvent): boolean {
  if (e.key === "F12") return true;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return false;
  const key = e.key.toLowerCase();
  // Ctrl/Cmd+Shift+I / J / C / K / E  → DevTools panels
  if (e.shiftKey && ["i", "j", "c", "k", "e"].includes(key)) return true;
  // Ctrl/Cmd+U view-source · Ctrl/Cmd+S save page · Ctrl/Cmd+P print
  if (["u", "s", "p"].includes(key)) return true;
  return false;
}

function installKeyShield(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (isBlockedCombo(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}

function installContextShield(): void {
  document.addEventListener(
    "contextmenu",
    (e) => {
      const target = e.target as HTMLElement | null;
      // Keep the menu inside form fields so paste/copy still works there.
      if (target?.closest("input, textarea, select")) return;
      e.preventDefault();
    },
    true,
  );
}

function muteConsole(): void {
  for (const method of ["log", "info", "debug"] as const) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (console as any)[method] = () => {};
    } catch {
      /* noop */
    }
  }
}

function installDevtoolsWatch(): void {
  let overlay: HTMLDivElement | null = null;

  const showOverlay = () => {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.setAttribute(
      "style",
      "position:fixed;inset:0;z-index:2147483647;background:rgba(11,15,22,0.96);" +
        "display:flex;align-items:center;justify-content:center;" +
        "font-family:system-ui,-apple-system,sans-serif;pointer-events:all;",
    );
    overlay.innerHTML = `
      <div style="text-align:center;max-width:400px;padding:32px">
        <div style="width:56px;height:56px;margin:0 auto 20px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:rgba(249,115,22,.12);border:1px solid rgba(249,115,22,.3)">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
          </svg>
        </div>
        <h2 style="color:#fff;font-size:16px;margin:0 0 8px">Inspection paused</h2>
        <p style="color:#8b94a3;font-size:12px;line-height:1.6;margin:0">
          Please close the browser developer tools to continue using SATISH-LABEL.
        </p>
      </div>`;
    document.body.appendChild(overlay);
  };

  const hideOverlay = () => {
    overlay?.remove();
    overlay = null;
  };

  const check = () => {
    const widthDiff = Math.abs(window.outerWidth - window.innerWidth);
    const heightDiff = Math.abs(window.outerHeight - window.innerHeight);
    const devtoolsLikelyOpen =
      widthDiff > DEVTOOLS_THRESHOLD_PX || heightDiff > DEVTOOLS_THRESHOLD_PX;

    if (devtoolsLikelyOpen) {
      showOverlay();
      if (ARM_DEBUGGER_TRAP) {
        // Fires only while tools are open; makes stepping through code painful.
        debugger;
      }
    } else {
      hideOverlay();
    }
  };

  window.setInterval(check, DEVTOOLS_POLL_MS);
  window.addEventListener("resize", check);
}

/**
 * Installs all protections. Returns `false` when the app must NOT boot
 * (blocked environment — saved copy or disallowed host).
 */
export function installPageProtection(): boolean {
  if (installed) return true;
  installed = true;

  // Never interfere with local development.
  if (import.meta.env.DEV) return true;

  /* 1 — Kill saved / offline copies immediately. */
  if (location.protocol === "file:") {
    renderBlockedPage(
      "Offline copy disabled",
      "This application is licensed for online use only and cannot run from a saved or local copy. " +
        "Please open it from its official web address.",
    );
    return false;
  }

  /* 2 — Optional hard domain lock. */
  if (
    PRODUCTION_HOSTS.length > 0 &&
    !isLoopbackHost(location.hostname) &&
    !PRODUCTION_HOSTS.includes(location.hostname)
  ) {
    renderBlockedPage(
      "Unauthorised location",
      "This copy of the application is not running from an authorised web address. " +
        "Please use the official deployment.",
    );
    return false;
  }

  /* 3-6 — Passive shields. */
  installContextShield();
  installKeyShield();
  muteConsole();
  installDevtoolsWatch();

  return true;
}
