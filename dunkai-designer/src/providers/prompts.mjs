/**
 * Prompt fragments shared by every provider.
 *
 * These live here, not in one provider, because they are the parts that decide
 * whether the generated board is USABLE rather than merely plausible — the
 * footprinter grammar and, above all, the placement rules. tscircuit runs
 * placement DRC before routing and skips the autorouter entirely when placement
 * fails, so a provider that forgets those rules produces a board with zero
 * traces. Two providers drifting on this text would mean the same design
 * silently routes on one model and not on another, which is exactly the failure
 * that is hardest to attribute.
 *
 * Anything provider-SPECIFIC (how files get written, how the reply is framed)
 * stays in the provider. Only the engineering truth lives here.
 */

export const FOOTPRINTER_GUIDE = `
tscircuit footprinter strings describe PAD GEOMETRY, not a marketing package name.
Grammar: <family><padcount>_<modifier>_<modifier>...
Common modifiers:
  p<n>mm        pad pitch (centre to centre)
  w<n>mm        pad-to-pad span across the body (outer edge to outer edge)
  h<n>mm        span on the other axis, for four-sided parts
  pw<n>mm       individual pad width
  pl<n>mm       individual pad length
  pillpads      rounded/oblong pads rather than rectangles
  thermalpad<w>mmx<h>mm   exposed centre pad with explicit size
  pin1location(<side>,<corner>)   e.g. pin1location(bottomside,left)
Families: soic, sop, ssop, tssop, msop, qfn, dfn, lqfp, qfp, son, son, lga, bga,
sot, dip, pinrow, and passives like 0402/0603/0805.

Real examples that shipped on a working board:
  LQFP-32 (7x7)    -> qfn32_pillpads_p0.8mm_h10.36mm_pw0.45mm_pl1.68mm_pin1location(bottomside,left)
  DFN-8-EP (2x3)   -> dfn8_thermalpad1.75mmx1.63mm_p0.5mm_w3.42mm_pw0.28mm_pl0.58mm
  SOT-23-6         -> soic6_p0.95mm_w3.8mm_pl1.1mm_pin1location(rightside,bottom)
  SOIC-16          -> soic16_pillpads_w7.44mm_pl1.97mm_pin1location(leftside,bottom)
  SMD 24x16mm      -> dfn16_p2mm_w16.9996mm_pw1mm_pl1.5mm
Note the LQFP maps onto the qfn family: the family token selects a pad LAYOUT,
so a gull-wing part uses the four-sided builder with explicit pad dimensions.
`.trim()

/** What the board sources must contain, independent of who writes them. */
export const BOARD_FILE_RULES = [
  "Rules:",
  "- Import each resolved part from ./imports/<Name> exactly as the brief names it.",
  "- Keep placement out of the netlist file: coordinates live in floorplan.ts.",
  "- Declare every net with <net name=\"...\" /> before use.",
  "- A part listed under UNNAMED PINS must be wired by pin NUMBER (pin7=...),",
  "  never by signal name, because its symbol carries no real pin names.",
  "- Add decoupling and pull-ups where the brief asks for them.",
  "- Do not invent supplier part numbers; the imports already carry them.",
]

// Placement is not cosmetic. tscircuit runs placement DRC BEFORE routing and
// skips the autorouter entirely when it finds errors:
//   "Autorouting was skipped because 5 PCB placement errors were found."
// On a real run two overlapping footprints produced 80 error elements and zero
// traces — every net reported unconnected as a consequence.
export const PLACEMENT_RULES = [
  "PLACEMENT — this decides whether the board routes at all:",
  "- tscircuit checks placement BEFORE routing and SKIPS the autorouter",
  "  completely if any placement error exists, which leaves the board with",
  "  zero traces and every net reported unconnected.",
  "- No two footprints may overlap, and no two courtyards may touch. Work out",
  "  each part's real body size from its package (a DIP-40 is ~50 x 15 mm, a",
  "  DIP-18 ~23 x 8 mm, an SSOP-24 ~8 x 6 mm, an 0402 ~1 x 0.5 mm) and leave",
  "  at least 2 mm of clear space between adjacent part outlines.",
  "- Keep every pad and hole at least 1 mm inside the board outline; copper",
  "  closer than 0.2 mm to the edge is a placement error.",
  "- Lay the large through-hole parts out first, in rows, then fit the small",
  "  passives into the gaps beside the pins they belong to.",
  "- If the parts genuinely do not fit the board outline in the brief, make",
  "  the board larger and say so in a comment at the top of floorplan.ts.",
]

/** The geometry a repair pass has to reason about to fix a failed placement. */
export const REPAIR_RULES = [
  "- The board is centred on the origin: a W x H board spans x from -W/2",
  "  to +W/2 and y from -H/2 to +H/2. A part centred at (x,y) must have its",
  "  whole body AND all its pads inside that, with 1 mm to spare.",
  "- Work out each part's real extent before placing it. A DIP-40 body is",
  "  about 52.6 x 15.2 mm, a DIP-18 about 23 x 8 mm. `rot: 90` makes a part",
  "  run along Y, `rot: 0` along X — check which one actually fits.",
  "- Keep at least 2 mm of clear space between part outlines.",
  "- If the parts cannot fit the current outline, INCREASE the board size in",
  "  src/board.tsx and note why in a comment at the top of floorplan.ts.",
]

/**
 * A worked example of the target shape.
 *
 * The claude-code provider does not need this: the model already knows what a
 * tscircuit board looks like. Smaller chat models do not, and they fail in a
 * specific, repeatable way — a `<>` fragment instead of `<board>`, and an
 * invented `<component ref=... part=... />` element that tscircuit has never
 * had. Both produce a file that passes a naive syntax check and builds nothing.
 * Showing the skeleton is what turns that guess into a compile.
 *
 * Taken from a board that actually built and routed.
 */
export const TSCIRCUIT_SKELETON = `
=== REQUIRED SHAPE — follow this exactly ===

src/floorplan.ts:
  export const floorplan: Record<string, { x: number; y: number; rot?: number }> = {
    U1: { x: -30, y: 30 },
    U7: { x: 32, y: 22, rot: 90 },
  }

src/board.tsx:
  import { STC89C52RC_40I_PDIP40 } from "../imports/STC89C52RC_40I_PDIP40"
  import { floorplan as f } from "./floorplan"

  const at = (k: string) => ({
    pcbX: f[k].x,
    pcbY: f[k].y,
    ...(f[k].rot ? { pcbRotation: f[k].rot } : {}),
  })

  export default () => (
    <board width="140mm" height="90mm" layers={4} autorouter="auto">
      <net name="POWER_RAIL" />
      <net name="GND" />

      <STC89C52RC_40I_PDIP40
        name="U1"
        {...at("U1")}
        connections={{
          pin40: "net.POWER_RAIL",
          pin20: "net.GND",
        }}
      />
    </board>
  )

index.tsx:
  import Board from "./src/board"
  export default Board

Non-negotiable points of that shape:
- The root element is <board ...> with width, height, layers and autorouter.
  A bare fragment <> is WRONG and produces no board at all.
- Each part is its OWN element named after the import, e.g. <TP4110 name="U3" />.
  There is no <component> element in tscircuit; inventing one builds nothing.
- Imports are NAMED: import { TP4110 } from "../imports/TP4110" — not default.
- Connections go in a connections={{ ... }} object, with values "net.<NAME>".
- Every part takes {...at("<ref>")} so its position comes from floorplan.ts.
`.trim()

/** Why a repair pass is being asked for at all. Identical wording everywhere. */
export const REPAIR_PREAMBLE = [
  "tscircuit runs placement DRC BEFORE routing and skips the autorouter",
  "entirely when placement fails, so the board currently has ZERO traces",
  "and every net reports as unconnected. Fixing placement fixes all of it.",
]
