"""Announce a GitHub release in Discord, as a proper post instead of GitHub's one-line notice.

The same file lives in every public repo of ByMaksymDev Labs; only the environment changes:

    DISCORD_WEBHOOK_URL   the channel's webhook, WITHOUT the /github suffix (repo secret)
    DISCORD_ROLE_ID       optional: the role to ping, e.g. "📢 Releases" (repo variable)
    APP                   the name shown in the title ("Waypack")
    COLOR                 embed colour as a decimal integer
    ICON                  URL of a square icon for the thumbnail
    FOOTER                one short line under the post ("Android · GitHub Releases")
    TAG                   optional: which release to announce when the run was not started by one

Where the release comes from, in order: the event that started the run (a published release), the
TAG given, or the latest release. That way it works from `on: release`, from a step that runs after
publishing elsewhere, and by hand.

Only the first part of the body is posted: everything up to a "---" line or a "Check this
download" heading, so a bilingual body posts its English half and the hashes stay on GitHub.
"""

import json
import os
import re
import sys
import urllib.request

LIMIT = 1500


def github(path):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}{path}",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "release-announcer"},
    )
    # With a token the rate limit is generous; without one an empty header would be refused.
    if os.environ.get("GITHUB_TOKEN"):
        req.add_header("Authorization", f"Bearer {os.environ['GITHUB_TOKEN']}")
    with urllib.request.urlopen(req) as res:
        return json.load(res)


def the_release():
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if event_path and os.path.exists(event_path):
        with open(event_path, encoding="utf-8") as f:
            release = json.load(f).get("release")
        if release:
            return release
    tag = os.environ.get("TAG", "").strip()
    return github(f"/releases/tags/{tag}" if tag else "/releases/latest")


# Changelog sections and scopes that are about the repo, not about what someone using it gets.
NOISE_SECTIONS = {"Miscellaneous Chores", "Continuous Integration", "Build System", "Chores"}
NOISE_SCOPES = re.compile(r"^\s*[-*] \*\*(ci|build|chore|deps):\*\*")
HEADING = re.compile(r"^\*\*[^*]+\*\*$")
BLOCK_START = re.compile(r"^\s*([-*]|\d+\.)\s")


def unwrap(lines):
    """Join hard-wrapped lines back into one line per paragraph or list item.

    In Discord a line break is a line break, so a body wrapped at 100 columns would arrive with
    every sentence cut in half.
    """
    out = []
    for line in lines:
        new_block = not line.strip() or BLOCK_START.match(line) or HEADING.match(line)
        if out and out[-1].strip() and not new_block and not HEADING.match(out[-1]):
            out[-1] = out[-1].rstrip() + " " + line.strip()
        else:
            out.append(line)
    return out


def summary(body, app, version):
    lines = []
    skipping = False
    for line in (body or "").replace("\r\n", "\n").split("\n"):
        if re.match(r"^(---\s*$|#{1,3} Check this download)", line):
            break
        # release-please opens with "## [1.0.0](compare-link) (date)": the title already says it.
        if re.match(r"^#{1,3} \[?v?\d", line):
            continue
        heading = re.match(r"^#{1,3} (.+)$", line)
        if heading:
            skipping = heading.group(1).strip() in NOISE_SECTIONS
            line = f"**{heading.group(1).strip()}**"
        if skipping or NOISE_SCOPES.match(line):
            continue
        # Commit links at the end of changelog lines are noise in a chat.
        line = re.sub(r" \(\[[0-9a-f]{7,}\]\([^)]*\)\)", "", line)
        lines.append(line)
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(unwrap(lines))).strip()

    # "**Waypack 1.1** — a new look…": the title already says the first half; keep the tagline.
    tagline = re.match(r"^\*\*" + re.escape(f"{app} {version}") + r"\*\*\s*[—-]\s*(.+)", text)
    if tagline:
        rest = tagline.group(1)
        text = rest[0].upper() + rest[1:] + text[tagline.end():]

    if len(text) > LIMIT:
        text = text[:LIMIT].rsplit("\n", 1)[0] + "\n…"
    return text


def payload(release):
    app = os.environ["APP"]
    version = release["tag_name"].lstrip("v")
    role = os.environ.get("DISCORD_ROLE_ID", "").strip()
    return {
        # The ping, and only when there is a role: the title already says which version it is.
        **({"content": f"<@&{role}>"} if role else {}),
        "allowed_mentions": {"roles": [role] if role else []},
        "embeds": [
            {
                "title": f"{app} {version}",
                "url": release["html_url"],
                "description": summary(release.get("body"), app, version),
                "color": int(os.environ["COLOR"]),
                "thumbnail": {"url": os.environ["ICON"]},
                "footer": {"text": os.environ["FOOTER"]},
                "timestamp": release.get("published_at"),
            }
        ],
    }


def main():
    message = payload(the_release())
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook or "--dry-run" in sys.argv:
        print(json.dumps(message, ensure_ascii=False, indent=2))
        if not webhook:
            print("No DISCORD_WEBHOOK_URL: nothing sent.", file=sys.stderr)
        return
    req = urllib.request.Request(
        webhook.removesuffix("/github"),
        data=json.dumps(message).encode("utf-8"),
        # Discord turns away the default Python user agent.
        headers={"Content-Type": "application/json", "User-Agent": "release-announcer"},
    )
    urllib.request.urlopen(req)
    print(f"Announced {message['embeds'][0]['title']}.")


if __name__ == "__main__":
    main()
