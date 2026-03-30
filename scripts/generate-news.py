import os, json, datetime, urllib.request

today = datetime.date.today().isoformat()
api_key = os.environ["ANTHROPIC_API_KEY"]

prompt = f"""Today is {today}. Generate a JSON object for a children's daily news app (age 10).
Use ONLY real, verifiable current events from the past 48 hours. No invented stories.

Return ONLY valid JSON in this exact shape:
{{
  "date": "{today}",
  "stories": [
    {{"title": "...", "summary": "2-3 sentences, simple language", "category": "Science|World|India|Tech|Sport", "emoji": "🔬", "videoQuery": "search term for YouTube"}},
    {{"title": "...", "summary": "...", "category": "...", "emoji": "...", "videoQuery": "..."}},
    {{"title": "...", "summary": "...", "category": "...", "emoji": "...", "videoQuery": "..."}}
  ],
  "infographic": {{"topic": "...", "fact1": "...", "fact2": "...", "fact3": "...", "fact4": "..."}},
  "quiz": [
    {{"q": "...", "options": ["A", "B", "C", "D"], "answer": 0}},
    {{"q": "...", "options": ["A", "B", "C", "D"], "answer": 1}},
    {{"q": "...", "options": ["A", "B", "C", "D"], "answer": 2}}
  ]
}}"""

payload = json.dumps({
    "model": "claude-sonnet-4-6",
    "max_tokens": 1500,
    "messages": [{"role": "user", "content": prompt}]
}).encode()

req = urllib.request.Request(
    "https://api.anthropic.com/v1/messages",
    data=payload,
    headers={
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
        text = data["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        content = json.loads(text.strip())
        with open("news-content.json", "w") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)
        print(f"✅ News generated for {today}")
        print(json.dumps(content, indent=2, ensure_ascii=False)[:500])
except Exception as e:
    print(f"❌ Error: {e}")
    raise
