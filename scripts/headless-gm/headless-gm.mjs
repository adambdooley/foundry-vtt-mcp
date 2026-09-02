#!/usr/bin/env node
// Headless Foundry GM client that keeps the MCP bridge module connected 24/7.
//
// Runs a headless Chrome next to the Foundry server, logs in as a dedicated GM
// user and stays on the /game page. The bridge module inside that page connects
// to the MCP backend on localhost, so the bridge no longer depends on anyone's
// browser being open. Handles world restarts (/join, /setup) and page crashes by
// re-logging in with backoff.
//
// Env: FOUNDRY_URL (http://127.0.0.1:30000), FOUNDRY_USER, FOUNDRY_PASSWORD,
//      HEADLESS_NO_CANVAS=1 to disable canvas rendering for the bot client.

import puppeteer from 'puppeteer';

const FOUNDRY_URL = (process.env.FOUNDRY_URL || 'http://127.0.0.1:30000').replace(/\/$/, '');
const FOUNDRY_USER = process.env.FOUNDRY_USER || '';
const FOUNDRY_PASSWORD = process.env.FOUNDRY_PASSWORD || '';
const NO_CANVAS = process.env.HEADLESS_NO_CANVAS === '1';
const PROFILE_DIR = process.env.HEADLESS_PROFILE_DIR || new URL('./profile', import.meta.url).pathname;
const POLL_MS = 15000;

if (!FOUNDRY_USER || !FOUNDRY_PASSWORD) {
  console.error('FOUNDRY_USER and FOUNDRY_PASSWORD are required');
  process.exit(2);
}

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch() {
  const browser = await puppeteer.launch({
    headless: true,
    // Persistent profile: Foundry client settings (noCanvas, maxFPS) live in localStorage.
    userDataDir: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Foundry needs WebGL even on the join page (PIXI probes it); software GL via SwiftShader.
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,800',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('foundry-mcp-bridge') || msg.type() === 'error') log('[page]', msg.type(), text.slice(0, 300));
  });
  page.on('pageerror', err => log('[pageerror]', String(err).slice(0, 300)));
  // A blank tab that takes the foreground once the game is ready: Chrome throttles painting
  // and rAF in background tabs, which stops SwiftShader from compositing the Foundry UI at
  // full frame rate. The join page needs rAF to render its form, so it stays in front until
  // login completes. Sockets and query handling keep working in the background tab.
  const idle = await browser.newPage();
  await idle.goto('about:blank').catch(() => {});
  await page.bringToFront().catch(() => {});
  return { browser, page, idle };
}

async function readState(page) {
  try {
    return await page.evaluate(() => ({
      path: location.pathname,
      ready: Boolean(globalThis.game && globalThis.game.ready),
      user: globalThis.game?.user?.name ?? null,
      bridge: globalThis.foundryMCPBridge?.getStatus?.() ?? null,
    }));
  } catch (error) {
    return { error: String(error) };
  }
}

async function seedClientSettings(page) {
  // Foundry reads client-scoped settings from localStorage at init, so seeding them on the
  // join page means the game never renders the canvas at 60 fps before the loop catches up.
  await page.evaluate(noCanvas => {
    try {
      localStorage.setItem('core.maxFPS', '5');
      if (noCanvas) localStorage.setItem('core.noCanvas', 'true');
    } catch {}
  }, NO_CANVAS);
}

async function login(page) {
  await page.waitForSelector('select[name="userid"]', { timeout: 30000 });
  await seedClientSettings(page);
  const picked = await page.evaluate(name => {
    const select = document.querySelector('select[name="userid"]');
    const option = Array.from(select.options).find(o => o.textContent.trim() === name);
    if (!option) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, FOUNDRY_USER);
  if (!picked) {
    log(`user "${FOUNDRY_USER}" is missing from the join list (logged in elsewhere or not created)`);
    return false;
  }
  await page.click('input[name="password"]', { clickCount: 3 });
  await page.type('input[name="password"]', FOUNDRY_PASSWORD);
  const submitted = await page.evaluate(() => {
    const button =
      document.querySelector('button[name="join"]') ||
      document.querySelector('form#join-game button[type="submit"]') ||
      document.querySelector('form button[type="submit"]');
    if (!button) return false;
    button.click();
    return true;
  });
  if (!submitted) {
    log('join button not found');
    return false;
  }
  await page.waitForFunction(() => location.pathname.startsWith('/game'), { timeout: 60000 }).catch(() => {});
  return true;
}

async function applyClientSettings(page) {
  // Keep the software renderer cheap: low frame cap, or no canvas at all.
  const changed = await page.evaluate(async noCanvas => {
    let reload = false;
    // maxFPS onChange touches canvas.app.renderer, so only set it while a canvas exists
    if (!noCanvas && game.settings.get('core', 'maxFPS') !== 5) await game.settings.set('core', 'maxFPS', 5);
    if (noCanvas && !game.settings.get('core', 'noCanvas')) {
      await game.settings.set('core', 'noCanvas', true);
      reload = true;
    }
    return reload;
  }, NO_CANVAS);
  if (changed) {
    log('noCanvas enabled for this client, reloading');
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
}

async function main() {
  let { browser, page, idle } = await launch();
  let lastLogged = '';
  let failures = 0;
  let backgrounded = false;

  for (;;) {
    try {
      if (!browser.connected) throw new Error('browser disconnected');
      const state = await readState(page);
      const key = JSON.stringify({ p: state.path, r: state.ready, c: state.bridge?.connected ?? null, e: state.error ? 1 : 0 });
      if (key !== lastLogged) {
        log('state', JSON.stringify(state).slice(0, 400));
        lastLogged = key;
      }

      if (state.error || !state.path || state.path === 'blank') {
        await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } else if (state.path.startsWith('/join')) {
        if (backgrounded) {
          await page.bringToFront().catch(() => {});
          backgrounded = false;
        }
        await login(page);
      } else if (state.path.startsWith('/game')) {
        if (state.ready) {
          failures = 0;
          await applyClientSettings(page);
          if (!backgrounded && state.bridge?.connected) {
            await idle.bringToFront().catch(() => {});
            backgrounded = true;
            log('foundry tab moved to background');
          }
          const bridge = state.bridge;
          if (bridge && bridge.enabled && !bridge.connected && !bridge.actAsBridge) {
            log('actAsBridge is off for this client - enabling');
            await page.evaluate(() => game.settings.set('foundry-mcp-bridge', 'actAsBridge', true));
          }
        }
      } else {
        // /setup, /license, /auth or anything else: world is down, wait and retry
        await sleep(POLL_MS);
        await page.goto(`${FOUNDRY_URL}/join`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }
    } catch (error) {
      failures += 1;
      log('loop error', String(error).slice(0, 300), 'failures', failures);
      if (failures >= 3) {
        log('relaunching browser');
        try {
          await browser.close();
        } catch {}
        ({ browser, page, idle } = await launch());
        backgrounded = false;
        failures = 0;
      }
      await sleep(Math.min(POLL_MS * failures, 60000));
    }
    await sleep(POLL_MS);
  }
}

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

main().catch(error => {
  console.error('fatal', error);
  process.exit(1);
});
