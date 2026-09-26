import { test } from "node:test"
import assert from "node:assert/strict"
import { crc32, inflateRawSync } from "node:zlib"
import { zipSync } from "../src/lib/zip.mjs"

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

/**
 * Read the archive back through the central directory, the way a reader does.
 *
 * The point is to decode what was written rather than to re-derive it from the
 * same variables that wrote it: a test that trusts the writer's own offsets
 * would pass on an archive no other tool can open.
 */
function readZip(buf) {
  const eocd = buf.length - 22
  assert.equal(buf.readUInt32LE(eocd), EOCD_SIG, "EOCD signature")
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)

  const entries = []
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), CENTRAL_SIG, "central directory signature")
    const method = buf.readUInt16LE(p + 10)
    const storedCrc = buf.readUInt32LE(p + 16)
    const compSize = buf.readUInt32LE(p + 20)
    const rawSize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const localAt = buf.readUInt32LE(p + 42)
    const name = buf.toString("utf-8", p + 46, p + 46 + nameLen)

    // Follow the offset into the local header and inflate the payload there.
    assert.equal(buf.readUInt32LE(localAt), LOCAL_SIG, `local header signature for ${name}`)
    const localNameLen = buf.readUInt16LE(localAt + 26)
    const localExtraLen = buf.readUInt16LE(localAt + 28)
    const dataAt = localAt + 30 + localNameLen + localExtraLen
    const data = inflateRawSync(buf.subarray(dataAt, dataAt + compSize))

    entries.push({ name, method, storedCrc, rawSize, data })
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
  }
  return entries
}

test("zipSync round-trips file contents byte for byte", () => {
  const files = [
    { name: "F_Cu.gbr", data: "G04 layer F_Cu*\nX100Y200D02*\n".repeat(50) },
    { name: "drill-L1-L4.drl", data: "M48\nFMAT,2\nT1C0.300\n%\n" },
  ]
  const entries = readZip(zipSync(files))

  assert.equal(entries.length, 2)
  assert.deepEqual(
    entries.map((e) => e.name),
    ["F_Cu.gbr", "drill-L1-L4.drl"]
  )
  for (const [i, entry] of entries.entries()) {
    const original = Buffer.from(files[i].data, "utf-8")
    assert.equal(entry.method, 8, "deflate")
    assert.deepEqual(entry.data, original, `${entry.name} contents`)
    assert.equal(entry.rawSize, original.length, `${entry.name} uncompressed size`)
    assert.equal(entry.storedCrc, crc32(original), `${entry.name} CRC`)
  }
})

test("zipSync stores binary data unchanged", () => {
  // Gerbers are text, but nothing in the writer may assume that.
  const data = Buffer.from([0x00, 0xff, 0x7f, 0x80, 0x0d, 0x0a, 0x1a, 0x00])
  const [entry] = readZip(zipSync([{ name: "blob.bin", data }]))
  assert.deepEqual(entry.data, data)
  assert.equal(entry.storedCrc, crc32(data))
})

test("zipSync normalises path separators to forward slashes", () => {
  // A backslash in the name produces an archive Windows reads and Linux does not.
  const [entry] = readZip(zipSync([{ name: "gerbers\\F_Cu.gbr", data: "x" }]))
  assert.equal(entry.name, "gerbers/F_Cu.gbr")
})

test("an empty archive is still a valid archive", () => {
  const buf = zipSync([])
  assert.equal(buf.length, 22, "EOCD only")
  assert.deepEqual(readZip(buf), [])
})
