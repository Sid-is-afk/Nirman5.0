import google.generativeai as genai
import os
from dotenv import load_dotenv
import sys

# 1. Check Python & Library Version
print(f"🐍 Python Version: {sys.version.split()[0]}")
try:
    import google.generativeai
    print(f"📚 Google GenAI Library Version: {google.generativeai.__version__}")
except:
    print("❌ Google GenAI Library NOT found!")

# 2. Check API Key
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ API Key NOT found in .env file")
else:
    print(f"🔑 API Key Found: {api_key[:5]}...{api_key[-4:]}")
    genai.configure(api_key=api_key)

    # 3. List Available Models
    print("\n📡 Connecting to Google to list available models...")
    try:
        found_vision = False
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"   - {m.name}")
                if 'vision' in m.name or 'flash' in m.name or 'pro' in m.name:
                    found_vision = True
        
        if found_vision:
            print("\n✅ SUCCESS: Your API Key works and has access to vision models!")
        else:
            print("\n⚠️ WARNING: Connected, but no standard Vision models found.")
            
    except Exception as e:
        print(f"\n❌ CONNECTION ERROR: {e}")
        print("   (This usually means Key is invalid, Internet is blocked, or Library is too old)")