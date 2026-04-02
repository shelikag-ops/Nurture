import os, json, datetime, urllib.request, urllib.parse

today = datetime.date.today().isoformat()
api_key = os.environ["ANTHROPIC_API_KEY"]

prompt = f"""Today is {today}. Generate a daily news digest for a bright, curious 13-year-old girl named Sarah who lives in Bangalore, India. Select 6 real, substantive stories covering: (1) science/space, (2) world affairs, (3) India news, (4) environment/climate, (5) sport or culture, (6) one surprising/fascinating story. Write at an intelligent level - do NOT water down the content.

Return ONLY valid JSON with no markdown fencing, matching this exact schema:
{{
  "date": "{today}",
  "stories": [
    {{"headline": "...", "summary": "2-3 sentences of what happened and why it matters", "bigWord": "one advanced vocabulary word from the story", "bigWordDef": "simple kid-friendly definition", "thinkQuestion": "a challenging open-ended question, not yes/no", "videoQuery": "YouTube search query for a good explainer video"}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "...", "videoQuery": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "...", "videoQuery": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "...", "videoQuery": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "...", "videoQuery": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "...", "videoQuery": "..."}}
  ],
  "videos": [
    {{"title": "...", "description": "one sentence about what this video covers", "url": "https://www.youtube.com/results?search_query=ENCODED_QUERY", "topic": "category e.g. Space and Science"}},
    {{"title": "...", "description": "...", "url": "https://www.youtube.com/results?search_query=ENCODED_QUERY", "topic": "..."}},
    {{"title": "...", "description": "...", "url": "https://www.youtube.com/results?search_query=ENCODED_QUERY", "topic": "..."}}
  ],
  "infographic": {{
    "caption": "a short descriptive title for the infographic",
    "fact": "3-5 striking statistics separated by middle-dot characters, e.g. stat one · stat two · stat three",
    "question": "one open-ended reflection question about the data"
  }},
  "quiz": [
    {{"q": "...", "options": ["A", "B", "C", "D"], "correct": 0}},
    {{"q": "...", "options": ["A", "B", "C", "D"], "correct": 1}},
    {{"q": "...", "options": ["A", "B", "C", "D"], "correct": 2}},
    {{"q": "...", "options": ["A", "B", "C", "D"], "correct": 3}},
    {{"q": "...", "options": ["A", "B", "C", "D"], "correct": 0}}
  ]
}}

For the videos array, replace ENCODED_QUERY with a real URL-encoded search query string (spaces as +)."""

payload = json.dumps({
    "model": "claude-sonnet-4-6",
    "max_tokens": 4000,
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
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
        text = data["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        content = json.loads(text.strip())
        with open("news-content.json", "w") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)
        story_count = len(content.get("stories", []))
        print(f"News generated for {today}: {story_count} stories")
        print(json.dumps(content, indent=2, ensure_ascii=False)[:800])
except Exception as e:
    print(f"Error: {e}")
    raise
