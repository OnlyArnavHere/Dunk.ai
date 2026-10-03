/**
 * Standard packages -> footprinter strings, tried in tier 5 BEFORE asking a
 * model to invent one.
 *
 * Measured on a real run: for HDC2010YPAR (DSBGA-6) the model answered
 * `bga6_p0.8mm_w1.6mm_h2.4mm`, which compiles to NINE pads (footprinter's bga
 * defaults to a square grid), and the part was dropped from the board.
 * `bga6_grid2x3_p0.5mm` compiles to six. Common JEDEC packages do not need a
 * model; they need a lookup.
 *
 * Every candidate is still compiled and pad-counted by the caller
 * (validateFootprintString) before it is accepted, so a wrong guess here costs
 * one rejected candidate, never a broken board. Families footprinter does not
 * implement (sc70, wson) are simply absent and fall through to the provider.
 *
 * These are generic land patterns, not the vendor's: they are reported as
 * "standard package footprint, not catalogue-verified" like any tier-5 result.
 */

/** rows x cols closest to square for an n-ball array (6 -> 2x3, 9 -> 3x3). */
function grid(n) {
  let best = [1, n]
  for (let r = 1; r * r <= n; r++) if (n % r === 0) best = [r, n / r]
  return best
}

/**
 * @param {string} packageString  the IR's declared package, e.g. "DSBGA-6", "LQFP-48(7x7)"
 * @returns {string[]} footprinter strings to try, most specific first
 */
export function standardFootprintCandidates(packageString) {
  const raw = String(packageString ?? "").toUpperCase().replace(/\([^)]*\)/g, " ").trim()
  const n = (re) => {
    const m = raw.match(re)
    return m ? Number(m[1]) : null
  }
  const out = []

  // Chip passives and two-terminal packages
  const chip = raw.match(/\b(0201|0402|0603|0805|1206|1210|2010|2512)\b/)
  if (chip) out.push(chip[1])
  if (/\bSOD-?123\b/.test(raw)) out.push("sod123")
  if (/\bSOD-?323\b/.test(raw)) out.push("sod323")

  // Small-outline transistor packages
  if (/\bSOT-?223\b/.test(raw)) out.push("sot223")
  else if (/\bSOT-?89\b/.test(raw)) out.push("sot89")
  else if (/\bSOT-?363\b|\bSC-?70-?6\b/.test(raw)) out.push("sot363")
  else if (/\bSOT-?23\b/.test(raw)) {
    const pins = n(/SOT-?23-?(\d)\b/)
    out.push(pins === 5 ? "sot23_5" : pins === 6 ? "sot23_6" : "sot23")
  }
  if (/\bTO-?92\b/.test(raw)) out.push("to92")

  // Ball arrays: wafer-level parts are fine-pitch, BGA proper is 0.8 mm+.
  const balls = n(/\b(?:DSBGA|WLCSP|CSP|XBGA|UCSP)-?(\d+)/)
  if (balls) {
    const [r, c] = grid(balls)
    out.push(`bga${balls}_grid${r}x${c}_p0.5mm`, `bga${balls}_grid${r}x${c}_p0.4mm`)
  } else {
    const bga = n(/\b(?:FBGA|LFBGA|TFBGA|BGA)-?(\d+)/)
    if (bga) {
      const [r, c] = grid(bga)
      out.push(`bga${bga}_grid${r}x${c}_p0.8mm`)
    }
  }

  // Leaded and leadless ICs
  const fam = [
    [/\b(?:TSSOP|HTSSOP)-?(\d+)/, (p) => `tssop${p}`],
    [/\b(?:MSOP|VSSOP|HVSSOP)-?(\d+)/, (p) => `msop${p}`],
    [/\b(?:SSOP|QSOP)-?(\d+)/, (p) => `ssop${p}`],
    [/\b(?:SOIC|SO|SOP|ESOP)-?(\d+)/, (p) => `soic${p}`],
    [/\b(?:VQFN|WQFN|UQFN|TQFN|QFN)-?(\d+)/, (p) => `qfn${p}_p0.5mm`],
    [/\b(?:DFN|TDFN|UDFN|VDFN|WSON|SON|USON|VSON)-?(\d+)/, (p) => `dfn${p}`],
    [/\b(?:LQFP|TQFP|QFP)-?(\d+)/, (p) => `lqfp${p}_p${p <= 32 ? "0.8" : "0.5"}mm`],
    [/\b(?:PDIP|DIP)-?(\d+)/, (p) => `dip${p}`],
  ]
  for (const [re, make] of fam) {
    const pins = n(re)
    if (pins) {
      out.push(make(pins))
      break
    }
  }
  return [...new Set(out)]
}
