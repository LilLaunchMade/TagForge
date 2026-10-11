import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capitalize,
  normalizeFields,
  duplicatePaths,
  effective,
  parseFilename,
  renderName,
  validateName,
  type Track,
} from "../src/model.ts";
const track = {
  path: "C:/song.mp3",
  name: "song.mp3",
  format: "MP3",
  duration: 123,
  bytes: 1000,
  hasArt: false,
  fingerprint: "abc",
  fields: {
    title: "A / Song",
    artist: "Artist",
    album: "Album",
    track: "3",
    year: "2026",
  },
} as Track;
test("rename templates preserve extension and sanitize field values", () => {
  assert.equal(renderName("{track:02} - {title}", track), "03 - A _ Song.mp3");
  assert.throws(() => renderName("{bogus}", track));
  assert.throws(() => renderName("../{title}", track));
});
test("filename parsing escapes separators and validates fields", () => {
  assert.deepEqual(
    parseFilename("{track}. {artist} - {title}", "01. First - Song.flac"),
    { track: "01", artist: "First", title: "Song" },
  );
  assert.throws(() => parseFilename("{artist} - {title}", "unmatched.wav"));
  assert.throws(() => parseFilename("{title}{title}", "xx.wav"));
});
test("Windows reserved names and paths are rejected", () => {
  for (const n of [
    "CON.mp3",
    "LPT9.wav",
    "../a.mp3",
    "a\\b.opus",
    "a.mp3.",
    "x?.mp3",
  ])
    assert.throws(() => validateName(n));
  validateName("01 — Music.m4a");
});
test("drafts do not mutate original metadata", () => {
  const e = effective(track, {
    fields: { title: "" },
    newName: "renamed.mp3",
    artwork: "",
  });
  assert.equal(e.fields.title, "");
  assert.equal(track.fields.title, "A / Song");
  assert.equal(e.name, "renamed.mp3");
});
test("case transformations support Unicode", () => {
  assert.equal(capitalize("  déjà   VU ", "trim"), "déjà VU");
  assert.equal(capitalize("déjà VU", "title"), "Déjà Vu");
  assert.equal(capitalize("straße", "upper"), "STRASSE");
});
test("numeric tag values are canonical before review", () => {
  assert.deepEqual(
    normalizeFields({ track: "003", disc: "01", title: "0007" }),
    { track: "3", disc: "1", title: "0007" },
  );
});
test("duplicate detection reports all members and excludes empty titles", () => {
  assert.deepEqual(
    [
      ...duplicatePaths([
        track,
        { ...track, path: "other", fingerprint: "other" },
      ]),
    ].sort(),
    ["C:/song.mp3", "other"],
  );
  assert.equal(duplicatePaths([track]).size, 0);
});
