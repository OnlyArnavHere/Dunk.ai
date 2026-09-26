import { test } from "node:test"
import assert from "node:assert/strict"
import { intake } from "../src/stages/a-intake.mjs"

const V1 = {
  schema_version: "1.0",
  design_name: "v1_board",
  components: [
    { ref_id: "U1", part_class: "processing", part_number: "MCU123", package: "LQFP-32(7x7)", quantity: 1 },
    { ref_id: "U2", part_class: "sensor", part_number: "SENS9", package: "DFN-8-EP(2x3)", quantity: 1 },
  ],
  nets: [
    { name: "GND", connections: ["U1.GND", "U2.GND"], net_class: "ground" },
    { name: "I2C_SDA", connections: ["U1.SDA", "U2.SDA"], net_class: "signal" },
  ],
  constraints: { layer_count: 4, board_outline: { shape: "rectangle", width_mm: 100, height_mm: 60 } },
}

const V2 = {
  schema_version: "2.0",
  design_name: "v2_board",
  components: [
    { ref_id: "U1", part_class: "processing", part_number: "MCU123", package: "LQFP-32(7x7)", quantity: 1, lcsc: "C1337499" },
    { ref_id: "U2", part_class: "sensor", part_number: "SENS9", package: "DFN-8-EP(2x3)", quantity: 1 },
  ],
  nets: [
    { name: "GND", interface: "Power", net_class: "ground", members: [{ ref_id: "U1", role: "GROUND" }, { ref_id: "U2", role: "GROUND" }] },
    { name: "I2C_1_DATA", interface: "I2C", net_class: "signal", members: [{ ref_id: "U1", role: "DATA" }, { ref_id: "U2", role: "DATA" }] },
  ],
  constraints: { layer_count: 2, board_outline: { shape: "rectangle", width_mm: 80, height_mm: 50 } },
  wireless_links: [{ interface: "WiFi", endpoints: ["U1", "U3"], note: "wireless link, not a board net" }],
}

test("schema 1.0 pin names land in asserted_pin, never in role", async () => {
  const design = await intake(V1)
  assert.equal(design.provenance.pin_names_asserted, true)

  const sda = design.nets.find((n) => n.name === "I2C_SDA")
  assert.equal(sda.members[0].asserted_pin, "SDA")
  // The important half: the claim must NOT have become the role.
  assert.equal(sda.members[0].role, "SIGNAL")
  assert.notEqual(sda.members[0].role, "SDA")

  const gnd = design.nets.find((n) => n.name === "GND")
  assert.equal(gnd.members[0].role, "GROUND")
  assert.equal(gnd.net_class, "ground")
})

test("schema 1.0 infers an interface from the net name", async () => {
  const design = await intake(V1)
  assert.equal(design.nets.find((n) => n.name === "I2C_SDA").interface, "I2C")
  assert.equal(design.nets.find((n) => n.name === "GND").interface, "Power")
})

test("schema 2.0 keeps roles and asserts no pins", async () => {
  const design = await intake(V2)
  assert.equal(design.provenance.pin_names_asserted, false)

  const data = design.nets.find((n) => n.name === "I2C_1_DATA")
  assert.equal(data.members[0].role, "DATA")
  assert.equal(data.members[0].asserted_pin, undefined)
  assert.equal(data.interface, "I2C")
  assert.equal(design.wireless_links.length, 1)
  assert.equal(design.components[0].lcsc, "C1337499")
})

test("an unversioned payload is read as 1.0, so pin claims are not dropped", async () => {
  const { schema_version, ...unversioned } = V1
  const design = await intake(unversioned)
  assert.equal(design.provenance.pin_names_asserted, true)
  assert.equal(design.nets.find((n) => n.name === "I2C_SDA").members[0].asserted_pin, "SDA")
})

test("orphan net members are recorded and dropped", async () => {
  const design = await intake({
    ...V1,
    nets: [...V1.nets, { name: "STRAY", connections: ["U9.VCC"], net_class: "power" }],
  })
  assert.ok(design.provenance.warnings.some((w) => w.includes("U9")))
  assert.ok(!design.nets.some((n) => n.name === "STRAY"), "a net with no real members is dropped")
})

test("duplicate ref_ids are rejected rather than silently merged", async () => {
  await assert.rejects(
    () => intake({ ...V1, components: [...V1.components, V1.components[0]] }),
    /duplicate ref_id/
  )
})

test("a payload with no components is rejected", async () => {
  await assert.rejects(() => intake({ ...V1, components: [] }), /no components/)
})

test("constraints fall back only where the value is unusable", async () => {
  const design = await intake({
    ...V1,
    constraints: { layer_count: 0, board_outline: { shape: "rectangle", width_mm: -5, height_mm: 42 } },
  })
  assert.equal(design.constraints.layer_count, 2)
  assert.equal(design.constraints.board_outline.width_mm, 100)
  assert.equal(design.constraints.board_outline.height_mm, 42, "a valid value is kept")
})
