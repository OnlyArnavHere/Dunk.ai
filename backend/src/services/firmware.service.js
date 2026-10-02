import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { env } from '../config/env.js';
import { BOARDS, publicBoard } from '../config/boards.js';
import { ApiError } from '../utils/ApiError.js';

const run = promisify(execFile);

const WORK_ROOT = env.firmwareWorkDir || path.join(os.tmpdir(), 'dunkai-firmware');
const SOURCE_EXT = new Set(['.ino', '.h', '.hpp', '.c', '.cpp']);
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const MAX_CONCURRENT = 2;
const CACHE_LIMIT = 32;

// The compiler runs on our server, so sources must not be able to pull server files
// into diagnostics or into the returned binary.
const FORBIDDEN = [
  { re: /^\s*#\s*(include|include_next|import)\s*[<"]\s*(\/|\\|[A-Za-z]:)/m, why: 'absolute #include paths' },
  { re: /^\s*#\s*(include|include_next|import)\s*[<"][^>"]*\.\./m, why: "'..' in #include paths" },
  { re: /^\s*#\s*embed\b/m, why: '#embed' },
  { re: /\.incbin\b/, why: '.incbin' },
];

// ---- Concurrency: a global cap, plus one build at a time per board (they share a build dir) ----

let active = 0;
const waiting = [];
const acquireSlot = () =>
  new Promise((resolve) => {
    if (active < MAX_CONCURRENT) {
      active += 1;
      resolve();
    } else {
      waiting.push(resolve);
    }
  });
const releaseSlot = () => {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
};

const boardLocks = new Map();
const withBoardLock = (boardId, fn) => {
  const prev = boardLocks.get(boardId) || Promise.resolve();
  const current = prev.catch(() => {}).then(fn);
  boardLocks.set(boardId, current);
  return current;
};

// ---- Toolchain status ----

let statusCache = { at: 0, value: null };

const parseInstalledPlatforms = (stdout) => {
  const parsed = JSON.parse(stdout || '{}');
  const list = Array.isArray(parsed) ? parsed : parsed.platforms || [];
  return list
    .filter((p) => p.installed_version || p.installed)
    .map((p) => p.id || p.ID);
};

export const getToolchainStatus = async () => {
  if (statusCache.value && Date.now() - statusCache.at < 30_000) return statusCache.value;

  let value;
  try {
    const [{ stdout: versionOut }, { stdout: coresOut }] = await Promise.all([
      run(env.arduinoCliPath, ['version', '--json'], { windowsHide: true, timeout: 15_000 }),
      run(env.arduinoCliPath, ['core', 'list', '--json'], { windowsHide: true, timeout: 15_000 }),
    ]);
    const version = JSON.parse(versionOut || '{}').VersionString || 'unknown';
    value = { available: true, version, platforms: parseInstalledPlatforms(coresOut) };
  } catch (err) {
    value = { available: false, version: null, platforms: [], error: err.code === 'ENOENT' ? 'arduino-cli not found' : err.message };
  }
  statusCache = { at: Date.now(), value };
  return value;
};

export const listBoards = async () => {
  const toolchain = await getToolchainStatus();
  return {
    toolchain: { available: toolchain.available, version: toolchain.version, error: toolchain.error },
    boards: BOARDS.map((b) => ({ ...publicBoard(b), installed: toolchain.platforms.includes(b.platform) })),
  };
};

// ---- Sources ----

const prepareSources = (files) => {
  const sources = [];
  const skipped = [];

  for (const file of files) {
    const name = path.basename(String(file.filename || ''));
    const ext = path.extname(name).toLowerCase();
    if (!SOURCE_EXT.has(ext)) {
      skipped.push(name);
      continue;
    }
    if (!SAFE_NAME.test(name)) throw ApiError.badRequest(`Invalid source filename: ${name}`);
    const code = String(file.code ?? '');
    const bad = FORBIDDEN.find((f) => f.re.test(code));
    if (bad) throw ApiError.unprocessable(`${name} uses ${bad.why}, which the cloud compiler does not allow.`);
    sources.push({ name, ext, code });
  }

  const mainIndex = sources.findIndex((s) => s.ext === '.ino');
  if (mainIndex === -1) {
    throw ApiError.unprocessable('No Arduino sketch (.ino) found in the generated code, so there is nothing to compile for this board.');
  }
  // arduino-cli requires the primary .ino to share its folder's name.
  const mainName = sources[mainIndex].name;
  sources[mainIndex] = { ...sources[mainIndex], name: 'sketch.ino' };
  return { sources, skipped, mainName };
};

const cacheKey = (board, sources) =>
  createHash('sha256')
    .update(board.fqbn)
    .update(JSON.stringify([...sources].sort((a, b) => a.name.localeCompare(b.name)).map((s) => [s.name, s.code])))
    .digest('hex');

// ---- Artifacts ----

const parseIntelHex = (text) => {
  const chunks = [];
  let base = 0;
  let maxEnd = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] !== ':') throw new Error('Malformed HEX record');
    const bytes = Buffer.from(line.slice(1), 'hex');
    const len = bytes[0];
    const addr = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    const data = bytes.subarray(4, 4 + len);
    if (type === 0x00) {
      const at = base + addr;
      chunks.push([at, data]);
      maxEnd = Math.max(maxEnd, at + len);
    } else if (type === 0x01) break;
    else if (type === 0x02) base = ((data[0] << 8) | data[1]) << 4;
    else if (type === 0x04) base = ((data[0] << 8) | data[1]) << 16;
  }
  const image = Buffer.alloc(maxEnd, 0xff);
  for (const [at, data] of chunks) data.copy(image, at);
  return image;
};

// The core's own upload command lists every (address, file) pair Arduino IDE would
// flash — bootloader, partition table, boot_app0, app — so read the layout from it.
const espFlashLayout = async (board, sketchDir, buildDir) => {
  const { stdout } = await run(
    env.arduinoCliPath,
    ['compile', '--fqbn', board.fqbn, '--build-path', buildDir, '--show-properties=expanded', sketchDir],
    { windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }
  );
  const line = stdout.split(/\r?\n/).find((l) => /^tools\.[^.=]+\.upload\.pattern_args=/.test(l))
    || stdout.split(/\r?\n/).find((l) => /^tools\.[^.=]+\.upload\.pattern=.*write_flash/.test(l));
  const pairs = [...(line || '').matchAll(/(0x[0-9a-fA-F]+)\s+"([^"]+)"/g)];
  if (!pairs.length) throw new Error(`Could not determine the flash layout for ${board.fqbn}`);
  return Promise.all(pairs.map(async ([, addr, file]) => ({ address: Number(addr), data: await fs.readFile(file) })));
};

const mergeImages = (images) => {
  const size = Math.max(...images.map((i) => i.address + i.data.length));
  const merged = Buffer.alloc(size, 0xff);
  for (const img of images) img.data.copy(merged, img.address);
  return merged;
};

const readArtifacts = async (board, sketchDir, buildDir) => {
  if (board.platform === 'arduino:avr') {
    const hex = await fs.readFile(path.join(buildDir, 'sketch.ino.hex'), 'utf8');
    return {
      images: [{ address: 0, data: parseIntelHex(hex) }],
      download: { filename: `${board.id}-firmware.hex`, data: Buffer.from(hex) },
    };
  }

  const images = await espFlashLayout(board, sketchDir, buildDir);
  return {
    images,
    download: { filename: `${board.id}-firmware.merged.bin`, data: mergeImages(images) },
  };
};

// Strip server paths (including the "Used platform/library" tables) and report errors
// against the user's own filename rather than our internal sketch.ino.
const cleanLog = (text, dirs, mainName) => {
  let out = text.replace(/^Used (platform|library)\b[^\n]*\n(?:[^\n]*\S[^\n]*\n)*/gm, '');
  for (const dir of dirs) {
    for (const form of [dir, dir.replaceAll('\\', '/')]) {
      out = out.replaceAll(form + '\\', '').replaceAll(form + '/', '').replaceAll(form, '');
    }
  }
  return out.replace(/\bsketch\.ino\b/g, mainName).trim();
};

// ---- Compile ----

const builds = new Map();

const remember = (key, entry) => {
  builds.delete(key);
  builds.set(key, entry);
  if (builds.size > CACHE_LIMIT) builds.delete(builds.keys().next().value);
};

const toResponse = (key, entry, cached) => ({
  buildId: key,
  cached,
  board: publicBoard(entry.board),
  summary: entry.summary,
  log: entry.log,
  skipped: entry.skipped,
  download: { filename: entry.download.filename, size: entry.download.data.length },
  images: entry.images.map((img) => ({ address: img.address, size: img.data.length, data: img.data.toString('base64') })),
});

export const compileFirmware = async ({ board, files, userId }) => {
  const { sources, skipped, mainName } = prepareSources(files);
  const key = cacheKey(board, sources);

  const hit = builds.get(key);
  if (hit) {
    hit.owners.add(String(userId));
    return toResponse(key, hit, true);
  }

  return withBoardLock(board.id, async () => {
    const raced = builds.get(key);
    if (raced) {
      raced.owners.add(String(userId));
      return toResponse(key, raced, true);
    }
    await acquireSlot();
    try {
      const boardRoot = path.join(WORK_ROOT, board.id);
      const sketchDir = path.join(boardRoot, 'sketch');
      const buildDir = path.join(boardRoot, 'build');

      await fs.rm(sketchDir, { recursive: true, force: true });
      await fs.mkdir(sketchDir, { recursive: true });
      await Promise.all(sources.map((s) => fs.writeFile(path.join(sketchDir, s.name), s.code)));

      let output;
      try {
        const { stdout, stderr } = await run(
          env.arduinoCliPath,
          ['compile', '--no-color', '--fqbn', board.fqbn, '--build-path', buildDir, '--warnings', 'default', sketchDir],
          { windowsHide: true, timeout: env.firmwareCompileTimeoutMs, maxBuffer: 16 * 1024 * 1024 }
        );
        output = `${stdout}\n${stderr}`;
      } catch (err) {
        if (err.code === 'ENOENT') {
          throw new ApiError(503, 'Firmware compiler is not installed on the server (arduino-cli not found).');
        }
        if (err.killed) throw new ApiError(504, 'Firmware compile timed out.');
        const log = cleanLog(`${err.stdout || ''}\n${err.stderr || ''}`, [sketchDir, buildDir, boardRoot], mainName);
        throw new ApiError(422, 'Compilation failed', [{ message: 'compile_error', log }]);
      }

      const log = cleanLog(output, [sketchDir, buildDir, boardRoot], mainName);
      const summary = log.split('\n').filter((l) => /^(Sketch uses|Global variables use)/.test(l.trim()));
      const artifacts = await readArtifacts(board, sketchDir, buildDir);

      const entry = { board, summary, log, skipped, ...artifacts, owners: new Set([String(userId)]) };
      remember(key, entry);
      return toResponse(key, entry, false);
    } finally {
      releaseSlot();
    }
  });
};

export const getBuildDownload = (buildId, userId) => {
  const entry = builds.get(buildId);
  if (!entry || !entry.owners.has(String(userId))) {
    throw ApiError.notFound('Build not found or expired. Compile again to download it.');
  }
  return entry.download;
};
