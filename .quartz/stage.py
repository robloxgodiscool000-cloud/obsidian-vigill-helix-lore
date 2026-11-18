"""Creates the temporary index pages Quartz needs, from notes in PublicLore.

Run by build.sh before building, which deletes every file this creates
afterwards. Nothing in your vault is changed.

- PublicLore/Home.md             -> PublicLore/index.md  (the front page)
    Its text becomes the intro. Its properties control the rest:
      featured:      notes shown as large cards at the top
      contributors:  names listed at the bottom
      links:         buttons under the intro, each "Label | https://..."
                     or "[Label](https://...)"
    Below the intro, every folder is shown as a column of page cards.
- <folder>/DEFN - <folder>.md    -> <folder>/index.md    (the section page)
- folders listed in FOLDER_TITLES get that name on the site
"""
import html
import json
import os
import re
import sys

content = sys.argv[1]
created_list = sys.argv[2]   # build.sh deletes every path written here

# Folder name in the vault -> name shown on the site
FOLDER_TITLES = {
    "The HIEROPHANT Project - HOME": "About the Project",
}

# Order of the columns on the front page (and in the explorer, see quartz.ts).
# Folders not listed go after these, A-Z. Each gets a tag colour.
SECTIONS = [
    ("The HIEROPHANT Project - HOME", "grey"),
    ("Campaigns", "pink"),
    ("History", "brown"),
    ("Factions", "orange"),
    ("Populations", "green"),
    ("Major Powers", "blue"),
    ("Important Locations", "purple"),
    ("Monad City FERRAPHEX", "red"),
]

created = []


def split_frontmatter(text):
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            return text[4:end + 1], text[end + 4:].lstrip("\n")
    return "", text


def frontmatter_list(fm, key):
    """Reads a simple YAML list property (key:\\n  - a\\n  - b)."""
    m = re.search(rf"^{re.escape(key)}:\s*\n((?:[ \t]+-.*\n?)+)", fm, re.M)
    if not m:
        return []
    items = [re.sub(r"^[ \t]+-\s*", "", l).strip().strip("\"'") for l in m.group(1).splitlines()]
    return [i for i in items if i]


def frontmatter_value(fm, key):
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", fm, re.M)
    return m.group(1).strip().strip("\"'") if m else None


def write(path, text):
    if os.path.exists(path):
        print(f"stage: {path} already exists, leaving it alone", file=sys.stderr)
        return
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    created.append(path)


def write_index(path, title, source_text, extra_fm=""):
    fm, body = split_frontmatter(source_text)
    fm_lines = [l for l in fm.splitlines() if not l.startswith("title:")]
    head = "---\ntitle: " + json.dumps(title) + "\n" + extra_fm + "\n".join(fm_lines)
    write(path, head.rstrip("\n") + "\n---\n" + body)


def slugify(s):
    # Mirrors Quartz's slugs: spaces -> '-', '&' -> '-and-', lowercase
    s = s.replace(" ", "-").replace("&", "-and-")
    s = re.sub(r"[?#%]", "", s)
    return s.lower()


def clean(title):
    """Drops an ordering prefix like '1 ' from a note name for display."""
    return re.sub(r"^\d+\s+", "", title)


def notes_in(folder):
    """(display title, href from site root) for each published note in a folder."""
    out = []
    # Undated notes first, then notes named "YYYY-MM-DD ..." newest first
    names = sorted(os.listdir(os.path.join(content, folder)))
    dated = sorted([n for n in names if re.match(r"\d{4}-\d{2}-\d{2}", n)], reverse=True)
    names = [n for n in names if n not in dated] + dated
    for f in names:
        if not f.endswith(".md") or f.startswith("DEFN - ") or f == "index.md":
            continue
        text = open(os.path.join(content, folder, f), encoding="utf-8").read()
        fm, _ = split_frontmatter(text)
        title = frontmatter_value(fm, "title") or clean(f[:-3])
        out.append((title, slugify(folder) + "/" + slugify(f[:-3])))
    return out


def find_note(name):
    """(folder, file name without .md) for a note, ignoring any '1 ' style prefix."""
    for folder in sorted(os.listdir(content)):
        p = os.path.join(content, folder)
        if not os.path.isdir(p):
            continue
        for f in sorted(os.listdir(p)):
            if f.endswith(".md") and (f[:-3] == name or clean(f[:-3]) == name):
                return folder, f[:-3]
    return None


# ---------- Section pages ----------
folders = [n for n in sorted(os.listdir(content))
           if os.path.isdir(os.path.join(content, n)) and not n.startswith(".") and n != "images"]
for name in folders:
    defn = os.path.join(content, name, f"DEFN - {name}.md")
    text = open(defn, encoding="utf-8").read() if os.path.exists(defn) else ""
    write_index(os.path.join(content, name, "index.md"), FOLDER_TITLES.get(name, name), text)

# ---------- Front page ----------
home = os.path.join(content, "Home.md")
if os.path.exists(home):
    fm, intro = split_frontmatter(open(home, encoding="utf-8").read())
    site_title = frontmatter_value(fm, "title") or "The HIEROPHANT Project"
    e = html.escape
    parts = ['<div class="hub">',
             '<div class="hub-cover"></div>',
             '<div class="hub-icon" role="img" aria-label="Sierpinski triangle"></div>',
             f'<h1 class="hub-title">{e(site_title)}</h1>',
             '</div>', "", intro.strip(), ""]

    links = []
    for item in frontmatter_list(fm, "links"):
        m = re.match(r"^\[(.+?)\]\((\S+?)\)$", item) or re.match(r"^(.+?)\s*\|\s*(\S+)$", item)
        if m:
            links.append((m.group(1).strip(), m.group(2).strip()))
        else:
            print(f"stage: couldn't read link '{item}' (use 'Label | https://...')", file=sys.stderr)
    if links:
        parts.append('<div class="hub-links">')
        for label, url in links:
            parts.append(f'<a class="hub-link" href="{e(url)}" target="_blank" rel="noopener">'
                         f'<span>{e(label)}</span><span class="hub-link-arrow">↗</span></a>')
        parts.append('</div>')

    featured = []
    for name in frontmatter_list(fm, "featured"):
        found = find_note(name)
        if found:
            folder, fname = found
            text = open(os.path.join(content, folder, fname + ".md"), encoding="utf-8").read()
            ffm, _ = split_frontmatter(text)
            label = frontmatter_value(ffm, "title") or clean(fname)
            if label == "The HIEROPHANT Project":
                label = "World Overview"
            featured.append((label, slugify(folder) + "/" + slugify(fname)))
        else:
            print(f"stage: featured note '{name}' not found", file=sys.stderr)
    if featured:
        parts.append('<h2 class="hub-heading">Start here</h2>')
        parts.append('<div class="hub-featured">')
        for label, href in featured:
            parts.append(f'<a class="hub-card" href="./{e(href)}"><span>{e(label)}</span></a>')
        parts.append('</div>')

    order = [s for s, _ in SECTIONS if s in folders] + [f for f in folders if f not in dict(SECTIONS)]
    colours = dict(SECTIONS)
    parts.append('<h2 class="hub-heading">Archive</h2>')
    parts.append('<div class="hub-board">')
    for folder in order:
        notes = notes_in(folder)
        label = FOLDER_TITLES.get(folder, folder)
        parts.append(f'<div class="hub-column tag-{colours.get(folder, "grey")}">')
        parts.append(f'<a class="hub-tag" href="./{e(slugify(folder))}/">{e(label)}</a>'
                     f'<span class="hub-count">{len(notes)}</span>')
        for title, href in notes:
            shown = "World Overview" if title == "The HIEROPHANT Project" else title
            parts.append(f'<a class="hub-item" href="./{e(href)}">{e(shown)}</a>')
        parts.append('</div>')
    parts.append('</div>')

    people = frontmatter_list(fm, "contributors")
    if people:
        parts.append('<h2 class="hub-heading hub-spaced">Contributors</h2>')
        parts.append('<div class="hub-people">')
        for p in people:
            parts.append(f'<div class="hub-person">{e(p)}</div>')
        parts.append('</div>')
    parts.append('<p class="hub-credit">Cover: Arnold Böcklin, <i>Isle of the Dead</i> (third version, 1883), Alte Nationalgalerie, Berlin. Public domain.</p>')

    fm_keep = "\n".join(l for l in fm.splitlines()
                        if not re.match(r"^(featured|contributors|links|title):", l) and not l.startswith((" ", "\t")))
    write(os.path.join(content, "index.md"),
          "---\ntitle: " + json.dumps(site_title) + "\n" + (fm_keep + "\n" if fm_keep else "")
          + "---\n" + "\n".join(parts) + "\n")

with open(created_list, "w", encoding="utf-8") as f:
    f.write("\n".join(created) + ("\n" if created else ""))
print(f"stage: created {len(created)} temporary index pages")
