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
  "- Do NOT set pcbX/pcbY/pcbRotation yourself and do NOT write a floorplan",
  "  file. The board uses layoutMode=\"grid\", which places every part",
  "  automatically — your only job is to declare parts and connections.",
  "- Declare every net with <net name=\"...\" /> before use.",
  "- A part listed under UNNAMED PINS must be wired by pin NUMBER (pin7=...),",
  "  never by signal name, because its symbol carries no real pin names.",
  "- Add decoupling and pull-ups where the brief asks for them.",
  "- Do not invent supplier part numbers; the imports already carry them.",
]

// Placement used to be the single biggest hazard here: tscircuit runs
// placement DRC BEFORE routing and skips the autorouter entirely when it
// finds errors ("Autorouting was skipped because 5 PCB placement errors were
// found"), so one hand-guessed coordinate produced a board with zero traces.
// layoutMode="grid" removes the failure mode structurally by having tscircuit
// place every part itself — there is no coordinate table left for a model
// (or a comment inside one) to get wrong. pcbGridGap="2mm" exists because the
// default 1mm gap is too tight for some real vendor footprints and produced
// pad-pad clearance errors even though every part individually fit fine (see
// MIN_GAP in tscircuit's Group_doInitialPcbLayoutGrid).
export const PLACEMENT_RULES = [
  "PLACEMENT is automatic — do not attempt it yourself:",
  "- The <board> element must include layoutMode=\"grid\" pcbGridGap=\"2mm\".",
  "  tscircuit lays out every part on a grid for you.",
  "- Never set pcbX/pcbY/pcbRotation and never invent a floorplan or",
  "  coordinate file — there is nothing left to place by hand.",
  "- If an error list mentions courtyard overlap or pad-pad clearance, that is",
  "  NOT something to fix by moving parts — grid placement already handles",
  "  that. Look instead for a net-name or connections mistake instead.",
]

/** What a repair pass has to reason about now that placement is automatic. */
export const REPAIR_RULES = [
  "- Placement is automatic (layoutMode=\"grid\") and is essentially never the",
  "  actual cause of an error anymore — do not add pcbX/pcbY or a floorplan.",
  "- Check every <net name=\"...\"> the connections reference is actually",
  "  declared before use. tscircuit does NOT error on a name mismatch — it",
  "  silently creates a new orphan net instead — so a typo'd net name is the",
  "  most common cause of a net reporting unconnected even though the code",
  "  looks correctly wired.",
  "- Check every pin key in connections={{...}} against the part's REAL pin",
  "  names/numbers from the design brief. An invented pin name throws rather",
  "  than silently failing, so it will be in the error text verbatim.",
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

src/board.tsx:
  import { STC89C52RC_40I_PDIP40 } from "../imports/STC89C52RC_40I_PDIP40"

  export default () => (
    <board width="140mm" height="90mm" layers={4} autorouter="auto" layoutMode="grid" pcbGridGap="2mm">
      <net name="POWER_RAIL" />
      <net name="GND" />

      <STC89C52RC_40I_PDIP40
        name="U1"
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
- The root element is <board ...> with width, height, layers, autorouter,
  layoutMode="grid" and pcbGridGap="2mm". A bare fragment <> is WRONG and
  produces no board at all.
- Do NOT add pcbX/pcbY/pcbRotation props and do NOT write a floorplan file —
  layoutMode="grid" places every part; there is nothing to compute by hand.
- Each part is its OWN element named after the import, e.g. <TP4110 name="U3" />.
  There is no <component> element in tscircuit; inventing one builds nothing.
- Imports are NAMED: import { TP4110 } from "../imports/TP4110" — not default.
- Connections go in a connections={{ ... }} object, with values "net.<NAME>".
- STC89C52RC_40I_PDIP40 and POWER_RAIL above are only an EXAMPLE of the shape,
  not real parts for this design. Copying this exact part/net name verbatim
  instead of using THIS design's own resolved parts and nets has happened
  before and produces a board built from entirely the wrong components — use
  only the parts and nets the brief actually names.
`.trim()

/** Why a repair pass is being asked for at all. Identical wording everywhere. */
export const REPAIR_PREAMBLE = [
  "The board you generated has DRC errors. Placement itself is automatic",
  "(layoutMode=\"grid\") and is essentially never the real cause anymore — the",
  "usual cause is a net name that doesn't match its declaration, or a",
  "connections key that isn't a real pin on that part. Read the errors below",
  "for which one this is.",
]
