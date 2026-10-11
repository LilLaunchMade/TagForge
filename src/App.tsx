import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  capitalize,
  duplicatePaths,
  duration,
  effective,
  fields,
  labels,
  parseFilename,
  normalizeFields,
  renderName,
  type Draft,
  type Field,
  type Track,
} from "./model";

type Tool =
  | "rename"
  | "filename"
  | "replace"
  | "case"
  | "number"
  | "lookup"
  | "settings"
  | "help"
  | "review"
  | null;
type Recording = {
  id: string;
  title: string;
  length?: number;
  "artist-credit"?: { name: string; joinphrase?: string }[];
  releases?: { id: string; title: string; date?: string }[];
};
const native = () =>
  !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
const initialColumns = [
  "title",
  "artist",
  "album",
  "track",
  "year",
  "format",
  "duration",
  "name",
];
const optionalColumns = [...fields, "format", "duration", "name", "path"];
const columnLabel = (c: string) =>
  labels[c as Field] ??
  { format: "Format", duration: "Time", name: "Filename", path: "Location" }[
    c
  ] ??
  c;
function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [history, setHistory] = useState<Record<string, Draft>[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [sort, setSort] = useState({ key: "name", asc: true }),
    [scroll, setScroll] = useState(0),
    [height, setHeight] = useState(440);
  const [columns, setColumns] = useState<string[]>(() =>
      load("columns", initialColumns),
    ),
    [theme, setTheme] = useState(() => load("theme", "dark"));
  const [tool, setTool] = useState<Tool>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [notice, setNotice] = useState("Ready. Your music stays on this computer."),
    [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<Partial<Record<Field, string>>>({}),
    [checked, setChecked] = useState<Set<Field>>(new Set()),
    [art, setArt] = useState<string | undefined>(),
    [preview, setPreview] = useState<string>(),
    [panel, setPanel] = useState(330);
  const [template, setTemplate] = useState("{track:02} - {title}"),
    [targetField, setTargetField] = useState<Field>("title"),
    [find, setFind] = useState(""),
    [replacement, setReplacement] = useState(""),
    [caseMode, setCaseMode] = useState("title"),
    [start, setStart] = useState(1);
  const [contact, setContact] = useState(() => load("contact", "")),
    [lookup, setLookup] = useState(""),
    [results, setResults] = useState<Recording[]>([]),
    [savedUndo, setSavedUndo] = useState(0);
  const [retainBackups, setRetainBackups] = useState(() =>
    load("retainBackups", true),
  );
  const viewport = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    latest = useRef({ drafts, busy });
  latest.current = { drafts, busy };
  const chosen = useMemo(
    () => tracks.filter((t) => selected.has(t.path)),
    [tracks, selected],
  );
  const current = chosen[0];
  const duplicates = useMemo(
    () => duplicatePaths(tracks.map((t) => effective(t, drafts[t.path]))),
    [tracks, drafts],
  );
  const dirty = Object.keys(drafts).length;
  const visible = useMemo(
    () =>
      tracks
        .filter((t) => {
          const e = effective(t, drafts[t.path]);
          const search = [t.name, t.path, ...Object.values(e.fields)]
            .join(" ")
            .toLocaleLowerCase();
          return (
            search.includes(query.toLocaleLowerCase()) &&
            (filter === "all" ||
              (filter === "missing" &&
                ["title", "artist", "album"].some(
                  (k) => !e.fields[k as Field].trim(),
                )) ||
              (filter === "duplicates" && duplicates.has(t.path)) ||
              (filter === "changed" && !!drafts[t.path]))
          );
        })
        .sort((a, b) => {
          const x = effective(a, drafts[a.path]),
            y = effective(b, drafts[b.path]);
          const val = (t: Track) =>
            String(
              t.fields[sort.key as Field] ?? t[sort.key as keyof Track] ?? "",
            );
          return (
            val(x).localeCompare(val(y), undefined, { numeric: true }) *
            (sort.asc ? 1 : -1)
          );
        }),
    [tracks, drafts, query, filter, duplicates, sort],
  );
  const first = Math.max(0, Math.floor(scroll / 44) - 6),
    count = Math.ceil(height / 44) + 12;
  const grid = `38px ${columns.map((c) => (c === "title" || c === "name" ? "minmax(190px, 1.4fr)" : c === "path" ? "340px" : c === "album" || c === "artist" ? "minmax(160px, 1fr)" : "100px")).join(" ")}`;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", JSON.stringify(theme));
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("columns", JSON.stringify(columns));
  }, [columns]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setForm({});
    setChecked(new Set());
    setArt(undefined);
    setPreview(undefined);
    if (!current || !native()) return;
    let cancelled = false;
    invoke<string | null>("artwork", { path: current.path })
      .then((v) => {
        if (!cancelled) setPreview(v ?? undefined);
      })
      .catch((e) => {
        if (!cancelled) setNotice(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [current?.path, current?.fingerprint, chosen.length]);
  useEffect(() => {
    if (!native()) return;
    let active = true;
    const stops: (() => void)[] = [];
    const attach = (p: Promise<() => void>) => {
      p.then((f) => {
        if (active) stops.push(f);
        else f();
      });
    };
    attach(
      listen<{ done: number; total: number }>("progress", (e) =>
        setProgress(e.payload),
      ),
    );
    attach(
      getCurrentWindow().onDragDropEvent((e) => {
        if (e.payload.type === "drop") void importPaths(e.payload.paths);
      }),
    );
    attach(
      getCurrentWindow().onCloseRequested(async (e) => {
        if (latest.current.busy) {
          e.preventDefault();
          setNotice("Wait for the current operation to finish before closing.");
        } else if (
          Object.keys(latest.current.drafts).length &&
          !window.confirm("Discard unsaved staged changes and close TagForge?")
        )
          e.preventDefault();
      }),
    );
    return () => {
      active = false;
      stops.forEach((f) => f());
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!busy && dirty) setTool("review");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (!busy) void choose(false);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        if (!busy) undoDraft();
      }
      if (e.key === "Escape" && !busy) setTool(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  async function task<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (latest.current.busy) return;
    latest.current.busy = true;
    setBusy(true);
    setErrors([]);
    try {
      return await fn();
    } catch (e) {
      setErrors([String(e)]);
      setNotice("Operation stopped. See details below.");
    } finally {
      latest.current.busy = false;
      setBusy(false);
    }
  }
  async function importPaths(paths: string[]) {
    if (!paths.length) return;
    await task(async () => {
      setNotice("Reading local music files…");
      setProgress({ done: 0, total: 0 });
      const r = await invoke<{
        tracks: Track[];
        errors: { path: string; error: string }[];
      }>("import_paths", { paths });
      setTracks((old) => {
        const map = new Map(old.map((t) => [t.path, t]));
        r.tracks.forEach((t) => map.set(t.path, t));
        return [...map.values()];
      });
      setErrors(r.errors.map((e) => `${e.path}: ${e.error}`));
      setNotice(
        `Imported ${r.tracks.length} files. ${r.errors.length} could not be read.`,
      );
    });
  }
  async function choose(folder: boolean) {
    if (!native()) {
      setNotice(
        "Open the installed desktop app to import local music. This browser build cannot edit files.",
      );
      return;
    }
    let paths: string[] | undefined;
    await task(async () => {
      paths = await invoke<string[]>("choose_paths", { folder });
    });
    if (paths) await importPaths(paths);
  }
  function stage(updates: Record<string, Draft>) {
    setHistory((h) => [...h.slice(-19), drafts]);
    setDrafts((old) => {
      const next = { ...old };
      for (const [path, d] of Object.entries(updates))
        next[path] = {
          ...old[path],
          ...d,
          fields: { ...old[path]?.fields, ...normalizeFields(d.fields) },
        };
      return next;
    });
    setNotice(
      `Staged changes for ${Object.keys(updates).length} files. Review before saving.`,
    );
  }
  function undoDraft() {
    if (history.length) {
      setDrafts(history[history.length - 1]);
      setHistory(history.slice(0, -1));
      setNotice("Last staging operation undone.");
    }
  }
  function applyForm() {
    const patch = Object.fromEntries(
      [...checked].map((f) => [f, form[f] ?? ""]),
    );
    stage(
      Object.fromEntries(
        chosen.map((t) => [
          t.path,
          { fields: patch, ...(art !== undefined ? { artwork: art } : {}) },
        ]),
      ),
    );
    setChecked(new Set());
    setArt(undefined);
  }
  function stageTool() {
    try {
      const updates: Record<string, Draft> = {};
      const ordered = visible.filter((t) => selected.has(t.path));
      ordered.forEach((t, i) => {
        const e = effective(t, drafts[t.path]);
        let d: Draft = { fields: {} };
        if (tool === "rename") d.newName = renderName(template, e);
        if (tool === "filename") d.fields = parseFilename(template, e.name);
        if (tool === "replace") {
          if (!find) throw Error("Enter text to find");
          d.fields[targetField] = e.fields[targetField]
            .split(find)
            .join(replacement);
        }
        if (tool === "case")
          d.fields[targetField] = capitalize(e.fields[targetField], caseMode);
        if (tool === "number") {
          if (
            !Number.isInteger(start) ||
            start < 1 ||
            start + ordered.length > 4294967295
          )
            throw Error("Choose a valid positive starting number");
          d.fields.track = String(start + i);
          d.fields.trackTotal = String(start + ordered.length - 1);
        }
        updates[t.path] = d;
      });
      stage(updates);
      setTool(null);
    } catch (e) {
      setErrors([String(e)]);
    }
  }
  async function save() {
    const pending = Object.entries(drafts);
    setTool(null);
    await task(async () => {
      setProgress({ done: 0, total: pending.length });
      const failures: string[] = [];
      let done = 0;
      for (const [path, d] of pending) {
        const t = tracks.find((t) => t.path === path);
        if (!t) continue;
        try {
          const result = await invoke<Track>("save_change", {
            change: { path, fingerprint: t.fingerprint, ...d, retainBackups },
          });
          setTracks((old) => old.map((x) => (x.path === path ? result : x)));
          setSelected((old) => {
            const n = new Set(old);
            if (n.delete(path)) n.add(result.path);
            return n;
          });
          setDrafts((old) => {
            const n = { ...old };
            delete n[path];
            return n;
          });
          setSavedUndo((n) => n + 1);
        } catch (e) {
          failures.push(`${t.name}: ${e}`);
        }
        setProgress({ done: ++done, total: pending.length });
      }
      setHistory([]);
      setErrors(failures);
      setNotice(
        `Saved ${done - failures.length} of ${pending.length} files. ${retainBackups ? "Recovery backups are beside the originals." : "Session recovery copies will be removed on normal exit."}`,
      );
    });
  }
  async function undoSaved() {
    if (dirty) {
      setNotice("Discard or save staged changes before restoring saved files.");
      return;
    }
    await task(async () => {
      const r = await invoke<{ previousPath: string; track: Track }>(
        "undo_saved",
      );
      const t = r.track;
      setTracks((old) => [
        ...old.filter((x) => x.path !== t.path && x.path !== r.previousPath),
        t,
      ]);
      setSavedUndo((n) => Math.max(0, n - 1));
      setSelected(new Set([t.path]));
      setNotice(`Restored ${t.name} from its recovery backup.`);
    });
  }
  async function reloadSelected() {
    if (
      chosen.some((t) => drafts[t.path]) &&
      !window.confirm(
        "Discard staged edits for selected tracks and reread them from disk?",
      )
    )
      return;
    await task(async () => {
      const r = await invoke<{
        tracks: Track[];
        errors: { path: string; error: string }[];
      }>("reload_paths", { paths: chosen.map((t) => t.path) });
      const replacements = new Map(r.tracks.map((t) => [t.path, t]));
      setTracks((old) => old.map((t) => replacements.get(t.path) ?? t));
      setDrafts((old) =>
        Object.fromEntries(
          Object.entries(old).filter(([p]) => !replacements.has(p)),
        ),
      );
      setHistory([]);
      setErrors(r.errors.map((e) => `${e.path}: ${e.error}`));
      setNotice(`Reloaded ${r.tracks.length} tracks from disk.`);
    });
  }
  function toggle(path: string, shift: boolean) {
    setSelected((old) => {
      const n = new Set(old);
      if (shift && current) {
        const a = visible.findIndex((t) => t.path === current.path),
          b = visible.findIndex((t) => t.path === path);
        visible
          .slice(Math.min(a, b), Math.max(a, b) + 1)
          .forEach((t) => n.add(t.path));
      } else if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }
  async function readImage(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 20 * 1024 * 1024
    ) {
      setErrors(["Choose a JPEG or PNG image up to 20 MB."]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setArt(String(reader.result));
    reader.readAsDataURL(file);
  }
  async function search() {
    localStorage.setItem("contact", JSON.stringify(contact));
    await task(async () => {
      const r = await invoke<{ recordings: Recording[] }>("search_metadata", {
        query: lookup,
        contact,
      });
      setResults(r.recordings ?? []);
      setNotice("Choose a result to stage its metadata.");
    });
  }
  function stageRecording(r: Recording) {
    const release = r.releases?.[0];
    stage(
      Object.fromEntries(
        chosen.map((t) => [
          t.path,
          {
            fields: {
              title: r.title,
              artist: (r["artist-credit"] ?? [])
                .map((a) => a.name + (a.joinphrase ?? ""))
                .join(""),
              ...(release
                ? { album: release.title, year: release.date ?? "" }
                : {}),
            },
          },
        ]),
      ),
    );
    setNotice(
      "MusicBrainz metadata staged. Verify the release and recording before saving.",
    );
  }
  async function cover(id: string) {
    await task(async () => {
      const a = await invoke<string>("fetch_cover", { release: id, contact });
      stage(
        Object.fromEntries(
          chosen.map((t) => [t.path, { fields: {}, artwork: a }]),
        ),
      );
    });
  }
  const artValue =
    art ?? (current ? (drafts[current.path]?.artwork ?? preview) : undefined);
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="mark">
            T<span>F</span>
          </span>
          <div>
            TagForge<small>YOUR MUSIC. YOUR DETAILS.</small>
          </div>
          <span className="version">1.0</span>
        </div>
        <div className="header-right">
          <span className="local-dot" /> Local & private{" "}
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Switch color theme"
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <button onClick={() => setTool("settings")}>Settings</button>
          <button onClick={() => setTool("help")}>Help</button>
        </div>
      </header>
      <div className="toolbar">
        <button
          className="primary"
          disabled={busy}
          onClick={() => choose(false)}
        >
          ＋ Add music
        </button>
        <button disabled={busy} onClick={() => choose(true)}>
          Add folder
        </button>
        <span className="divider" />
        <button disabled={busy || !history.length} onClick={undoDraft}>
          ↶ Undo staged
        </button>
        <button disabled={busy || !savedUndo || !!dirty} onClick={undoSaved}>
          Restore last save
        </button>
        <button disabled={busy || !chosen.length} onClick={reloadSelected}>
          Reload selected
        </button>
        <div className="spacer" />
        <span className="muted">
          {dirty ? `${dirty} files with staged changes` : "All changes saved"}
        </span>
        <button
          className="save"
          disabled={busy || !dirty}
          onClick={() => setTool("review")}
        >
          Review & save {dirty > 0 && <b>{dirty}</b>}
        </button>
      </div>
      <main style={{ gridTemplateColumns: `${panel}px minmax(0,1fr)` }}>
        <aside>
          <div className="panel-heading">
            <div>
              <small>METADATA WORKBENCH</small>
              <h2>
                {chosen.length > 1
                  ? `${chosen.length} tracks selected`
                  : current
                    ? "Track details"
                    : "Make it yours"}
              </h2>
            </div>
            <span className="tag">{current?.format ?? "LOCAL"}</span>
          </div>
          <div className="artwork">
            {artValue ? (
              <img src={artValue} alt="Selected album artwork" />
            ) : (
              <div className="art-placeholder">
                ♫<small>Album artwork</small>
              </div>
            )}
            <div className="art-controls">
              <button
                disabled={!chosen.length || busy}
                onClick={() => fileInput.current?.click()}
              >
                Choose image
              </button>
              <button
                disabled={!chosen.length || busy}
                onClick={() => setArt("")}
              >
                Remove front
              </button>
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              void readImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="hint">
            Check a field to replace it on every selected track. An empty
            checked field clears its value.
            {chosen.some((t) => t.format === "M4A") &&
              " M4A has no front/back picture types: artwork operations replace or remove all its embedded covers."}
          </p>
          <div className="fields">
            {fields.map((f) => (
              <label
                key={f}
                className={f === "lyrics" || f === "comment" ? "wide" : ""}
              >
                <span>
                  <input
                    type="checkbox"
                    disabled={!chosen.length || busy}
                    checked={checked.has(f)}
                    onChange={(e) =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(f);
                        else n.delete(f);
                        return n;
                      })
                    }
                  />
                  {labels[f]}
                </span>
                {f === "lyrics" || f === "comment" ? (
                  <textarea
                    disabled={!chosen.length || busy}
                    rows={f === "lyrics" ? 4 : 2}
                    value={
                      form[f] ??
                      (chosen.length === 1
                        ? effective(current, drafts[current.path]).fields[f]
                        : "")
                    }
                    placeholder={chosen.length > 1 ? "Mixed / unchanged" : ""}
                    onChange={(e) => {
                      setForm((v) => ({ ...v, [f]: e.target.value }));
                      setChecked((s) => new Set([...s, f]));
                    }}
                  />
                ) : (
                  <input
                    disabled={!chosen.length || busy}
                    value={
                      form[f] ??
                      (chosen.length === 1
                        ? effective(current, drafts[current.path]).fields[f]
                        : "")
                    }
                    placeholder={chosen.length > 1 ? "Mixed / unchanged" : ""}
                    onChange={(e) => {
                      setForm((v) => ({ ...v, [f]: e.target.value }));
                      setChecked((s) => new Set([...s, f]));
                    }}
                  />
                )}
              </label>
            ))}
          </div>
          <button
            className="primary full"
            disabled={
              !chosen.length || busy || (!checked.size && art === undefined)
            }
            onClick={applyForm}
          >
            Stage selected fields
          </button>
          <div className="resize">
            <label>
              Panel width
              <input
                type="range"
                min="280"
                max="500"
                value={panel}
                onChange={(e) => setPanel(Number(e.target.value))}
              />
            </label>
          </div>
        </aside>
        <section className="library">
          <div className="library-title">
            <div>
              <small>LIBRARY</small>
              <h1>
                Your collection
                <span>{tracks.length.toLocaleString()} tracks</span>
              </h1>
            </div>
            <button
              disabled={busy || !tracks.length}
              onClick={async () => {
                if (
                  dirty &&
                  !window.confirm(
                    "Discard staged edits and clear the imported library? Files will stay on disk.",
                  )
                )
                  return;
                await task(async () => {
                  await invoke("clear_library");
                  setTracks([]);
                  setSelected(new Set());
                  setDrafts({});
                  setHistory([]);
                });
              }}
            >
              Clear library
            </button>
          </div>
          <div className="search-row">
            <input
              className="search"
              aria-label="Search library"
              placeholder="Search titles, artists, albums, or filenames…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setScroll(0);
                if (viewport.current) viewport.current.scrollTop = 0;
              }}
            />
            <select
              aria-label="Filter library"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setScroll(0);
                if (viewport.current) viewport.current.scrollTop = 0;
              }}
            >
              <option value="all">All music</option>
              <option value="missing">Missing details</option>
              <option value="duplicates">Possible duplicates</option>
              <option value="changed">Staged changes</option>
            </select>
            <button onClick={() => setTool("settings")}>Columns</button>
          </div>
          <div className="batchbar">
            <span>{selected.size} selected</span>
            {(
              [
                "rename",
                "filename",
                "replace",
                "case",
                "number",
                "lookup",
              ] as const
            ).map((t, i) => (
              <button
                key={t}
                disabled={busy || !chosen.length}
                onClick={() => {
                  setErrors([]);
                  setTool(t);
                  if (t === "filename") setTemplate("{artist} - {title}");
                  if (t === "rename") setTemplate("{track:02} - {title}");
                  if (t === "lookup" && current)
                    setLookup(
                      `${current.fields.artist} ${current.fields.title}`.trim(),
                    );
                }}
              >
                {
                  [
                    "Rename",
                    "From filename",
                    "Replace",
                    "Case",
                    "Number",
                    "Look up ↗",
                  ][i]
                }
              </button>
            ))}
          </div>
          <div
            className="table"
            ref={viewport}
            onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
            role="region"
            aria-label="Music library"
          >
            <div
              className="table-inner"
              style={{
                minWidth:
                  38 +
                  columns.reduce(
                    (s, c) =>
                      s +
                      (c === "path"
                        ? 340
                        : c === "title" || c === "name"
                          ? 190
                          : c === "artist" || c === "album"
                            ? 160
                            : 100),
                    0,
                  ),
              }}
            >
              <div
                className="row table-head"
                style={{ gridTemplateColumns: grid }}
              >
                <input
                  aria-label="Select all filtered tracks"
                  type="checkbox"
                  checked={
                    visible.length > 0 &&
                    visible.every((t) => selected.has(t.path))
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(visible.map((t) => t.path))
                        : new Set(),
                    )
                  }
                />
                {columns.map((c) => (
                  <button
                    key={c}
                    onClick={() =>
                      setSort((s) => ({
                        key: c,
                        asc: s.key === c ? !s.asc : true,
                      }))
                    }
                  >
                    {columnLabel(c)}{" "}
                    {sort.key === c ? (sort.asc ? "↑" : "↓") : ""}
                  </button>
                ))}
              </div>
              {tracks.length === 0 ? (
                <div className="empty">
                  <span className="empty-icon">♫</span>
                  <h2>A fresh home for your music.</h2>
                  <p>
                    Drop files or folders here to start shaping your collection.
                    <br />
                    MP3 · FLAC · M4A · WAV · OGG · Opus
                  </p>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => choose(false)}
                  >
                    Add your first tracks
                  </button>
                  <small>
                    Offline editing. No accounts. No audio re-encoding.
                  </small>
                </div>
              ) : visible.length === 0 ? (
                <div className="empty">
                  <h2>No matching tracks</h2>
                  <p>Try another search or filter.</p>
                </div>
              ) : (
                <div
                  style={{ height: visible.length * 44, position: "relative" }}
                >
                  {visible.slice(first, first + count).map((t, i) => {
                    const e = effective(t, drafts[t.path]);
                    return (
                      <div
                        key={t.path}
                        className={`row track ${selected.has(t.path) ? "selected" : ""} ${drafts[t.path] ? "dirty" : ""}`}
                        style={{
                          gridTemplateColumns: grid,
                          position: "absolute",
                          top: (first + i) * 44,
                          width: "100%",
                        }}
                      >
                        <input
                          aria-label={`Select ${t.name}`}
                          type="checkbox"
                          checked={selected.has(t.path)}
                          onChange={(event) =>
                            toggle(
                              t.path,
                              (event.nativeEvent as MouseEvent).shiftKey,
                            )
                          }
                        />
                        {columns.map((c) => (
                          <span
                            key={c}
                            title={String(
                              e.fields[c as Field] ?? e[c as keyof Track] ?? "",
                            )}
                            onClick={() => setSelected(new Set([t.path]))}
                          >
                            {c === "duration" ? (
                              duration(t.duration)
                            ) : c === "format" ? (
                              <em>{t.format}</em>
                            ) : (
                              (e.fields[c as Field] ??
                              String(e[c as keyof Track] ?? ""))
                            )}
                            {c === "title" && !e.fields.title && (
                              <i>Untitled</i>
                            )}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="library-bottom">
            <span>
              {visible.length} shown ·{" "}
              {duration(tracks.reduce((n, t) => n + t.duration, 0))} total
            </span>
            <span>
              {duplicates.size} possible duplicates ·{" "}
              {
                tracks.filter((t) =>
                  ["title", "artist", "album"].some(
                    (f) =>
                      !effective(t, drafts[t.path]).fields[f as Field].trim(),
                  ),
                ).length
              }{" "}
              missing details
            </span>
          </div>
        </section>
      </main>
      <footer>
        <span className={busy ? "working" : "local-dot"} />
        <span role="status">{notice}</span>
        {busy && progress.total > 0 && (
          <>
            <progress max={progress.total} value={progress.done} />
            <span>
              {progress.done}/{progress.total}
            </span>
          </>
        )}
        <span className="spacer" />
        <span>Ctrl+O Import · Ctrl+S Review · Ctrl+Z Undo</span>
      </footer>
      {errors.length > 0 && (
        <div className="errors" role="alert">
          <button aria-label="Dismiss errors" onClick={() => setErrors([])}>
            ×
          </button>
          <strong>
            {errors.length} issue{errors.length > 1 ? "s" : ""}
          </strong>
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {tool && (
        <div className="overlay">
          <section
            className={`dialog ${tool === "review" ? "review" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={tool === "review" ? "Review changes" : tool}
          >
            <div className="dialog-head">
              <h2>
                {
                  {
                    rename: "Rename files",
                    filename: "Metadata from filenames",
                    replace: "Find & replace",
                    case: "Change capitalization",
                    number: "Auto-number tracks",
                    lookup: "MusicBrainz lookup",
                    settings: "Your workspace",
                    help: "Welcome to TagForge",
                    review: "Review before saving",
                  }[tool]
                }
              </h2>
              <button
                disabled={busy}
                aria-label="Close dialog"
                onClick={() => setTool(null)}
              >
                ×
              </button>
            </div>
            {["rename", "filename", "replace", "case", "number"].includes(
              tool,
            ) && (
              <>
                <p>
                  Changes will be staged for{" "}
                  {visible.filter((t) => selected.has(t.path)).length} selected,
                  visible tracks in the current sort order.
                </p>
                {(tool === "rename" || tool === "filename") && (
                  <>
                    <label>
                      Template
                      <input
                        value={template}
                        onChange={(e) => setTemplate(e.target.value)}
                      />
                    </label>
                    <p className="hint">
                      {tool === "rename"
                        ? "Use {artist}, {album}, {title}, {track:02}. The extension is added automatically."
                        : "Example: {track} - {artist} - {title}. Do not include the extension."}
                    </p>
                    {current && (
                      <div className="sample">
                        {(() => {
                          try {
                            return tool === "rename"
                              ? renderName(
                                  template,
                                  effective(current, drafts[current.path]),
                                )
                              : JSON.stringify(
                                  parseFilename(
                                    template,
                                    effective(current, drafts[current.path])
                                      .name,
                                  ),
                                );
                          } catch (e) {
                            return String(e);
                          }
                        })()}
                      </div>
                    )}
                  </>
                )}
                {(tool === "replace" || tool === "case") && (
                  <label>
                    Field
                    <select
                      value={targetField}
                      onChange={(e) => setTargetField(e.target.value as Field)}
                    >
                      {fields.map((f) => (
                        <option key={f} value={f}>
                          {labels[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {tool === "replace" && (
                  <>
                    <label>
                      Find (literal, case sensitive)
                      <input
                        value={find}
                        onChange={(e) => setFind(e.target.value)}
                      />
                    </label>
                    <label>
                      Replace with
                      <input
                        value={replacement}
                        onChange={(e) => setReplacement(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {tool === "case" && (
                  <label>
                    Transformation
                    <select
                      value={caseMode}
                      onChange={(e) => setCaseMode(e.target.value)}
                    >
                      <option value="title">Title Case</option>
                      <option value="upper">UPPERCASE</option>
                      <option value="lower">lowercase</option>
                      <option value="trim">Trim & normalize spaces</option>
                    </select>
                  </label>
                )}
                {tool === "number" && (
                  <label>
                    First track number
                    <input
                      type="number"
                      min="1"
                      value={start}
                      onChange={(e) => setStart(Number(e.target.value))}
                    />
                  </label>
                )}
                <button className="primary" disabled={busy} onClick={stageTool}>
                  Stage changes
                </button>
              </>
            )}
            {tool === "review" && (
              <>
                <p>
                  Approve writing these {dirty} files. Original bytes will be
                  backed up beside each file
                  {retainBackups
                    ? " and retained after closing"
                    : " temporarily for this session only"}
                  . Existing rename destinations are never overwritten.
                </p>
                <div className="changes">
                  {Object.entries(drafts).map(([path, d]) => {
                    const t = tracks.find((x) => x.path === path)!;
                    return (
                      <article key={path}>
                        <strong>{t.name}</strong>
                        <small>{t.path}</small>
                        {Object.entries(d.fields).map(([k, v]) => (
                          <div key={k}>
                            <b>{labels[k as Field]}</b>
                            <del>{t.fields[k as Field] || "(empty)"}</del>
                            <ins>{v || "(clear)"}</ins>
                          </div>
                        ))}
                        {d.newName && (
                          <div>
                            <b>Filename</b>
                            <del>{t.name}</del>
                            <ins>{d.newName}</ins>
                          </div>
                        )}
                        {d.artwork !== undefined && (
                          <div>
                            <b>
                              {t.format === "M4A"
                                ? "All covers (M4A)"
                                : "Front cover"}
                            </b>
                            <ins>
                              {d.artwork
                                ? "Replace / add artwork"
                                : t.format === "M4A"
                                  ? "Remove all covers"
                                  : "Remove front artwork"}
                            </ins>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="dialog-actions">
                  <button onClick={() => setTool(null)}>Keep editing</button>
                  <button
                    onClick={() => {
                      setHistory((h) => [...h.slice(-19), drafts]);
                      setDrafts({});
                      setTool(null);
                    }}
                  >
                    Discard all staged
                  </button>
                  <button className="save" disabled={busy} onClick={save}>
                    Approve & write {dirty} files
                  </button>
                </div>
              </>
            )}
            {tool === "lookup" && (
              <>
                <p>
                  This sends your search directly to MusicBrainz. Select
                  matching metadata and artwork to stage it.
                </p>
                <label>
                  Contact email or project URL
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Required by MusicBrainz User-Agent policy"
                  />
                </label>
                <div className="search-row">
                  <input
                    aria-label="MusicBrainz search"
                    value={lookup}
                    onChange={(e) => setLookup(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={busy || !lookup || !contact}
                    onClick={search}
                  >
                    Search
                  </button>
                </div>
                <div className="results">
                  {results.map((r) => (
                    <article key={r.id}>
                      <strong>{r.title}</strong>
                      <p>
                        {r["artist-credit"]?.map((a) => a.name).join(", ")} ·{" "}
                        {r.length ? duration(r.length / 1000) : "Time unknown"}
                      </p>
                      <button disabled={busy} onClick={() => stageRecording(r)}>
                        Stage recording & first release
                      </button>
                      {r.releases?.map((rel) => (
                        <div className="release" key={rel.id}>
                          <span>
                            {rel.title} · {rel.date}
                          </span>
                          <button disabled={busy} onClick={() => cover(rel.id)}>
                            Stage cover
                          </button>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              </>
            )}
            {tool === "settings" && (
              <>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={retainBackups}
                      onChange={(e) => {
                        setRetainBackups(e.target.checked);
                        localStorage.setItem(
                          "retainBackups",
                          JSON.stringify(e.target.checked),
                        );
                      }}
                    />{" "}
                    Keep recovery backups after closing
                  </span>
                </label>
                <p>
                  Enabled by default. When disabled, rollback copies support
                  session undo and are removed on normal exit. A crash may leave
                  recovery copies.
                </p>
                <p>
                  Choose and order your library columns. Preferences stay on
                  this computer.
                </p>
                <div className="column-options">
                  {optionalColumns.map((c) => (
                    <label key={c}>
                      <input
                        type="checkbox"
                        checked={columns.includes(c)}
                        disabled={columns.length === 1 && columns.includes(c)}
                        onChange={(e) =>
                          setColumns((old) =>
                            e.target.checked
                              ? [...old, c]
                              : old.filter((x) => x !== c),
                          )
                        }
                      />
                      {columnLabel(c)}
                    </label>
                  ))}
                </div>
                <div className="column-order">
                  {columns.map((c, i) => (
                    <div key={c}>
                      <span>{columnLabel(c)}</span>
                      <button
                        aria-label={`Move ${columnLabel(c)} left`}
                        disabled={i === 0}
                        onClick={() =>
                          setColumns((old) => {
                            const n = [...old];
                            [n[i - 1], n[i]] = [n[i], n[i - 1]];
                            return n;
                          })
                        }
                      >
                        ↑
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setColumns(initialColumns)}>
                  Reset columns
                </button>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  Use {theme === "dark" ? "light" : "dark"} mode
                </button>
              </>
            )}
            {tool === "help" && (
              <>
                <p>
                  Import music, select tracks, then check the fields you want to
                  edit. Stage your changes and use <b>Review & save</b> to
                  approve writing them.
                </p>
                <p>
                  Batch tools operate on selected tracks visible under the
                  current filter. Auto-numbering follows the current sort order.
                  Duplicate detection uses exact file hashes and likely matches
                  by title, artist, and rounded duration; it does not identify
                  audio acoustically.
                </p>
                <p>
                  Ctrl+O imports files, Ctrl+S opens review, Ctrl+Z undoes
                  staging outside text inputs. Shift-click checkboxes selects a
                  range.
                </p>
                <p>
                  Recovery backups end in <code>.tagforge-backup-…</code>.
                  Settings can disable retention after closing; temporary
                  session rollback copies still support undo. Restore last save
                  works during this session and refuses files changed
                  externally. Keep the backups until you have verified your
                  collection.
                </p>
                <p>
                  TagForge 1.0.0 · GPL-3.0-or-later. Independently developed. No
                  telemetry, accounts, or TagForge servers. AcoustID
                  identification and automatic updates are not included.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
