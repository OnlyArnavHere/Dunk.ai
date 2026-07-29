import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    # Try finding .env in parent directories
    load_dotenv("../../.env")
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        load_dotenv("../../../.env")
        api_key = os.getenv("GROQ_API_KEY")

headers = {"Authorization": f"Bearer {api_key}"}
response = requests.get("https://api.groq.com/openai/v1/models", headers=headers)
models = response.json().get("data", [])
for m in models:
    print(m.get("id"))
