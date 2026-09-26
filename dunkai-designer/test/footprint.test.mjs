import { test } from "node:test"
import assert from "node:assert/strict"
import {
  expectedPinCount,
  footprinterPadCount,
  parseImportedChip,
  parseImportOutput,
  applyGates,
  mpnMatches,
} from "../src/lib/footprint.mjs"

test("expectedPinCount reads the trailing integer of a real package string", () => {
  assert.deepEqual(expectedPinCount("SOIC-16"), { pins: 16, exposedPad: false })
  assert.deepEqual(expectedPinCount("LQFP-32(7x7)"), { pins: 32, exposedPad: false })
  assert.deepEqual(expectedPinCount("DFN-8-EP(2x3)"), { pins: 8, exposedPad: true })
  // Leading numbers are family/body codes, not pin counts.
  assert.deepEqual(expectedPinCount("SOT-23-6"), { pins: 6, exposedPad: false })
  assert.deepEqual(expectedPinCount("SC-70-5"), { pins: 5, exposedPad: false })
  assert.deepEqual(expectedPinCount("X2-QFN-12(1.6x1.6)"), { pins: 12, exposedPad: false })
  assert.deepEqual(expectedPinCount("USON-8-EP(2x3)"), { pins: 8, exposedPad: true })
})

test("expectedPinCount returns null rather than guessing from a body size", () => {
  // "24x16mm" is a dimension. Reading 16 out of it would fail a good part on an
  // invented constraint, so the gate must be skipped instead.
  assert.equal(expectedPinCount("SMD,24x16mm"), null)
  assert.equal(expectedPinCount("SMD,15x12.3mm"), null)
  assert.equal(expectedPinCount("CUSTOM"), null)
  assert.equal(expectedPinCount(""), null)
})

test("footprinterPadCount reads the leading family token", () => {
  assert.deepEqual(
    footprinterPadCount("dfn8_thermalpad1.75mmx1.63mm_p0.5mm_w3.42mm_pw0.28mm_pl0.58mm"),
    { pads: 8, thermalPad: true }
  )
  assert.deepEqual(footprinterPadCount("qfn32_pillpads_p0.8mm_h10.36mm"), {
    pads: 32,
    thermalPad: false,
  })
  assert.deepEqual(footprinterPadCount("lga12_grid2x4_p0.4mm_w2.01mm"), {
    pads: 12,
    thermalPad: false,
  })
  assert.equal(footprinterPadCount(""), null)
})

const chipSource = (labels, footprint) => `
import type { ChipProps } from "@tscircuit/props"
const pinLabels = {
${Object.entries(labels).map(([k, v]) => `  ${k}: [${v.map((x) => `"${x}"`).join(", ")}]`).join(",\n")}
} as const
export const Thing = (props: ChipProps<typeof pinLabels>) => (
  <chip footprint="${footprint}" manufacturerPartNumber="THING-1" {...props} />
)
`

test("parseImportedChip detects the placeholder-pin signature", () => {
  const placeholders = { pin1: ["pin1"], pin2: ["VDD"], pin3: ["pin3"], pin4: ["pin4"] }
  const chip = parseImportedChip(chipSource(placeholders, "soic4_p1mm"))
  assert.equal(chip.pinCount, 4)
  assert.deepEqual(chip.placeholderPins, ["pin1", "pin3", "pin4"])
  assert.equal(chip.placeholderRatio, 0.75)
  assert.equal(chip.footprint, "soic4_p1mm")
  assert.equal(chip.manufacturerPartNumber, "THING-1")
  assert.equal(chip.exportName, "Thing")
})

test("a fully named symbol has no placeholders", () => {
  const chip = parseImportedChip(
    chipSource({ pin1: ["SDA"], pin2: ["SCL"], pin3: ["GND"], pin4: ["VDD"] }, "soic4_p1mm")
  )
  assert.equal(chip.placeholderPins.length, 0)
  assert.equal(chip.placeholderRatio, 0)
})

test("parseImportOutput reads the footprinter, IoU and the no-results case", () => {
  const ok = parseImportOutput(
    `- Searching...\n- Importing "C194710" from JLCPCB...\n` +
      `✔ Imported C:\\x\\imports\\MCP9808T_E_MC.tsx\n` +
      `Using footprinter "dfn8_thermalpad1.75mmx1.63mm_p0.5mm" (99.50% copper IoU).`
  )
  assert.equal(ok.noResults, false)
  assert.equal(ok.iou, 99.5)
  assert.equal(ok.lcsc, "C194710")
  assert.equal(ok.footprinter, "dfn8_thermalpad1.75mmx1.63mm_p0.5mm")
  assert.match(ok.importedPath, /MCP9808T_E_MC\.tsx$/)

  // tsci exits 0 on a miss, so this string is the only success signal there is.
  const miss = parseImportOutput(`- Searching...\nNo results found for "NOPE" in the tscircuit registry or JLCPCB.`)
  assert.equal(miss.noResults, true)
  assert.equal(miss.importedPath, null)
})

test("the IoU gate rejects a low-overlap match", () => {
  const chip = parseImportedChip(chipSource({ pin1: ["A"], pin2: ["B"] }, "soic2_p1mm"))
  const gates = applyGates(chip, { iou: 71.2 }, "SOIC-2", { iouThreshold: 98 })
  assert.equal(gates.passed, false)
  assert.ok(gates.failures.some((f) => f.includes("71.2")))
})

test("the pad-count gate rejects a package/symbol disagreement", () => {
  const chip = parseImportedChip(
    chipSource({ pin1: ["A"], pin2: ["B"], pin3: ["C"], pin4: ["D"] }, "soic4_p1mm")
  )
  const gates = applyGates(chip, { iou: 99.9 }, "SOIC-16")
  assert.equal(gates.passed, false)
  assert.ok(gates.failures.some((f) => f.includes("4 pins") && f.includes("16")))
})

test("an exposed pad is allowed as one extra symbol pin", () => {
  const labels = {}
  for (let i = 1; i <= 9; i++) labels[`pin${i}`] = [`S${i}`]
  const chip = parseImportedChip(chipSource(labels, "dfn8_thermalpad1.75mmx1.63mm_p0.5mm"))
  const gates = applyGates(chip, { iou: 99.5 }, "DFN-8-EP(2x3)")
  assert.equal(gates.passed, true, gates.failures.join("; "))
})

test("placeholder pins are noted but do not fail the gates", () => {
  const labels = {}
  for (let i = 1; i <= 8; i++) labels[`pin${i}`] = [`pin${i}`]
  const chip = parseImportedChip(chipSource(labels, "soic8_p1.27mm"))
  const gates = applyGates(chip, { iou: 99.1 }, "SOIC-8")
  assert.equal(gates.passed, true)
  assert.ok(gates.notes.some((n) => n.includes("PLACEHOLDER PINS")))
})

test("an unreadable package skips the pad-count gate instead of failing it", () => {
  const labels = {}
  for (let i = 1; i <= 16; i++) labels[`pin${i}`] = [`S${i}`]
  const chip = parseImportedChip(chipSource(labels, "dfn16_p2mm_w16.9996mm"))
  const gates = applyGates(chip, { iou: 99.0 }, "SMD,24x16mm")
  assert.equal(gates.passed, true, gates.failures.join("; "))
  assert.ok(gates.notes.some((n) => n.includes("pad-count gate skipped")))
})

test("mpnMatches tolerates ordering-code tails but not a different device", () => {
  assert.equal(mpnMatches("MCP9808T-E/MC", "MCP9808T-E/MC"), true)
  // The catalogue returns a shorter form of the same ordering code.
  assert.equal(mpnMatches("PC817B-MS", "PC817B"), true)
  assert.equal(mpnMatches("IS25LP040E-JYLE-TR", "IS25LP040E-JYLE-TR"), true)
  // The real failure this gate exists for: a WiFi module resolving to a
  // quad comparator because the catalogue keyword search guessed.
  assert.equal(mpnMatches("ESP-M1", "LM139DR(UMW)"), false)
  assert.equal(mpnMatches("TP4110", "MC9S08DZ32ACLC"), false)
  // Nothing to compare on: other gates still apply.
  assert.equal(mpnMatches("", "ANYTHING"), true)
})

test("the part-identity gate rejects a wrong device with a perfect footprint", () => {
  const labels = {}
  for (let i = 1; i <= 14; i++) labels[`pin${i}`] = [`pin${i}`]
  const source = chipSource(labels, "dfn14_p1.27mm_w6.6599mm").replace(
    'manufacturerPartNumber="THING-1"',
    'manufacturerPartNumber="LM139DR(UMW)"'
  )
  const chip = parseImportedChip(source)

  // Exactly the shape of the real miss: unreadable package (pad-count gate
  // skipped) and a high IoU against the WRONG part's land pattern.
  const gates = applyGates(chip, { iou: 99.4 }, "SMD,15x12.3mm", { declaredMpn: "ESP-M1" })
  assert.equal(gates.passed, false)
  assert.ok(gates.failures.some((f) => f.includes("LM139DR") && f.includes("ESP-M1")))
})

test("the part-identity gate passes the part that was asked for", () => {
  const chip = parseImportedChip(chipSource({ pin1: ["A"], pin2: ["B"] }, "soic2_p1mm"))
  const gates = applyGates(chip, { iou: 99.9 }, "SOIC-2", { declaredMpn: "THING-1" })
  assert.equal(gates.passed, true, gates.failures.join("; "))
  assert.ok(gates.notes.some((n) => n.includes("part identity")))
})

test("a JEDEC type code is not read as a pin count", () => {
  // TO-92 is a three-lead package. Reading 92 out of it made the pad-count gate
  // reject a correctly synthesised `to92` footprint (3 pads) as wrong.
  assert.equal(expectedPinCount("TO-92"), null)
  assert.equal(expectedPinCount("TO-220"), null)
  assert.equal(expectedPinCount("SOT-23"), null)
  assert.equal(expectedPinCount("SC-70"), null)
  assert.equal(expectedPinCount("SOD-123"), null)

  // A second number after the type code IS the lead count.
  assert.deepEqual(expectedPinCount("SOT-23-6"), { pins: 6, exposedPad: false })
  assert.deepEqual(expectedPinCount("SC-70-5"), { pins: 5, exposedPad: false })

  // Counting families are unaffected.
  assert.deepEqual(expectedPinCount("DIP-40"), { pins: 40, exposedPad: false })
  assert.deepEqual(expectedPinCount("SOIC-16"), { pins: 16, exposedPad: false })
})

test("a TO-92 footprint is accepted rather than gated out", () => {
  const chip = parseImportedChip(
    chipSource({ pin1: ["A"], pin2: ["B"], pin3: ["C"] }, "to92")
  )
  const gates = applyGates(chip, { iou: 99.0 }, "TO-92", { declaredMpn: "THING-1" })
  assert.equal(gates.passed, true, gates.failures.join("; "))
})
