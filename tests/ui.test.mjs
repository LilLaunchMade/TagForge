// Tests the real production React bundle with a mocked native IPC boundary.
// No desktop app is launched. Chromium runs in headless mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
test("headless edit, preview, save and library virtualization", async () => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const p = path.resolve(
        "dist",
        "." + (url.pathname === "/" ? "/index.html" : url.pathname),
      );
      if (!p.startsWith(path.resolve("dist") + path.sep))
        throw Error("invalid path");
      const content = await readFile(p);
      res.setHeader(
        "Content-Type",
        p.endsWith(".js")
          ? "text/javascript"
          : p.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 920 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      const fieldNames = [
        "title",
        "artist",
        "album",
        "albumArtist",
        "genre",
        "year",
        "track",
        "disc",
        "trackTotal",
        "discTotal",
        "comment",
        "lyrics",
      ];
      const tracks = Array.from({ length: 3000 }, (_, i) => ({
        path: `C:/Music/${i}.mp3`,
        name: `${String(i).padStart(4, "0")}.mp3`,
        format: "MP3",
        duration: 180,
        bytes: 1000,
        hasArt: false,
        fingerprint: `hash${i}`,
        fields: Object.fromEntries(
          fieldNames.map((k) => [
            k,
            k === "title"
              ? `Song ${i}`
              : k === "artist"
                ? "An Artist"
                : k === "album"
                  ? "An Album"
                  : "",
          ]),
        ),
      }));
      window.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main" },
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (cmd, args) => {
          if (cmd === "choose_paths") return ["C:/Music"];
          if (cmd === "import_paths") return { tracks, errors: [] };
          if (cmd === "artwork") return null;
          if (cmd === "save_change") {
            window.__lastSaved = args.change;
            const t = tracks.find((t) => t.path === args.change.path);
            return {
              ...t,
              fields: { ...t.fields, ...args.change.fields },
              fingerprint: "saved",
            };
          }
          if (cmd === "plugin:event|listen") return 1;
          return null;
        },
      };
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: () => {},
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page
      .getByRole("button", { name: "＋ Add music", exact: true })
      .click();
    await page.getByText("3,000 tracks", { exact: true }).waitFor();
    assert.ok(
      (await page.locator(".track").count()) < 40,
      "Only a window of rows should render",
    );
    await page
      .getByRole("checkbox", { name: "Select 0000.mp3", exact: true })
      .check();
    const title = page
      .locator(".fields label")
      .filter({ has: page.getByText("Title", { exact: true }) });
    await title.locator("input:not([type=checkbox])").fill("Edited song");
    await page
      .getByRole("button", { name: "Stage selected fields", exact: true })
      .click();
    await page.getByRole("button", { name: /Review & save/ }).click();
    await page
      .getByRole("dialog")
      .getByText("Edited song", { exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.__lastSaved),
      undefined,
      "Preview must not write",
    );
    await page
      .getByRole("button", { name: "Approve & write 1 files", exact: true })
      .click();
    await page.getByText(/Saved 1 of 1 files/).waitFor();
    assert.equal(
      await page.evaluate(() => window.__lastSaved.fields.title),
      "Edited song",
    );
    await page.getByRole("button", { name: "Rename", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Template", { exact: true })
      .fill("{artist} - {title}");
    await page
      .getByRole("button", { name: "Stage changes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "From filename", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Stage changes", exact: true })
      .click();
    await page.getByRole("button", { name: "Number", exact: true }).click();
    await page
      .getByRole("spinbutton", { name: "First track number" })
      .fill("7");
    await page
      .getByRole("button", { name: "Stage changes", exact: true })
      .click();
    await page.getByRole("button", { name: /Review & save/ }).click();
    await page
      .getByRole("dialog")
      .locator("ins")
      .filter({ hasText: "An Artist - Edited song.mp3" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("dialog")
        .locator("article>div")
        .filter({ has: page.getByText("Track", { exact: true }) })
        .locator("ins")
        .innerText(),
      "7",
    );
    await page
      .getByRole("button", { name: "Discard all staged", exact: true })
      .click();
    if (process.env.TAGFORGE_CAPTURE_DIR)
      await page.screenshot({
        path: path.join(process.env.TAGFORGE_CAPTURE_DIR, "tagforge-dark.png"),
      });
    await page.getByRole("button", { name: "☀ Light", exact: true }).click();
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    if (process.env.TAGFORGE_CAPTURE_DIR)
      await page.screenshot({
        path: path.join(process.env.TAGFORGE_CAPTURE_DIR, "tagforge-light.png"),
      });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page
      .getByRole("checkbox", { name: "Keep recovery backups after closing" })
      .uncheck();
    assert.equal(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("retainBackups")),
      ),
      false,
    );
    await page
      .getByRole("checkbox", { name: "Keep recovery backups after closing" })
      .check();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Search library" })
      .fill("Song 2999");
    await page.getByText("Song 2999", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
});
