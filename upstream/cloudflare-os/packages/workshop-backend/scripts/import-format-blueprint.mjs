// Imports a `.gadget` archive exported from a running Workshop into the repo's bundled format
// blueprints.
//
//   pnpm import:format-blueprint ~/Downloads/Gadgets-Doc-v4.gadget format.document
//
// See format-blueprints/README.md for the workflow this belongs to.
//
// The archive is the blueprint's code; how it is presented lives in its `.json` sidecar, and the
// installer applies that over whatever the archive carries. So this script does not merge
// presentation -- it copies the code in, normalizes the archive's own now-inert metadata so the
// committed bytes don't contradict the sidecar, and bumps `revision` so deployments holding an
// older copy actually reinstall.
//
// Works on whichever directory the build uses (FORMAT_BLUEPRINTS_DIR), so a deployment maintaining
// its own formats gets the same workflow.
//
// It also reports the two things worth a human's attention: whether the export needs bindings the
// old copy didn't, and whether its title has drifted from the curated one.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");
const sourceDir = resolve(pkgRoot, process.env.FORMAT_BLUEPRINTS_DIR ?? "format-blueprints");

// See src/blueprint-archive.ts, which is the authority on this format: a 24-byte prefix (magic,
// version, metadata byte length, content byte length), UTF-8 JSON metadata, gzipped Yjs snapshot.
// Re-implemented here because this runs as a plain node script outside the Worker.
const MAGIC = 0xec2e2d3a2300e317n;
const VERSION = 1;
const PREFIX_BYTES = 24;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArchive(bytes, label) {
  if (bytes.byteLength < PREFIX_BYTES) fail(`${label}: too short to be a .gadget archive`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getBigUint64(0) !== MAGIC) fail(`${label}: not a .gadget archive (bad magic)`);
  const version = view.getUint32(8);
  if (version !== VERSION) fail(`${label}: unsupported archive version ${version}`);
  const metadataLength = view.getUint32(12);
  const contentLength = Number(view.getBigUint64(16));
  const content = bytes.subarray(PREFIX_BYTES + metadataLength);
  if (content.byteLength !== contentLength) {
    fail(`${label}: content is ${content.byteLength} bytes, prefix claims ${contentLength}`);
  }
  let metadata;
  try {
    metadata = JSON.parse(
        new TextDecoder().decode(bytes.subarray(PREFIX_BYTES, PREFIX_BYTES + metadataLength)));
  } catch (err) {
    fail(`${label}: metadata is not valid JSON (${err.message})`);
  }
  return { metadata, content };
}

function serializeArchive(metadata, content) {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const out = new Uint8Array(PREFIX_BYTES + metadataBytes.byteLength + content.byteLength);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, MAGIC);
  view.setUint32(8, VERSION);
  view.setUint32(12, metadataBytes.byteLength);
  view.setBigUint64(16, BigInt(content.byteLength));
  out.set(metadataBytes, PREFIX_BYTES);
  out.set(content, PREFIX_BYTES + metadataBytes.byteLength);
  return out;
}

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);

// --- Arguments -------------------------------------------------------------------------------

// Every sidecar in the directory, so a blueprintId can be resolved to the files that hold it.
const sidecars = [];
for (const file of (await readdir(sourceDir)).filter(f => f.endsWith(".json")).toSorted()) {
  const name = basename(file, ".json");
  const source = await readFile(join(sourceDir, file), "utf8");
  sidecars.push({ name, source, ...JSON.parse(source) });
}

const args = process.argv.slice(2);
const newAt = args.indexOf("--new");
const newName = newAt === -1 ? undefined : args.splice(newAt, 2)[1];
const [archivePath, blueprintId] = args;

if (!archivePath || (!blueprintId && !newName)) {
  console.error("usage: pnpm import:format-blueprint <export.gadget> <blueprintId>");
  console.error("       pnpm import:format-blueprint <export.gadget> --new <name>");
  console.error("");
  console.error(`formats in ${sourceDir}:`);
  for (const entry of sidecars) {
    console.error(`  ${entry.blueprintId.padEnd(20)} ${entry.name}.gadget`);
  }
  process.exit(2);
}

if (newName && !/^[a-zA-Z0-9._-]+$/.test(newName)) {
  fail(`--new ${newName}: name must be [a-zA-Z0-9._-]`);
}
if (newName && sidecars.some(e => e.name === newName)) {
  fail(`${newName}.json already exists; import into it by blueprintId instead`);
}

const entry = newName
    ? { name: newName, scaffold: true }
    : sidecars.find(e => e.blueprintId === blueprintId);
if (!entry) {
  fail(`no sidecar declares blueprintId "${blueprintId}".\n` +
       `       Use --new <name> to start one.`);
}
const targetPath = join(sourceDir, `${entry.name}.gadget`);
const sidecarPath = join(sourceDir, `${entry.name}.json`);

// --- Read ------------------------------------------------------------------------------------

// Nothing is written before this point, so a bad argument leaves the repo untouched.
let incomingBytes;
try {
  incomingBytes = await readFile(resolve(archivePath));
} catch (err) {
  fail(err?.code === "ENOENT" ? `no such file: ${archivePath}` : `${archivePath}: ${err.message}`);
}
const incoming = parseArchive(incomingBytes, archivePath);

let existing;
try {
  existing = parseArchive(await readFile(targetPath), `${entry.name}.gadget`);
} catch (err) {
  if (err?.code !== "ENOENT") throw err;
}

// --- Scaffold ----------------------------------------------------------------------------------

let scaffoldSidecar;

// `--new` writes the sidecar so nobody has to learn its shape from the README. Everything it can
// take from the export it does; what is left is prose and the `output` vocabulary, which the
// sidecar owns even when the export carries one (see the dropped keys below). The values it guesses
// are valid, so the import completes and the format works -- the TODO list printed at the end is
// what makes them worth revisiting.
if (entry.scaffold) {
  // Borrowed from a sibling if there is one: a directory's blueprints are published by the same
  // people, and the export's author is whoever happened to build it in a Workshop.
  const author = sidecars[0]?.author ?? incoming.metadata.author;
  const title = incoming.metadata.title || entry.name;

  Object.assign(entry, {
    blueprintId: entry.name,
    title,
    description: incoming.metadata.description || `TODO: say what a ${title} is for.`,
    output: { id: entry.name, noun: title, plural: `${title}s`, icon: "appWindow" },
    author,
    revision: 1,
  });

  // Held rather than written, so that a scaffold whose archive turns out to be unusable doesn't
  // leave a sidecar behind with nothing beside it. Written with the archive below.
  scaffoldSidecar = `${JSON.stringify({
    blueprintId: entry.blueprintId,
    title: entry.title,
    description: entry.description,
    output: entry.output,
    author: entry.author,
    revision: entry.revision,
  }, null, 2)}\n`;
}

// --- Write -----------------------------------------------------------------------------------

// The archive's own presentation is inert -- the installer takes those fields from the sidecar --
// but committed bytes that say something different are misleading, and would surface if anyone
// imported this file by hand through the UI. So they are normalized to the sidecar's values. The
// rest is the export's: `bindings` because it is part of what the blueprint does, and the dates
// because they are real provenance from the workspace this came from.
//
// `version` is the blueprint's own version, used as its R2 content key, and comes from the export:
// the authoring workspace already increments it every time the blueprint is republished.
const metadata = {
  title: entry.title,
  description: entry.description,
  author: entry.author,
  created: incoming.metadata.created,
  version: incoming.metadata.version,
  lastUpdated: incoming.metadata.lastUpdated,
  bindings: incoming.metadata.bindings ?? {},
};

// `output` is declared in the sidecar and `screenshot` refers to bytes stored outside the archive,
// so neither belongs in a bundled copy: one would be a second source of truth that silently loses,
// the other a dangling reference.
const dropped = ["output", "screenshot"].filter((key) => key in incoming.metadata);

const archiveBytes = serializeArchive(metadata, incoming.content);

// Round-trip before writing anything, rather than trusting the serializer: these bytes are
// committed as data, and a corrupt archive would otherwise first surface when a deployment tried
// to install it.
const written = parseArchive(archiveBytes, `${entry.name}.gadget`);
if (JSON.stringify(written.metadata) !== JSON.stringify(metadata)) {
  fail(`${entry.name}.gadget: metadata did not survive the round trip`);
}
if (sha(written.content) !== sha(incoming.content)) {
  fail(`${entry.name}.gadget: content did not survive the round trip`);
}

// The reinstall trigger for deployments that already hold an older copy. Automated because it is
// both the easiest step to forget and the one whose failure is invisible: everything builds and
// deploys, and the old blueprint quietly stays put. (Presentation changes need no bump -- they are
// part of the installed-version fingerprint. Archive bytes aren't, which is what this is for. A
// blueprint being scaffolded has nothing to reinstall over, so it keeps the revision 1 it was
// written with.)
//
// Edited as text rather than re-serialized so the sidecar keeps its formatting and any $comment.
let bumpedSidecar;
if (!entry.scaffold) {
  bumpedSidecar = entry.source.replace(/"revision":\s*\d+/, `"revision": ${entry.revision + 1}`);
  if (bumpedSidecar === entry.source) fail(`${entry.name}.json has no revision to bump`);
}

// Everything that can fail has failed by now: the sidecar's new contents are computed above, so
// the archive can't land carrying an old revision -- deployments holding the previous copy would
// never reinstall, which is the exact silent failure the bump exists to prevent. The two writes
// are still sequential, so an I/O error between them leaves the archive updated and the sidecar
// not; re-running the import fixes that.
await writeFile(targetPath, archiveBytes);
if (bumpedSidecar ?? scaffoldSidecar) await writeFile(sidecarPath, bumpedSidecar ?? scaffoldSidecar);

// --- Report ----------------------------------------------------------------------------------

const oldBindings = Object.keys(existing?.metadata.bindings ?? {}).toSorted().join(",");
const newBindings = Object.keys(metadata.bindings).toSorted().join(",");
const contentUnchanged = existing && sha(existing.content) === sha(incoming.content);

console.log(`${existing ? "Updated" : "Imported"} ${entry.name}.gadget (${entry.blueprintId})`);
console.log(`  code         ${existing ? `${existing.content.byteLength} -> ` : ""}` +
    `${incoming.content.byteLength} bytes (${sha(incoming.content)})` +
    `${contentUnchanged ? "   [unchanged]" : ""}`);
console.log(`  bindings     ${newBindings || "(none)"}` +
    `${oldBindings !== newBindings ? `   [CHANGED from ${oldBindings || "(none)"}]` : ""}`);
console.log(`  version      ${existing ? `${existing.metadata.version} -> ` : ""}${metadata.version}`);
console.log(`  revision     ${entry.scaffold ? "1  (new)"
    : `${entry.revision} -> ${entry.revision + 1}  (${entry.name}.json)`}`);
console.log("");
console.log(`  presented as "${metadata.title}" by ${metadata.author.name}, from ${entry.name}.json` +
    `${incoming.metadata.title !== metadata.title
        ? `\n               [export called it "${incoming.metadata.title}"]` : ""}`);
if (dropped.length > 0) {
  console.log(`  dropped      ${dropped.join(", ")}   [owned by the sidecar / stored separately]`);
}

// The scaffold guessed these, and a guess that works is the kind nobody revisits.
if (entry.scaffold) {
  console.log("");
  console.log(`  Wrote ${entry.name}.json. Edit before deploying:`);
  console.log(`    blueprintId  "${entry.blueprintId}" -- the install key, and fixed once deployed`);
  console.log(`    output.id    "${entry.output.id}" -- groups it on the Outputs page, so prefer a`);
  console.log(`                 generic word ("document") over this blueprint's own name`);
  console.log(`    output       noun "${entry.output.noun}", plural "${entry.output.plural}", ` +
      `icon "${entry.output.icon}"`);
  console.log(`    description  what the format is *for* -- the agent reads it to decide when to`);
  console.log(`                 use this format`);
}
console.log("");
await import("./build-format-blueprints.mjs");
