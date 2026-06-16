/**
 * HomeCanvas — Electron main process.
 *
 * Packaging strategy: the existing Vite SPA + Hono sidecar run unchanged. This
 * process starts the sidecar IN-PROCESS (it's a Node HTTP server) and points a
 * single BrowserWindow at it, so the renderer loads the UI and hits /api on ONE
 * origin (http://127.0.0.1:<port>) — no CORS, no proxy. The sidecar serves the
 * built SPA (HOMECANVAS_STATIC_DIR) and writes data under app-data
 * (HOMECANVAS_DATA_DIR), since the .app bundle itself is read-only.
 */
import { app, BrowserWindow, shell, dialog } from 'electron';
import path from 'node:path';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

// Same app name in dev and packaged → same app-data dir
// (~/Library/Application Support/HomeCanvas).
app.setName('HomeCanvas');

let activePort = 4871;

/** First try the preferred port; if it's taken, let the OS pick a free one. */
function getFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => {
      const any = net.createServer();
      any.listen(0, '127.0.0.1', () => {
        const p = (any.address() as net.AddressInfo).port;
        any.close(() => resolve(p));
      });
    });
    probe.listen(preferred, '127.0.0.1', () => {
      probe.close(() => resolve(preferred));
    });
  });
}

/** Poll the sidecar's health endpoint until it's listening (or time out). */
async function waitForHealth(port: number, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function createWindow(port: number): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false, // avoid blank flash; show on first paint
    backgroundColor: '#ffffff',
    title: 'HomeCanvas',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Keep the app a single-origin shell: open external links in the real browser,
  // never let in-window navigation leave the local sidecar origin.
  const appOrigin = `http://127.0.0.1:${port}`;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Block any in-window navigation/redirect that leaves the local sidecar origin.
  // Compare PARSED origins, not a string prefix — `http://127.0.0.1:PORT@evil.com`
  // starts with the app origin but resolves to evil.com (userinfo trick).
  const allowOnlyAppOrigin = (e: { preventDefault: () => void }, url: string) => {
    let origin = '';
    try {
      origin = new URL(url).origin;
    } catch {
      // unparseable URL → treat as off-origin and block
    }
    if (origin !== appOrigin) {
      e.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:')) void shell.openExternal(url);
    }
  };
  win.webContents.on('will-navigate', allowOnlyAppOrigin);
  win.webContents.on('will-redirect', allowOnlyAppOrigin);

  void win.loadURL(`${appOrigin}/`);
}

app.whenReady().then(async () => {
  activePort = await getFreePort(4871);

  // Hand the sidecar its runtime config, then start it in this process.
  process.env.HOMECANVAS_PORT = String(activePort);
  process.env.HOMECANVAS_DATA_DIR = app.getPath('userData');
  process.env.HOMECANVAS_STATIC_DIR = path.join(__dirname, '..', 'dist');
  process.env.HOMECANVAS_BLENDER_SCRIPT = path.join(__dirname, '..', 'scripts', 'render-blender.py');
  await import(pathToFileURL(path.join(__dirname, 'sidecar.cjs')).href);

  const healthy = await waitForHealth(activePort);
  if (!healthy) {
    dialog.showErrorBox('HomeCanvas', 'The local engine failed to start. Please reopen the app.');
    app.quit();
    return;
  }
  createWindow(activePort);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(activePort);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
