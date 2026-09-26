# DECISIONS

Non-trivial choices made in **this repo (dunkai-designer)** without asking, and
things deliberately deferred rather than guessed at.

dunkai keeps its own separately-numbered log in `../dunkai/DECISIONS.md`, and the
PCB module keeps a third in `pcb-agent/DECISIONS.md`. The `D-NNN` sequences are
independent, so a cross-repo citation must always name the repo — e.g. "dunkai
DECISIONS.md D-001".

---

## D-001 — Four dependency versions are pinned through `overrides`, not by taste

**Status:** Accepted

`package.json` pins `@tscircuit/circuit-json-util`, `@tscircuit/cli` and `zod`
via `overrides`, and declares `three` and `zod` directly. None of this is
tidiness. Each one is a build that does not run otherwise, found by installing
the obvious dependency set and watching it fail:

| Pin | Floated to | Symptom |
|---|---|---|
| `@tscircuit/circuit-json-util` 0.0.115 | 0.0.113 | `tscircuit/dist/index.js` throws at import: does not provide an export named `getPlatedHolePolygon` |
| `@tscircuit/cli` 0.1.2124 | 0.1.2143 | `tsci import` dies with `ERR_UNSUPPORTED_DIR_IMPORT` on `calculate-elbow/lib` — the newer CLI imports a subpath that `calculate-elbow` 0.0.12 does not ship |
| `zod` 3.25.76 | 4.6.5 | `@tscircuit/props` throws `z152.function(...).args is not a function` — `.args()` is Zod 3 API, removed in Zod 4 |
| `three` 0.186.0 | absent | `circuit-json-to-gltf` fails: `Cannot find package 'three'`, required by `jscad-electronics` |

The versions are the ones resolved in `tscircuit/gas-leakage-detector`, which is
the tree that demonstrably produces a DRC-clean board. `zod` is *also* a direct
dependency because an override alone removes the hoisted copy without installing
a replacement, and `circuit-json` then fails to resolve `zod` at all.

Re-pin by intent: bump a line when this project is tested against the newer
version, not because a resolver offered it.

## D-002 — A schema-1.0 pin name is carried as `asserted_pin`, never as `role`

**Status:** Accepted

Stage A normalises both pcb_ir schemas onto one shape, but does not flatten the
difference between them.

Under schema 2.0 dunkai emits a ROLE per net member and deliberately makes no
claim about which pad carries it. Under 1.0 it emitted `"U1.SDA"`, where the pin
name came from a fixed interface→name table that never consulted the selected
part — and the backing dataset carries no pinout data at all, so those names are
frequently fabricated (dunkai `supervisor/nodes.py`, pcb-agent D-076).

So 1.0 pin names land in `asserted_pin`, the role is derived from `net_class`,
and `provenance.pin_names_asserted` is set. The brief renders them as
`[claimed pin: X]` and instructs the generator to use one only when the imported
symbol actually has a pin by that name. Promoting an asserted pin to a role
would reintroduce the exact bug schema 2.0 exists to remove, while making the
output look more confident.

## D-003 — `tsci import` success is decided by the file, never the exit code

**Status:** Accepted

`tsci import --jlcpcb ZZQQ-NOT-A-REAL-PART-9999` prints
`No results found for ... in the tscircuit registry or JLCPCB.` and **exits 0**.
Verified directly. Any tier that trusted `code === 0` would accept every
unresolvable part, and the failure would surface much later as a board missing
components for no stated reason.

Stage B therefore snapshots `imports/` before the call and treats a resolution as
successful only when a new `.tsx` appears *and* passes the gates. The exit code
is not consulted.

## D-004 — Three independent pin counts must agree, not one

**Status:** Accepted

The pad-count gate compares what the IR **claims** (`package`, e.g.
`DFN-8-EP(2x3)`), what the **symbol** provides (`pinLabels` count in the imported
`.tsx`), and what the **footprint** provides (the count encoded in the
footprinter name, e.g. `dfn8_…`). A resolution is accepted only when they agree,
allowing one extra pin for an exposed pad.

Checking only the IoU is not enough: IoU measures copper overlap against
*whatever land pattern the vendor returned*, so a part matched to the wrong
package can still report 99%. Measured on real imports: `DFN-8-EP(2x3)` → symbol
9 / footprint 8 + thermal (accepted via the exposed-pad allowance),
`X2-QFN-12(1.6x1.6)` → 12 / 12, `LQFP-32(7x7)` → 32 / 32.

The package parser returns `null` rather than a guess when it sees no recognised
family token — `SMD,24x16mm` is a body size, and reading `16` out of it as a pin
count would fail a perfectly good part on an invented constraint.

## D-005 — Placeholder pins are recorded, not rejected

**Status:** Accepted

When a vendor symbol carries no real pin names, `tsci import` emits
`pin7: ["pin7"]` — the label is literally the key. Verified on
`MC9S08DZ32ACLC`, where **29 of 32** pins came back that way; on the Phase 1
board this was fixed by hand against the datasheet.

Such a part is still real and its footprint may be perfect, so the gate does not
reject it. What it costs is the ability to wire by signal name, so the component
is listed in the brief under **UNNAMED PINS** with its usable names enumerated,
and the generator is told to wire it by pin number. Rejecting it would discard a
good part; ignoring it produces a board that compiles and is wrong.

## D-006 — The brief is assembled deterministically, not written by a model

**Status:** Accepted

Stage C is plain string assembly over Stage A's output and Stage B's findings.
A model call here would let requirements drift between the handoff and the board
while still reading plausibly — the failure mode that is hardest to notice and
most expensive to find later. The model is used where judgement is actually
required: Stage D generation, and Stage B tier 5 land-pattern synthesis.

## D-007 — Stage E reports DRC errors; it does not throw by default

**Status:** Deferred, and deliberately not the default

An errored board still gets its `circuit.json`, SVGs and Gerbers written, because
the SVGs are how a person sees *what* went wrong. `--fail-on-error` turns error
elements into a non-zero exit for CI use. Whether the product should refuse to
display an errored board is a **product** decision that belongs to the caller,
not to the build step, and it is not made here.

## D-008 — `tsci build` is bypassed on purpose

**Status:** Accepted, inherited from Phase 1

Stage E drives the tscircuit evaluator over an in-memory fs map rather than
shelling out to `tsci build`. On Windows the CLI dynamic-imports the entry point
by absolute path and fails with
`ERR_UNSUPPORTED_ESM_URL_SCHEME … Received protocol 'c:'`. `tsci export` fails
identically. `tsci import` and `tsci dev` are unaffected, which is why Stage B
still uses the CLI.

## D-009 — EasyEDA's search API is bot-walled from here; jlcsearch is used instead

**Status:** Accepted, and it implies a finding about dunkai

`https://easyeda.com/api/products/search` returns **HTTP 403** with a Cloudflare
challenge page from this network. That is the endpoint
`../dunkai/ai_engine/agents/component_agent/eda.py::fetch_easyeda_metadata` calls
on every BOM row — and it swallows all exceptions and returns
`{"mfr_part": query, "package": ""}`, so dunkai's "live EasyEDA enrichment"
degrades silently to the CSV values with nothing logged.

Stage B uses `https://jlcsearch.tscircuit.com/api/search?q=…` instead, which is
tscircuit's own JLCPCB proxy and the same source `tsci import` resolves against —
so disambiguation and import cannot disagree. Its `package` strings match
dunkai's IR format exactly (`DFN-8-EP(2x3)`), which is what makes package-based
scoring reliable rather than fuzzy.

Not fixed in dunkai here: that is another repo, and the honest fix is for
`eda.py` to report the failure rather than to change endpoint silently.

## D-010 — Resolution concurrency is bounded at 4

**Status:** Accepted

Stage B resolves components in parallel, four at a time. These are live calls to
a shared catalogue service; a wide fan-out gets throttled, and a throttled
response is indistinguishable downstream from "this part does not exist". The
limit is `--concurrency`.

## D-011 — A catalogue search returns a guess, so part identity is gated

**Status:** Accepted

Tier 2 hands the requested MPN to `tsci import --jlcpcb` and takes what comes
back. That is a *keyword search*, not a lookup, and on a real run it returned a
completely different device:

| Requested | Resolved | Reality |
|---|---|---|
| `ESP-M1` (WiFi module, `SMD,15x12.3mm`) | `LM139DR(UMW)` | quad comparator |

It passed every gate that existed. The declared package carries no readable pin
count, so the pad-count gate was **skipped** (D-004, working as designed); and
the IoU was **99.4%**, because IoU measures copper overlap against the land
pattern of *the part that came back*, never against the part that was asked for.
The result is a board carrying the wrong silicon under a beautifully matched
footprint — which is strictly worse than a failed resolution, because nothing
downstream can tell.

`applyGates` now takes `declaredMpn` and compares it to the imported symbol's
`manufacturerPartNumber`. The comparison is deliberately tolerant — the
catalogue routinely returns a shorter form of the same ordering code
(`PC817B-MS` imports as `PC817B`) — so a shared normalised prefix of four or
more characters passes, and anything else fails the attempt down to the next
tier, where candidates are scored against the requested MPN explicitly.

Tiers 3 and 4 choose a *different* part on purpose, so they gate against the
candidate they picked and record the difference from the original request as a
substitution, which the brief then states out loud.

## D-012 — A synthesised footprint is compiled before it is accepted

**Status:** Accepted

Tier 5 asks the provider for a footprinter string. On a real run it produced
`sot3_p1.27mm_w4.2mm_pw0.6mm_pl1.2mm` for a TO-92 part, which footprinter
rejects: `sot` is a **six**-pad builder, and the 3-pad TO-92 land pattern is
`sot23_3`.

Nothing downstream caught it usefully. The evaluator accepted the component,
reported one `source_invalid_component_property_error`, gave the part no pads,
and from there:

```
 1  source_invalid_component_property_error   <- the actual cause
 2  pcb_placement_error
 2  pcb_footprint_overlap_error
 1  pcb_courtyard_overlap_error
 2  pcb_autorouting_error        "Autorouting was skipped because 5 PCB
56  pcb_port_not_connected_error  placement errors were found"
16  pcb_trace_missing_error
```

**80 error elements and zero traces**, 72 of them pure cascade. tscircuit runs
placement DRC *before* routing and skips the autorouter entirely when it fails,
so one bad string costs every trace on the board.

Tier 5 now compiles the string with `@tscircuit/footprinter` and checks the
resulting pad count against the package before accepting it, retrying once with
the compiler's own error fed back. The provider is also given the list of 102
implemented family names, because `sot3` is exactly the kind of plausible
invention that list prevents. A component that still fails is returned
unresolved — omitted and reported, rather than poisoning the whole board.

## D-013 — The build is verified and repaired, not shipped broken

**Status:** Accepted

tscircuit runs placement DRC **before** routing and skips the autorouter
entirely when placement fails:

```
Autorouting was skipped because 13 PCB placement errors were found.
```

So placement is not a cosmetic concern — one part in the wrong place costs every
trace on the board. On a real run a DIP-40 placed 12.93 mm past the board edge
produced **63 error elements and zero traces**, of which 49 were simply its own
ports reporting unconnected and 12 were its plated holes touching the edge. One
root cause, sixty-three symptoms.

The DRC messages are specific and actionable — *"Component U1 extends outside
board boundaries by 12.93mm. Try moving it 12.93mm down"* — which is enough to
act on, so Stage E now builds, checks, and hands the distinct errors plus the
current floorplan back to the provider for a repair pass, then rebuilds. Bounded
by `--repair-attempts` (default 2) and stopped early when a pass does not reduce
errors or increase traces, so a provider that cannot fix the board cannot spin.

Measured on that board: the first pass recognised the parts did not fit, grew
the outline to 140 x 90 mm, rotated the DIP-40 to lie along X and left a comment
saying why.

| | errors | traces |
|---|---|---|
| first build | 63 | 0 |
| after one repair pass | **1** | **37** |

`pcb_port_not_connected_error` is deliberately excluded from the messages sent to
the repair pass: it is almost always a *consequence* of a placement failure, and
including 49 copies of a downstream symptom buries the one line that says what is
actually wrong.

## D-014 — The Gerber set ships as a zip, written without a dependency

**Status:** Accepted

Stage E wrote `dist/gerbers/` and the result reported `gerbersDir`. The frontend
linked that directory, and the link does not work: `express.static` does not
list directories, so it answers 301 and then 404. Measured against the running
backend:

```
/uploads/.../dist/gerbers          -> 301 -> 404
/uploads/.../dist/gerbers/F_Cu.gbr -> 200
```

The loose files were fine; there was simply no way to hand somebody *the set*.
Every fabricator, JLCPCB included, takes Gerbers as a single archive, so Stage E
now also writes `dist/gerbers.zip` and reports it as `gerbersZip`. `gerbersDir`
stays — the loose files are still on disk and still the thing to read.

The writer is ~60 lines over `node:zlib` (`src/lib/zip.mjs`) rather than
`archiver`, because installing a new dependency means running the resolver
against a tree whose four critical versions are held by `overrides` — every one
of them a build that does not run when it floats (D-001). Only the part of the
format this needs is implemented: deflate, no encryption, no Zip64. The measured
set is 14 files and 229 KB, so the 4 GB / 65535-entry limits that would force
Zip64 are not reachable from here.

Verified on the real Gerber output by reading the archive back with Python's
`zipfile`, which validates CRCs independently of the code that wrote them:

| check | result |
|---|---|
| `testzip()` CRC validation | no corrupt entries |
| byte-identical round trip | 14 / 14 files |
| compression | 234,206 B -> 47,659 B (20.3%), method 8 |
