"""Creates the temporary index pages Quartz needs, from notes in PublicLore.

Run by build.sh before building, which deletes every file this creates
afterwards. Nothing in your vault is changed.

- PublicLore/Home.md               -> PublicLore/index.md  (the front page)
- <folder>/DEFN - <folder>.md      -> <folder>/index.md    (the section page)
- folders listed in FOLDER_TITLES get that name on the site
"""
import json
import os
import sys

content = sys.argv[1]
created_list = sys.argv[2]   # build.sh deletes every path written here

# Folder name in the vault -> name shown on the site
FOLDER_TITLES = {
    "The HIEROPHANT Project - HOME": "About the Project",
}

created = []


def split_frontmatter(text):
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        if end != -1:
            return text[4:end + 1], text[end + 4:].lstrip("\n")
    return "", text


def write_index(path, title, source_text):
    if os.path.exists(path):
        print(f"stage: {path} already exists, leaving it alone", file=sys.stderr)
        return
    fm, body = split_frontmatter(source_text)
    fm_lines = [l for l in fm.splitlines() if not l.startswith("title:")]
    head = "---\ntitle: " + json.dumps(title) + "\n" + "\n".join(fm_lines)
    head = head.rstrip("\n") + "\n---\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(head + body)
    created.append(path)


home = os.path.join(content, "Home.md")
if os.path.exists(home):
    write_index(os.path.join(content, "index.md"), "The HIEROPHANT Project",
                open(home, encoding="utf-8").read())

for name in sorted(os.listdir(content)):
    folder = os.path.join(content, name)
    if not os.path.isdir(folder) or name.startswith(".") or name == "images":
        continue
    defn = os.path.join(folder, f"DEFN - {name}.md")
    text = open(defn, encoding="utf-8").read() if os.path.exists(defn) else ""
    write_index(os.path.join(folder, "index.md"), FOLDER_TITLES.get(name, name), text)

with open(created_list, "w", encoding="utf-8") as f:
    f.write("\n".join(created) + ("\n" if created else ""))
print(f"stage: created {len(created)} temporary index pages")
