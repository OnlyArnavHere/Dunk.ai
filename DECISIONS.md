# DECISIONS

Non-trivial choices made in **this repo (dunkai)** without asking, and things
deliberately deferred rather than guessed at.

The PCB module keeps its own separately-numbered log in `pcb-agent/DECISIONS.md`.
Entries are cited across repos with the repo name attached — e.g. dunkai's
`agents/supervisor/nodes.py` cites "pcb-agent DECISIONS.md D-076" — so the two
`D-NNN` sequences are independent and must always be qualified when referenced.

---

## D-001 — `_infer_type` leaves Security/Clock/Expansion/Network unmapped

**Status:** Deferred, not accepted as correct

`parser.py::_infer_type` maps an architecture node's category to the `type` token
that goes into the embedded retrieval query. `Sensor` was missing and fell
through to `"generic"`, which measurably degraded retrieval for every sensor role;
that one is fixed.

Four categories in `architecture_agent.ALLOWED_CATEGORIES` remain unmapped and
still return `"generic"`: **Security, Clock, Expansion, Network**. Unlike `Sensor`
they have no obvious target value — the existing table's vocabulary
(`processing`, `communication`, `sensor`, `output`, `power`, `storage`) has no
natural slot for them, and inventing one would put a guessed token into the
embedding for every such part.

None of these categories has appeared in any captured profile to date. Revisit
when one does: at that point there is a real query to measure against, which
there is not today.

## D-002 — "Generate PCB" runs in the supervisor, not in the Node backend

**Status:** Accepted

`backend/README.md` states one hard rule: the Node backend has access to the
Supervisor Agent only. dunkai-designer is a separate Node/tscircuit project, so
driving it from `backend/` would break that boundary *and* invent a second
streaming mechanism next to the SSE -> Socket.io relay that already works.

Routing it through `agents/supervisor/board.py` makes board generation just
another supervisor action: `ai.controller.js` -> `callSupervisorStream` ->
the designer -> `ai:progress`. No new endpoint, no new plumbing in Node, none in
the frontend. The designer speaks NDJSON on stdout precisely so it can be
relayed line by line.

It is deliberately **not** a node in the linear graph: a board costs minutes and
a provider call, and is built when the user asks, not on every chat turn.

## D-003 — The browser sends `pcb_ir` back, because nothing persisted it

**Status:** Accepted, and it records a gap rather than endorsing it

`runStream` writes no Document, so after a pipeline run the `pcb_ir` handoff
exists only in the browser's workspace store. Board generation needs it, so the
client returns the handoff it is holding and `ai.controller.js` merges it into
the project payload.

This crosses no privilege boundary — it is the user's own design data for a
project they already passed the `getProject` access check on — but it is the
only copy, so a page refresh loses it. The honest fix is for the pipeline to
persist `pcb_ir`; that is a schema change to `Project` and is not made here.

## D-004 — Artifacts are served as `/uploads` URLs, never in the socket payload

**Status:** Accepted

The outputs are far too large to travel in a Socket.io message: the measured
board is 725 KB of `circuit.json`, 344 KB of schematic SVG, 253 KB of PCB SVG
and 1.5 MB of GLB, against an `express.json` limit of 2 MB. So the pipeline
writes into the backend's upload directory — already mounted at `/uploads` by
`app.js:40` — and returns URLs the browser fetches. Next.js rewrites `/uploads`
to the backend so it stays same-origin and cookies still apply.

`_to_artifact` rewrites paths to URLs only when the output actually sits under
that directory, and leaves a filesystem path otherwise, so a run with a custom
`DESIGNER_OUTPUT_ROOT` reports something truthful instead of a URL that 404s.

## D-005 — The generated board builds alongside the KiCad viewers, not over them

**Status:** Accepted

`pcb-view.tsx`, `pcb/board-3d.tsx` and `pcb/kicanvas-viewer.tsx` were **not**
empty stubs — they are ~620 lines of working viewer. But every one of them
consumes a `.kicad_pcb` s-expression, and dunkai-designer emits Circuit JSON,
SVG and glTF. There is no `.kicad_pcb` anywhere in the pipeline, so this is a
format mismatch, not a data-source swap: KiCanvas and `board-3d.tsx` physically
cannot render a generated board.

So generated boards take a new path — `pcb/artifact-svg.tsx` for the schematic
and layout, `pcb/board-gltf.tsx` for the real exported model — and the KiCad
sample moves behind a "View sample board" link, labelled *"Sample board · not
your design"*. `board-3d.tsx` is kept for it: it extrudes boxes from silkscreen
rectangles because a `.kicad_pcb` carries no component geometry, which is an
approximation the real GLB does not need.

Also found while wiring this: `pcb-view.tsx` read the generated board from
`aiOutput.pcb_ir.board_file`. That key is emitted nowhere — it does not appear
in the pcb_ir schema (`schema_version, design_name, components, nets,
constraints, wireless_links`) nor anywhere in `ai_engine/agents`. The branch
never fired, so the tab always showed the sample. It is now gone.

## D-006 — A board with DRC errors is shown, and labelled

**Status:** Accepted, inherited from dunkai-designer D-007

An errored board still renders, because the layout is how a person sees *what*
went wrong. It is never shown as if it were clean: the view carries an amber
"N design-rule errors — not ready to fabricate" banner with the error types, and
omitted components are called out separately. The alternative — refusing to
display it — hides the only artifact that explains the failure.

## D-007 — The SSE stream sends keepalives, because "no timeout" was not true

**Status:** Accepted

`callSupervisorStream` documents "No signal / no timeout — the stream lives as
long as the pipeline runs", and sets no AbortController. That is still not
enough: Node's fetch is undici, and undici applies a **separate 300s
`bodyTimeout` to the response body** that no signal setting touches.

Measured on a real "Generate PCB" run: stage D spent **5m53s** in one silent
block of provider time, the body timed out at 5m, and the backend logged

```
[AI Stream] job 09bb761b-397a-44e5-8df3-54b9d10d94a8 failed: terminated
```

while the designer ran to completion and wrote a **clean board — 0 DRC errors,
70 traces** — to disk. The work was never in danger; only the reporting died.
That is the worst shape this failure can take, because nothing looks wrong on
the server and the browser simply never hears back.

`_with_keepalive` in `server.py` now wraps **every** streamed action and emits
an SSE comment (`: keepalive`) after 20s of silence. It is applied at the
response layer rather than inside board generation because any slow LangGraph
node has the same exposure. The backend's `parseSSEBuffer` drops blocks with no
`data:` line, so a keepalive costs one skipped block and never reaches a socket —
but it is bytes on the wire, which is what resets the timer.

Fixed here rather than in the backend because a keepalive is the standard SSE
answer and needs no dependency; raising undici's `bodyTimeout` would fix this
one caller and leave the next one to rediscover it.

## D-008 — The board provider is chosen per request, and API providers write their own files

**Status:** Accepted

The generator was `claude-code` and nothing else. The registry in
`dunkai-designer/src/providers/index.mjs` had one entry, `DESIGNER_PROVIDER` was
unset so it always resolved to that default, and the three-vendor "BYOK" panel in
`frontend/app/settings/page.tsx` wrote keys to `localStorage` that nothing ever
read. Every board therefore cost Claude Code usage, with no way to trade quality
for price on a run the user knew was a throwaway.

Provider and model now travel **with the request** — `run-stream` body →
`SupervisorRequest` → `state["designer_provider"]` → `board.py` → `--provider`.
Carried in the LangGraph state rather than as a new argument because
`stream_board(state, job_id)` and `board_node(state)` both need it and only state
reaches both. `DESIGNER_PROVIDER` survives as the server-wide fallback, so a
caller that sends nothing still gets the old behaviour: verified, an omitted
provider still reports `provider claude-code`.

`buildSupervisorBody` now builds that body in one place. The two call sites each
inlined `JSON.stringify({ action, project, messages, files, jobId })`, which
silently dropped anything else — `agentType` was being passed by
`ai.controller.js` and discarded on every chat request even though
`SupervisorRequest` declares it and `_handle_chat` depends on it. That bug is
fixed here as a side effect, and the shared builder is what stops the next field
from repeating it.

**The real asymmetry is agency, not model quality.** `claude-code` is handed the
project directory and writes `src/board.tsx` itself; Gemini, Groq and Ollama are
chat APIs that cannot touch a filesystem. `openai-compatible.mjs` therefore asks
for `{"files": {...}}` and writes them, which means it also owns the checks the
agentic path got for free. Three consequences, each from an observed failure:

- **A worked skeleton is mandatory.** Without it, gpt-oss-120b returned a `<>`
  fragment and an invented `<component ref part />` element — a file that reads
  fine and builds nothing. `TSCIRCUIT_SKELETON` fixed it on the next run.
  `claude-code` does not get this text: it already knows the shape.
- **Syntax is validated before anything lands on disk.** A Groq repair pass
  returned `board.tsx` with a duplicated `);` on line 42, replacing a file that
  had parsed and killing the run at the next build. Files are now parsed with the
  TypeScript already in the designer's dependencies, all-or-nothing, so a bad
  reply cannot half-replace a working board. Only syntax — the generated
  `./imports/` are invisible to that parser, so type errors are expected.
- **A failed repair keeps the previous board.** `cli.mjs` ran `provider.repair`
  unguarded, so a rejected reply or a rate limit threw away a board that already
  built. It now notes the failure and stops repairing.

Retries are deliberately patient — 5s/15s/45s, honouring `Retry-After` — because
by stage D the pipeline has already spent minutes resolving components. Node's
fetch reports every transport fault as a bare `TypeError: fetch failed`; one such
fault ended a real run with no retry, so those are retried too and the message
now carries `err.cause` (`ECONNRESET`, `ENOTFOUND`) instead of "fetch failed".

Measured on the same 12-component fixture, end to end through the UI's own path:

| provider | traces | DRC errors | outcome |
|---|---|---|---|
| `groq` (openai/gpt-oss-120b) | 16 | 9 | completed, glTF built |
| `ollama` (gpt-oss:120b) | 15 | 15 | completed, glTF built |

Both leave DRC errors that `claude-code` does not, which is the trade this switch
exists to expose rather than hide — D-006 already shows and labels such a board.
`gemini` is implemented and its transport verified, but no free-tier model could
serve a real brief: every flash model answered 503 "high demand" and
`gemini-3.1-pro-preview` reported `limit: 0` on the free tier.

## D-009 — `test_fetch_retry.py` is dark: the HF cache branch broke its harness

**Status:** Deferred, and the test is NOT currently protecting anything

All 18 checks in `agents/component_agent/test_fetch_retry.py` fail, every one of
them on the same proximate error:

    FAIL  mid-stream break -> no exception escapes
            got:  NameError("name '_cache_path' is not defined")
            want: None
    FAIL  mid-stream break -> retry actually fired (3 attempts)
            got:  0     want: 3

The retry policy itself is fine. The harness is what broke. That file
deliberately avoids importing `config.py` — its module body fetches a ~754MB
dataset — and instead AST-extracts only the `_fetch_bytes` FunctionDef and
`exec`s it against injected stubs, precisely so the code under test stays the
real function rather than a copy.

D-nnn aside, this is the cost of that technique: the extracted function may
reference module-level names the harness never injected. `1924cdb` ("HF dataset:
opt-in local cache") added a cache-hit branch at the top of `_fetch_bytes` —

    cached = _cache_path(filename)
    if cached is not None and cached.is_file() ...

— and `_cache_path` is not in the injected namespace. Every case now dies on
line 1 of the function body with `attempts == 0`, before reaching the retry loop
at all.

**Why this is worth an entry rather than a quick patch.** The test exists to
guard one specific regression: `_fetch_bytes` previously caught an enumerated
`(Timeout, ConnectionError, HTTPError)` tuple, and a mid-body transfer break
surfaces as `ChunkedEncodingError` — a *sibling* under `RequestException`, not a
subclass — so it bypassed the retry and killed the Component Agent on a plainly
transient failure. Its own docstring says "if someone narrows the except clause
again, this test fails." It would not. It fails identically whether the except
clause is right or wrong, so the regression it was written to catch could be
reintroduced today with the suite looking exactly as it does now.

Deferred rather than guessed at because the fix is a real choice, not a typo:
inject a `_cache_path` stub (cheap, but the harness now has to be updated every
time `_fetch_bytes` grows a dependency), or stop AST-extracting and make
`config.py` importable without the 754MB module-body fetch (larger, and fixes
the class of problem rather than this instance). The second is probably right
and is not this branch's work.

Found while verifying `fix-followup-message-handling`; unrelated to it. That
branch touches three files, none under `component_agent/`, and
`test_fetch_retry.py` has zero references to `requirement_agent`.
