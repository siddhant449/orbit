# Feature 1 recon: voice, memories, strategy, knowledge base

Captured 2026-10-21 from the user's logged-in Kleo session, read-only. I opened menus and dialogs and then
cancelled them. Nothing was submitted, imported, deleted or posted.

Labels: **observed** = seen on screen or in a GET response; **static** = shipped JavaScript;
**inferred** = my reading, not verified.

Evidence:
- REA analysis of 7 Feature 1 chunks from the 2026-10-21 build (59 chunks in total, saved to `.recon/kleo-bundle-2026-10-21/`).
  Parent evidence: `ev_4856bfab8e65727df7baf1e9cd89c602b644ef321c4dec8058aef9faff582763`. It found 31 endpoint facts and 89 request relations.
- Endpoint view: `ev_91126c18c4b0d9bb8f9471c8813fdd848fc64326af490d4fceb2207c0302f058`.

## The central idea: memory is a set of markdown documents (observed)

`GET /api/user-memory` returns:
```json
{ "migrated": true, "version": 6, "updatedAt": "…",
  "sections": [ { "key": "writing_rules", "content": "<markdown>", "source": "mirrored", "updatedAt": "…", "pinned": false }, … ] }
```

The account had 14 sections. Each one is a markdown document with a path-like key.

| Key | Source | Content |
|---|---|---|
| `writing_rules` | mirrored | `## Do` / `## Don't` / `## Banned words` lists |
| `voice_style` | agent_extracted | `# Voice and style`, then `## Writing style` and `## Content preferences` (sentence rhythm, structure, signature moves) |
| `identity_about` | agent_extracted | first-person statement about the user |
| `identity_story` | mirrored | personal story |
| `identity_personal` | agent_extracted | short facts: role, background, interests, audience |
| `topics/<slug>` | agent_extracted | one document per subject the user knows (`## Experience`, `## Core knowledge`) |
| `strategy/themes` | agent_extracted | `# Content pillars and positioning`, then `## Content pillars` (one `###` per pillar with a point of view) and `## Positioning signals` |
| `strategy/<slug>` | agent_extracted | supporting strategy notes |

- `source` is either `mirrored` (copied from a structured field) or `agent_extracted` (written by Kleo's AI agent from chats and imports) (inferred).
- The AI chat reads these documents to ground what it writes, and writes back to them as it learns (inferred).
- **A defect to avoid:** three of the "Identity" entries are LLM refusal text ("I appreciate you testing my system, but…") that was stored as if it were a fact. Our extraction step must reject output that isn't a real fact.

## Memories screen: `/settings/memories` (observed, static)

- **Header:** the title "Memories" and an **Import memories** button.
- **Cards:** shown in the UI as "Identity" ("Background and details Kleo uses to ground your posts.") and "Writing preferences" ("Your rules for how Kleo writes your posts."). Each card shows its last-updated date.
  - Each bullet line is its own row, with a delete icon that asks for confirmation.
  - The code edits and deletes individual lines inside the markdown document. Bullet nesting is preserved, and the change is saved back through the memory API (static).
- **Writing preferences** in this account, as an example of the format: "Use bullet points for lists", "Be conversational", "Balance depth and brevity", "Don't use em dashes", "Don't use emojis", "Don't write walls of text", "Don't overuse jargon", "Don't sound generic", "Don't ignore format", and so on.
- **Import memories dialog:** "Bring your memories from ChatGPT, Claude, or anywhere else so Kleo can learn about you."
  - A collapsible "How to get your memories" section gives a ready-made prompt to paste into ChatGPT or Claude ("…transfer 'me' into another tool…").
  - A textarea: "Paste anything here. Kleo will turn it into memories, no matter the format."
  - Footer note: "Processing happens in the background. You can close this and continue using Kleo."
  - Submitting calls `POST /api/memories/import` (static). Toasts: "Importing your memories. We'll have them ready in a few moments!" and "Import failed".

## Writing style, in the composer (observed)

- A **Writing style** button in the composer opens a popover.
  - At the top: "Selected writing style", showing the current style with its avatar, name and tagline.
  - Below it: "Change writing style · All creators", which opens a searchable list:
    - **the user's own style**: "{Name}, Your writing style"
    - **Add from URL**: "LinkedIn creator URL", placeholder `https://www.linkedin.com/in/creator`, button "Add from URL"
    - **All creators**: 9 preset creator voices, each with a one-line tagline (Lara Acosta, Jake Ward, Justin Welsh, Codie Sanchez, Jasmin Alić, Greg Isenberg, Dan Koe, Alex Hormozi, George Mack). Avatars come from `/images/writing-examples/avatars/*.jpeg`.
- Opening the list made no API calls, so the presets ship in the client code. Choosing one sets the voice for the current chat or profile (inferred).
- **For us:** we should not use real creators' names or likenesses. We'll ship original archetype voices instead (see the design).

## Content strategy (static; this account's challenge redirects the screen)

- `/strategy` redirects to `/ideas?strategy=1`. While the 30-day challenge is active, that page shows the challenge card.
- **The strategy object** used by the view (static, 31523 and the ideas page):
  - `goal` and `goalWhy`. Goals (with taglines):
    - `get_customers`: "Turn content into business growth"
    - `build_authority`: "Become known for your expertise"
    - `grow_audience`: "Reach more people, grow your following"
  - `positioning`, `positioningWhy`, `tagline`, `expertise`, `expertiseWhy`
  - **`contentMix[]`** of `{type, percent}`. The five types, each with a description and examples:
    - **lead_magnet**: posts that trade value for a signup, comment or DM. Examples: "Comment X get Y", "Comment X get DM", "Post to sign-up link".
    - **personal**: human stories that build connection and trust. Examples: family, milestones, vulnerable moments, transformations, burnout, remote work.
    - **authority**: proof of credibility. Examples: revenue numbers, speaking, domain expertise, results, networking.
    - **sales**: direct conversion. Examples: case studies, announcements, CTAs, webinars.
    - **educational**: teaching. Examples: how-to, listicles, infographics, breakdowns, news, frameworks, playbooks, tutorials.
  - **`audienceBalance.items[]`** of `{level, percent, note}`, across three levels:
    - **broad**: top of funnel, aimed at reach and visibility
    - **narrow**: middle of funnel, aimed at engagement and trust
    - **niche**: bottom of funnel, aimed at conversions and clients
  - **`contentFormats[]`** of `{format, …}`. Formats: text, image, carousel, video, newsletter, poll.
  - **`recurringSeries[]`** of `{name, weekday, description}`
- **UI sections:**
  - "Strategy foundation"
  - "Content mix · How often to post each type": a donut chart in conic-gradient segments, with hover highlighting
  - "Audience balance · Target this breakdown across your content"
  - "Formats & cadence · How the strategy shows up each week"
- **Prompts to sharpen the strategy:** "Connect LinkedIn and fill in your Identity to sharpen this." Variants exist for each missing piece.
- **Refine buttons:** these send the prefilled chat messages "I want to refine my content strategy." and "Generate ideas from my new content strategy." So the strategy is built and refined through the AI chat, not through a form (static).
- `GET /api/challenge/strategy-handoff` returned `{status: null}` (observed). It is used when the challenge finishes.

## Knowledge base: `/knowledge-base` (observed, static)

- **Placement:** under the Ideas section panel.
- **Header:** title, a search box ("Search by title (min. 3 characters)…"), a type filter (All, Text, Documents, URL, Video, Video Upload, Image), a sort control (Newest, Oldest) and **Add knowledge**.
- **List:** `GET /api/knowledge-base?offset=0&order=desc&includeAll=true` returns `{items[], count, limit:50, offset, filters{type,tags}}`.
  - Each item has: `id, title, content, type, status ("completed"), summarized, sourceUrl, documentUrl, folderId, profileId, shareScope ("private"), teamId, createdAt`.
  - It pages 50 at a time with infinite scroll (static).
- **Cards:** a title and a type badge. The "⋮" menu has Edit title, Create post and Delete. Kleo's menu shows Edit title and Create post twice, which is a bug.
- **Add knowledge dialog, tabs:**
  - **Text:** title (up to 100 characters) and content (up to 50,000 characters; placeholder says at least 100 words).
  - **Document:** title and a file upload. Accepts PDF, DOCX, XLSX, TXT and MD, up to 20 MB.
  - **URL:** title and URL (placeholder `https://example.com/blog-post`).
  - **Video:** title, then either a URL (YouTube, TikTok, Instagram Reels or Facebook) or a file upload. Help text: "We'll generate a transcript and add it to your knowledge base."
  - **Image:** title and an image upload. Accepts JPG, PNG, WebP and GIF, up to 10 MB.
- **Other endpoints** (static):
  - `POST /api/upload`, for files
  - `GET /api/knowledge-base/:id/metadata`, for video items only (a text item returns "Video not found")
  - `POST /api/knowledge-base/:id/share`
- Processing is asynchronous: a `status` field is set while text is extracted, and `summarized` while a summary is written (inferred).

## Other screens

- **Onboarding:** `/onboarding` redirects once onboarding is complete. `onboarding{step,substep,config,version:2}` lives in `/api/account/state`. It could not be observed on a finished account; it should be designed fresh.
- **LinkedIn enrichment:** `GET /api/linkedin/onboarding/status` returns `{hasRun, status, enrichmentCompleted, fieldsUpdated[]}`. It fills identity fields from LinkedIn and needs a LinkedIn connection (Feature 3).
- **Checklist flags:** `/api/user-progress` includes `hasWritingStyle, hasIdentity, hasKnowledge`, which drive the getting-started checklist (Feature 8).

## Unknowns

- The memory write endpoints (PUT or PATCH on `/api/user-memory`) and the request body of the import call. The REA endpoint facts list only the paths.
- How memories and strategy are pulled from chats: this happens on Kleo's servers and is not visible.
- What "Add from URL" does on the server. Presumably it scrapes a creator's posts and derives a style.
- The video transcription provider for knowledge-base videos.
