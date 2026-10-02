/**
 * The structured path's model-free build fixes, shared by the CLI and the
 * eval so both measure the same pipeline.
 *
 * 1. Place in code (lib/placement.mjs): the first build uses grid layout only
 *    to learn each footprint's real size; the parts are then packed at 0 deg
 *    in connectivity order and the board rebuilt with explicit coordinates.
 *    Grid layout rotates parts and can leave a board unroutable — see
 *    lib/placement.mjs for the measurement.
 * 2. Parts still outside the board mean the outline is too small: grow it
 *    30%, up to three times.
 *
 * A step is kept only when it does not make the board worse.
 */

import { note, stage } from "./events.mjs"
import { hasOffBoardParts } from "./drc.mjs"
import { footprintSizes, packParts } from "./placement.mjs"

const better = (next, prev) =>
  next.stats.traces > prev.stats.traces ||
  (next.stats.traces === prev.stats.traces && next.stats.errors <= prev.stats.errors)

export async function applyStructuredFixes(structured, outputs, build) {
  const sizes = footprintSizes(outputs.circuitJson)
  if (Object.keys(sizes).length) {
    const attach = Object.fromEntries((structured.support ?? []).map((s) => [s.ref, s.near]))
    const packed = packParts(
      sizes,
      structured.mapping.assignments,
      { widthMm: structured.size.widthMm, heightMm: structured.size.heightMm },
      attach
    )
    const before = { ...structured.size }
    structured.size.placement = packed.placement
    structured.size.widthMm = packed.widthMm
    structured.size.heightMm = packed.heightMm
    note(`  placed ${Object.keys(packed.placement).length} part(s) in code on a ${packed.widthMm} x ${packed.heightMm} mm board`)
    stage("E", "running", `parts placed in code — ${packed.widthMm} x ${packed.heightMm} mm`)
    await structured.emit()
    const placed = await build()
    if (better(placed, outputs)) outputs = placed
    else {
      note("  code placement did not improve the board; keeping grid layout")
      Object.assign(structured.size, before)
      delete structured.size.placement
      await structured.emit()
    }
  }

  for (let grow = 1; grow <= 3 && hasOffBoardParts(outputs.circuitJson); grow++) {
    structured.size.widthMm = Math.round(structured.size.widthMm * 1.3)
    structured.size.heightMm = Math.round(structured.size.heightMm * 1.3)
    note(`  parts outside the board — growing it to ${structured.size.widthMm} x ${structured.size.heightMm} mm`)
    stage("E", "running", `board grown to ${structured.size.widthMm} x ${structured.size.heightMm} mm`)
    await structured.emit()
    const grown = await build()
    if (grown.stats.errors > outputs.stats.errors) break
    outputs = grown
  }
  return outputs
}
