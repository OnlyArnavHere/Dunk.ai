/**
 * A minimal ZIP writer, used to package the Gerber set.
 *
 * Why this exists rather than a dependency
 * ----------------------------------------
 * Every fabricator — JLCPCB included — takes Gerbers as a single .zip, and a
 * directory of loose files is not something a browser can hand anybody:
 * `express.static` does not list directories, so a link to the folder answers
 * 301 and then 404. Measured against the running backend:
 *
 *     /uploads/.../dist/gerbers          -> 301, then 404
 *     /uploads/.../dist/gerbers/F_Cu.gbr -> 200
 *
 * So the set has to be one file. Adding `archiver` for that means running the
 * installer against a tree whose four critical versions are held in place by
 * `overrides` (see D-001) — each of them a build that does not run when it
 * floats. A ~60-line writer over `node:zlib` costs nothing and cannot move
 * them.
 *
 * Only the subset of the format that matters here is implemented: deflate,
 * no encryption, no Zip64, no directory entries. Gerbers are small text files
 * (the measured set is 261 KB across 14 files), so the 4 GB and 65535-entry
 * ceilings that would force Zip64 are not reachable from here.
 */

import { crc32, deflateRawSync } from "node:zlib"

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const VERSION = 20 // 2.0 — the minimum that understands deflate
const METHOD_DEFLATE = 8

/** MS-DOS packed time/date, which is what the format stores. */
function dosStamp(date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/**
 * Build a ZIP archive in memory.
 *
 * @param {Array<{name: string, data: Buffer|string}>} entries
 * @returns {Buffer}
 */
export function zipSync(entries, { date = new Date() } = {}) {
  const { time: dosTime, date: dosDate } = dosStamp(date)

  const chunks = []
  const central = []
  let offset = 0

  for (const entry of entries) {
    // Names are stored with forward slashes regardless of host platform; a
    // backslash here produces an archive that Windows reads and Linux does not.
    const name = Buffer.from(String(entry.name).split(/[\\/]/).join("/"), "utf-8")
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf-8")
    const compressed = deflateRawSync(raw)
    const sum = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIG, 0)
    local.writeUInt16LE(VERSION, 4)
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(METHOD_DEFLATE, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(sum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra field length

    chunks.push(local, name, compressed)

    const dir = Buffer.alloc(46)
    dir.writeUInt32LE(CENTRAL_SIG, 0)
    dir.writeUInt16LE(VERSION, 4) // version made by
    dir.writeUInt16LE(VERSION, 6) // version needed
    dir.writeUInt16LE(0, 8) // flags
    dir.writeUInt16LE(METHOD_DEFLATE, 10)
    dir.writeUInt16LE(dosTime, 12)
    dir.writeUInt16LE(dosDate, 14)
    dir.writeUInt32LE(sum, 16)
    dir.writeUInt32LE(compressed.length, 20)
    dir.writeUInt32LE(raw.length, 24)
    dir.writeUInt16LE(name.length, 28)
    dir.writeUInt16LE(0, 30) // extra
    dir.writeUInt16LE(0, 32) // comment
    dir.writeUInt16LE(0, 34) // disk number
    dir.writeUInt16LE(0, 36) // internal attributes
    dir.writeUInt32LE(0, 38) // external attributes
    dir.writeUInt32LE(offset, 42) // offset of the local header
    central.push(dir, name)

    offset += local.length + name.length + compressed.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIG, 0)
  eocd.writeUInt16LE(0, 4) // this disk
  eocd.writeUInt16LE(0, 6) // disk with the central directory
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...chunks, centralBuf, eocd])
}
