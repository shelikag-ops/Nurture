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
    {{"title": "exact video title as it appears on YouTube", "description": "one sentence explaining what this video covers and why it is relevant to today's news", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "topic": "subject category e.g. Space, Climate, India"}},
    {{"title": "...", "description": "...", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "topic": "..."}},
    {{"title": "...", "description": "...", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "topic": "..."}},
    {{"title": "...", "description": "...", "url": "https://www.youtube.com/watch?v=VIDEO_ID", "topic": "..."}}
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
- Provide EXACTLY 4 videos, each a SPECIFIC YouTube video with a real video ID (not a search results page).
- Use the format https://www.youtube.com/watch?v=VIDEO_ID replacing VIDEO_ID with an actual 11-character YouTube ID you are confident exists.
- Choose videos from trusted educational channels appropriate for a 13-year-old: TED-Ed, National Geographic, Kurzgesagt, SciShow Kids, Crash Course, PBS Terra, Veritasium, or similar. Choose channels known to you.
- Each video should be directly relevant to one of today's 6 stories.
- Do NOT use YouTube search URLs (youtube.com/results). Only use direct watch URLs."""

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

def extract_yt_id(url):
    """Extract YouTube video ID from a watch URL."""
    m = re.search(r'[?&]v=([a-zA-Z0-9_-]{11})', url or '')
    return m.group(1) if m else None

try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
        text = data["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        content = json.loads(text.strip())

        # Enrich each video entry with its extracted YouTube ID
        for v in content.get("videos", []):
            vid = extract_yt_id(v.get("url", ""))
            if vid:
                v["youtubeId"] = vid
            # Reject any search-result URLs that slipped through
            if "results?search_query" in v.get("url", ""):
                v["url"] = ""
                v["youtubeId"] = ""

        with open("news-content.json", "w") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)
        story_count = len(content.get("stories", []))
        video_count = len(content.get("videos", []))
        print(f"News generated for {today}: {story_count} stories, {video_count} videos")
        print(json.dumps(content, indent=2, ensure_ascii=False)[:800])
except Exception as e:
    print(f"Error: {e}")
    raise
