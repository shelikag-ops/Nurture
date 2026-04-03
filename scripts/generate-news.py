import os, json, re, datetime, urllib.request, urllib.parse

today = datetime.date.today().isoformat()
api_key = os.environ["ANTHROPIC_API_KEY"]

prompt = f"""Today is {today}. Generate a daily news digest for a bright, curious 13-year-old girl named Sarah who lives in Bangalore, India. Select 6 real, substantive stories covering: (1) science/space, (2) world affairs, (3) India news, (4) environment/climate, (5) sport or culture, (6) one surprising/fascinating story. Write at an intelligent level - do NOT water down the content.

Return ONLY valid JSON with no markdown fencing, matching this exact schema:
{{
  "date": "{today}",
  "stories": [
    {{"headline": "...", "summary": "2-3 sentences of what happened and why it matters", "bigWord": "one advanced vocabulary word from the story", "bigWordDef": "simple kid-friendly definition", "thinkQuestion": "a challenging open-ended question, not yes/no"}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "..."}},
    {{"headline": "...", "summary": "...", "bigWord": "...", "bigWordDef": "...", "thinkQuestion": "..."}}
  ],
  "videos": [
    {{"title": "short descriptive title for the video topic", "description": "one sentence on what this video covers and why it relates to today's news", "searchQuery": "concise YouTube search terms to find a good educational video on this topic", "topic": "subject category e.g. Space, Climate, India"}},
    {{"title": "...", "description": "...", "searchQuery": "...", "topic": "..."}},
    {{"title": "...", "description": "...", "searchQuery": "...", "topic": "..."}},
    {{"title": "...", "description": "...", "searchQuery": "...", "topic": "..."}}
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

CRITICAL rules for the videos array:
- Provide EXACTLY 4 videos with a searchQuery field (concise YouTube search keywords — NOT a URL).
- Do NOT provide YouTube video IDs or watch URLs — LLMs cannot reliably produce valid video IDs.
- Choose search terms that will surface results from trusted educational channels: TED-Ed, National Geographic, Kurzgesagt, SciShow, Crash Course, PBS Terra, Veritasium, BBC Earth, or similar.
- Each video should be directly relevant to one of today's 6 stories."""

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

        # Build YouTube search URLs from the searchQuery field
        for v in content.get("videos", []):
            query = v.pop("searchQuery", "") or v.get("title", "")
            v["url"] = "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(query)
            # Remove any fabricated watch URLs or IDs the model may have included
            v.pop("youtubeId", None)

        with open("news-content.json", "w") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)
        story_count = len(content.get("stories", []))
        video_count = len(content.get("videos", []))
        print(f"News generated for {today}: {story_count} stories, {video_count} videos")
        print(json.dumps(content, indent=2, ensure_ascii=False)[:800])
except Exception as e:
    print(f"Error: {e}")
    raise
