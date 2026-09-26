import os
from dotenv import load_dotenv
load_dotenv("ai_engine/.env")
from langchain_groq import ChatGroq

models_to_test = ["llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it", "llama-3.3-70b-versatile"]
for m in models_to_test:
    try:
        print(f"testing {m}")
        llm = ChatGroq(model=m, temperature=0, api_key=os.getenv("GROQ_API_KEY"))
        print(llm.invoke("hi").content)
        print(f"SUCCESS: {m}")
        break
    except Exception as e:
        print(f"FAILED {m}: {e}")
