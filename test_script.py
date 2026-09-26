import os
from dotenv import load_dotenv
load_dotenv("ai_engine/.env")
import sys
sys.path.insert(0, os.path.abspath("ai_engine"))
sys.path.insert(0, os.path.abspath("ai_engine/agents"))
import traceback

try:
    from supervisor.server import CodeChatRequest, code_chat_endpoint

    req = CodeChatRequest(
        files=[{"filename": "main.c", "code": "int main() {}"}],
        messages=[{"role": "user", "content": "say hi"}]
    )

    print("calling endpoint")
    result = code_chat_endpoint(req)
    print("result:", result)
except Exception as e:
    traceback.print_exc()
