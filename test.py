import sys
from pathlib import Path

ai_engine_dir = Path(__file__).resolve().parent / "ai_engine"
sys.path.insert(0, str(ai_engine_dir / "agents" / "supervisor"))

from server import _handle_chat, SupervisorRequest
from graph import run_workflow

payload = SupervisorRequest(action="run_workflow", messages=[{"role": "user", "content": "build a robot"}])
from server import _build_initial_state, _serialize_state
state = _build_initial_state(payload)
final_state = run_workflow(state)
print(_serialize_state(final_state))
