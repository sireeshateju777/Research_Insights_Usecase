import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

def test_openai_connectivity():
    if not OPENAI_API_KEY or "YOUR_OPENAI_API_KEY" in OPENAI_API_KEY:
        print(f"Error: OPENAI_API_KEY is not set correctly or is placeholder. Value: '{OPENAI_API_KEY}'")
        return

    print(f"Debug: Loaded API Key: {OPENAI_API_KEY[:7]}...{OPENAI_API_KEY[-4:]}")
    client = OpenAI(api_key=OPENAI_API_KEY)

    
    try:
        print("Testing OpenAI Connectivity...")
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "ping"}]
        )
        print("Status: Success")
        print("Response:", response.choices[0].message.content)
    except Exception as e:
        print(f"Status: Failed")
        print("Error:", str(e))

if __name__ == "__main__":
    test_openai_connectivity()

