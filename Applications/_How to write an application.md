---
type: guide
---
# How application notes work

Every note in this folder whose name doesn't start with `_` is an application on
https://apply.thehierophantproject.wiki. The Custodian checks for changes every
5 minutes after you sync.

## Properties (the block at the top)

- `title`: shown on the site and in the staff channel.
- `summary`: one line under the title in the list of applications.
- `open`: `true` to accept applications, `false` to close it. A closed application stays in this folder and keeps its past submissions.
- `reapply_days`: how long someone must wait after being denied before applying again. The default is 14.
- `review_channel`: the Discord channel ID where this application's submissions are posted for staff. It can be in any server the Custodian has joined, so Somantic applications can go to a separate server.
- `reviewer_role`: the role ID allowed to accept or deny this application. It must be a role in the same server as `review_channel`. Anyone with Manage Server in that server can also review.

To copy an ID, turn on Developer Mode (Discord Settings → Advanced), then right-click the channel or role → **Copy ID**. Paste it between the quotes, for example `review_channel: "1234567890123456789"`.

## The body

- Text before the first `##` heading is the introduction.
- Each `## Heading` starts a section. Text right under a heading is that section's description.
- Each question is a line starting with `- `. Put its type in `{curly braces}` at the end:
  - `{short}`: one line.
  - `{long}`: a paragraph box. Add a minimum length with `{long 300}` (characters) or a word range with `{long 150-400 words}`.
  - `{link}`: a web address, such as a portfolio.
  - `{choice: Option A | Option B | Option C}`: pick one.
  - `{check}`: a box that must be ticked, used for confirmations.
  - Add `optional` to make a question optional: `{short, optional}`.
  - With no braces, a question is `{long}`.
- Lines indented under a question (start them with two spaces or a tab) are shown under it as a prompt, for example a passage to respond to.

The applicant's Discord and Roblox accounts are filled in automatically from `/verify`, so don't ask for them.
