# Requirements profiles

Committed inputs for `run.py --requirements`. These are the *inputs* to the
pipeline, not its output.

They live in the repo for one reason: a profile that only exists on one
developer's disk is lost the moment that machine is replaced. The panic-button
profile behind the `dunkai_real_v2/v3/v4` fixtures in the PCB module was exactly
that — the fixtures record its *output* and describe it in prose ("2 push
buttons, 3 status LEDs"), but the JSON that produced them was never committed and
did not survive a machine move, so those captures can no longer be reproduced or
compared against. Anything used for a capture belongs here.

Naming: `<short-slug>.json`, one profile per file. The schema is whatever the
Requirement Agent emits (`agents/requirement_agent.py`) — a flat JSON object;
`project_name` is what the supervisor names the design after. It is passed to the
model as-is, so no field is strictly required, but matching the agent's own output
shape keeps `--requirements` and the interview path interchangeable.

| File | Purpose |
|---|---|
| `env-sensor-node.json` | Functional/retrieval smoke profile. Deliberately spans several interface types — I2C (two sensors), SPI (display), UART (GPS), plus GPIO buttons/LEDs and a power rail — so a run exercises more than one retrieval path. Not tied to any fixture. |

Run one with:

```
python -m agents.supervisor.run --requirements data/profiles/env-sensor-node.json --output <path>
```
