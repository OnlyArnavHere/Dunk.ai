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
