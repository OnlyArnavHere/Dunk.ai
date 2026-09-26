# dunkai-designer

Turns a dunkai `pcb_ir` handoff into a real tscircuit project and its
manufacturing outputs: Circuit JSON, schematic and PCB SVGs, a BOM, a
pick-and-place file, Gerbers with Excellon drill, and a compressed glTF board.

```bash
npm install
node src/cli.mjs --ir pcb_ir.json --out ./build/my-design
cat pcb_ir.json | node src/cli.mjs --ir - --out ./build/my-design
```

`stdout` is NDJSON progress, one event per line. Everything meant for a human
goes to `stderr`. That split is what lets the dunkai supervisor relay a run to
the browser line by line instead of buffering it.

## Stages

| | Stage | What it does |
|---|---|---|
| **A** | intake | Normalises pcb_ir schema 1.0 and 2.0 onto one internal shape. Quarantines 1.0's asserted pin names rather than trusting them — see [D-002](DECISIONS.md). |
| **B** | resolve | Resolves each component against the JLCPCB catalogue through a five-tier ladder, with acceptance gates. Runs several components at a time. |
| **C** | brief | Assembles the design brief. Deterministic string assembly, not a model call — [D-006](DECISIONS.md). |
| **D** | generate | The provider writes `src/board.tsx`, `src/floorplan.ts` and `index.tsx`. |
| **E** | outputs | Drives the tscircuit evaluator, writes `dist/`, counts DRC errors, and repairs placement when the board fails (see below). |
| **F** | 3D | `dist/board.glb` + `dist/board.gltf.json` via gltf-transform. |

### Stage B — the resolution ladder

Ordered by how much is being **assumed**, cheapest assumption first:

1. **lcsc-in-IR** — the handoff already carries a catalogue number; import it.
2. **exact MPN** — search by the manufacturer part number.
3. **disambiguate** — several catalogue hits; score them against the declared
   package, then stock and basic/preferred status, and import the best.
4. **relax** — drop the ordering/packaging suffix (`-E/MC`, `-TR`) and retry.
   A match here is a *different part number* from the one requested, so it is
   recorded as a substitution and called out in the brief.
5. **custom footprint** — nothing in the catalogue fits; the provider
   synthesises a footprinter string from the declared package.

### Stage E — build, verify, repair

tscircuit runs placement DRC **before** routing and skips the autorouter
entirely when placement fails, so one misplaced part costs every trace on the
board. Measured on a real run: a DIP-40 sitting 12.93 mm past the board edge
produced **63 error elements and zero traces**, 49 of them just its ports
reporting unconnected.

So the build is verified rather than shipped. When it fails, the distinct DRC
messages — which name the component and the distance — go back to the provider
with the current floorplan, and the board is rebuilt. Up to `--repair-attempts`
passes (default 2), stopping early if a pass does not improve things.

On that same board the first repair pass grew the outline to 140 x 90 mm, laid
the DIP-40 along X and documented why in a comment:

| | errors | traces |
|---|---|---|
| first build | 63 | 0 |
| after one repair pass | **1** | **37** |

### Stage B — the gates

A resolution is accepted only when all three pass.

* **pad-count** — three independent numbers must agree: what the IR *claims*
  (`DFN-8-EP(2x3)`), what the *symbol* provides (`pinLabels` count), and what
  the *footprint* provides (the count in `dfn8_…`). One extra pin is allowed for
  an exposed pad. Checking IoU alone is not enough, because IoU measures overlap
  against whatever land pattern the vendor returned — a part matched to the
  wrong package can still report 99%.
* **IoU** — reported copper overlap against the vendor land pattern must be at
  least `--iou-threshold` (default 98).
* **placeholder-pin** — when a vendor symbol carries no real names,
  `tsci import` emits `pin7: ["pin7"]`. Measured on `MC9S08DZ32ACLC`: **29 of 32
  pins**. This does *not* reject the part; it records that the part cannot be
  wired by signal name, and the brief tells the generator to wire it by number.

## Options

```
--ir <path|->          pcb_ir JSON file, or - for stdin        (required)
--out <dir>            project directory to build into        (required)
--provider <name>      generation provider (default claude-code)
--model <name>         model for the provider
--concurrency <n>      parallel component resolutions (default 4)
--iou-threshold <n>    minimum copper IoU % to accept (default 98)
--repair-attempts <n>  placement repair passes after a failed build (default 2)
--skip-3d              stop after stage E
--fail-on-error        exit non-zero when the board has DRC error elements
```

## What a run leaves behind

```
<out>/
  design.normalised.json   Stage A output — what the handoff actually said
  resolution.json          Stage B, per component: tier, gates, what was tried
  design-brief.md          Stage C — the specification Stage D built against
  imports/*.tsx            one file per resolved part, from `tsci import`
  src/board.tsx            the board
  src/floorplan.ts         placement, as one reviewable table
  index.tsx
  dist/
    circuit.json  schematic.svg  pcb.svg
    bom.csv  pick-and-place.csv
    gerbers/       Gerber layers + Excellon drill
    gerbers.zip    the same set as one archive, which is what a fab takes
    board.glb  board.gltf.json
```

`design-brief.md` is written **before** generation runs, so when a board comes
out wrong the exact specification it was built from is still on disk.

## Notes

`dist/board.gltf.json` has its buffer and textures inlined as data URIs, so it
is one self-contained file that can be served anywhere. `board.glb` is for KiCad,
Blender, or any glTF tool. Both use only standard Khronos extensions
(`KHR_mesh_quantization`, `EXT_meshopt_compression`) and carry identical
geometry — the compression does not touch the triangle count.

Dependency versions are pinned hard, including three `overrides`. Every one of
them is a build that does not run otherwise; see [D-001](DECISIONS.md).
