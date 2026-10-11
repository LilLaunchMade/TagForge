export const fields = [
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
] as const;
export type Field = (typeof fields)[number];
export type Track = {
  path: string;
  name: string;
  format: string;
  duration: number;
  bytes: number;
  fields: Record<Field, string>;
  hasArt: boolean;
  fingerprint: string;
};
export type Draft = {
  fields: Partial<Record<Field, string>>;
  artwork?: string;
  newName?: string;
};
export type Change = Draft & { path: string; fingerprint: string };
export function normalizeFields(
  values: Partial<Record<Field, string>>,
): Partial<Record<Field, string>> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      ["track", "disc", "trackTotal", "discTotal"].includes(key) &&
      /^\d+$/.test(value) &&
      Number(value) <= 4294967295
        ? String(Number(value))
        : value,
    ]),
  );
}
export const labels: Record<Field, string> = {
  title: "Title",
  artist: "Artist",
  album: "Album",
  albumArtist: "Album artist",
  genre: "Genre",
  year: "Year / date",
  track: "Track",
  disc: "Disc",
  trackTotal: "Total tracks",
  discTotal: "Total discs",
  comment: "Comment",
  lyrics: "Lyrics",
};
export function effective(t: Track, d?: Draft): Track {
  return {
    ...t,
    fields: { ...t.fields, ...d?.fields },
    name: d?.newName ?? t.name,
    hasArt: d?.artwork === undefined ? t.hasArt : !!d.artwork,
  };
}
export function cleanName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
}
export function validateName(n: string): void {
  const stem = n.split(".")[0];
  if (
    !n ||
    n.length > 240 ||
    /[<>:"/\\|?*\x00-\x1f]/.test(n) ||
    /[. ]$/.test(n) ||
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)
  )
    throw Error("Invalid or reserved Windows filename");
}
export function renderName(template: string, t: Track): string {
  if (!template.trim()) throw Error("Enter a filename template");
  const name = template.replace(
    /\{(\w+)(?::(\d+))?\}/g,
    (_, key: string, width: string) => {
      if (!fields.includes(key as Field)) throw Error(`Unknown field: ${key}`);
      const value = t.fields[key as Field];
      if (!value) throw Error(`Missing ${labels[key as Field]} in ${t.name}`);
      return cleanName(
        width ? value.padStart(Math.min(Number(width), 10), "0") : value,
      );
    },
  );
  if (/[{}]/.test(name)) throw Error("Malformed template");
  const result = name + "." + t.name.split(".").pop();
  validateName(result);
  return result;
}
export function parseFilename(
  template: string,
  name: string,
): Partial<Record<Field, string>> {
  const keys: Field[] = [];
  let source = "^",
    pos = 0;
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const key = match[1] as Field;
    if (!fields.includes(key) || keys.includes(key))
      throw Error("Unknown or repeated field in template");
    source +=
      template.slice(pos, match.index).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      "(.+?)";
    keys.push(key);
    pos = match.index! + match[0].length;
  }
  source += template.slice(pos).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$";
  if (!keys.length)
    throw Error("Template needs fields such as {artist} - {title}");
  const stem = name.replace(/\.[^.]+$/, "");
  const result = new RegExp(source, "u").exec(stem);
  if (!result) throw Error(`Filename does not match template: ${name}`);
  return Object.fromEntries(keys.map((k, i) => [k, result[i + 1].trim()]));
}
export function capitalize(s: string, mode: string): string {
  if (mode === "upper") return s.toLocaleUpperCase();
  if (mode === "lower") return s.toLocaleLowerCase();
  if (mode === "trim") return s.trim().replace(/\s+/g, " ");
  return s
    .toLocaleLowerCase()
    .replace(/(^|[\s\-–—(])\p{L}/gu, (s) => s.toLocaleUpperCase());
}
export function duplicatePaths(tracks: Track[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const t of tracks) {
    // Exact file matches or likely recording duplicates; not a perceptual audio fingerprint.
    const keys = [`hash:${t.fingerprint}`];
    if (t.fields.title.trim() && t.fields.artist.trim())
      keys.push(
        `tags:${t.fields.artist.toLocaleLowerCase().trim()}|${t.fields.title.toLocaleLowerCase().trim()}|${Math.round(t.duration)}`,
      );
    for (const k of keys) {
      const group = groups.get(k);
      if (group) group.push(t.path);
      else groups.set(k, [t.path]);
    }
  }
  return new Set([...groups.values()].filter((g) => g.length > 1).flat());
}
export function duration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
