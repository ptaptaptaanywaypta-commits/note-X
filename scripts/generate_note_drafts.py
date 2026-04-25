from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROCESSED_PATH = ROOT / ".automation" / "processed.json"
SYSTEM_PROMPT_PATH = ROOT / "scripts" / "prompts" / "article_system_prompt.md"
STYLE_GUIDE_PATH = ROOT / "scripts" / "prompts" / "style_guide.md"
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
MAX_ITEMS_PER_RUN = int(os.getenv("MAX_DRAFTS_PER_RUN", "3"))

REQUIRED_TAG = "#note化候補"
EXCLUDED_TAGS = ("#個人メモ", "#保留", "#要確認")
SKIP_DIRS = {
    ".git",
    ".github",
    ".automation",
    "articles",
    "note_posts",
    "x_posts",
    "checklists",
    "metadata",
    "drafts",
    "generated",
    "archive",
    "templates",
    "scripts",
}


def main() -> int:
    ensure_directories()

    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set. Skipping generation.", file=sys.stderr)
        write_summary([])
        return 0

    processed = load_processed()
    candidates = discover_candidates(processed)
    selected = candidates[:MAX_ITEMS_PER_RUN]
    print(f"Found {len(candidates)} candidate note(s). Processing {len(selected)}.")

    if not selected:
        write_summary([])
        return 0

    from openai import OpenAI

    client = OpenAI()
    system_prompt = read_text(SYSTEM_PROMPT_PATH)
    style_guide = read_text(STYLE_GUIDE_PATH)
    records: list[dict[str, str]] = []

    for index, source_path in enumerate(selected, start=1):
        relative_source = source_path.relative_to(ROOT).as_posix()
        print(f"[{index}/{len(selected)}] Generating draft for {relative_source}")
        output = generate_draft(client, system_prompt, style_guide, relative_source, read_text(source_path))
        paths = write_outputs(source_path, output)
        mark_processed(processed, source_path, paths)
        records.append({"source": relative_source, **paths})

    save_processed(processed)
    write_summary(records)
    print_generated(records)
    return 0


def ensure_directories() -> None:
    for path in (
        ROOT / "articles" / "drafts",
        ROOT / "note_posts" / "drafts",
        ROOT / "x_posts" / "drafts",
        ROOT / "checklists" / "drafts",
        ROOT / "metadata" / "drafts",
        ROOT / ".automation",
    ):
        path.mkdir(parents=True, exist_ok=True)


def load_processed() -> dict[str, Any]:
    if not PROCESSED_PATH.exists():
        return {"processed_files": {}}
    try:
        data = json.loads(read_text(PROCESSED_PATH))
    except json.JSONDecodeError:
        return {"processed_files": {}}
    if not isinstance(data.get("processed_files"), dict):
        data["processed_files"] = {}
    return data


def save_processed(processed: dict[str, Any]) -> None:
    write_text(PROCESSED_PATH, json.dumps(processed, ensure_ascii=False, indent=2) + "\n")


def discover_candidates(processed: dict[str, Any]) -> list[Path]:
    seen = processed.get("processed_files", {})
    candidates: list[Path] = []

    for path in sorted(ROOT.rglob("*.md")):
        if should_skip_path(path):
            continue
        relative = path.relative_to(ROOT).as_posix()
        if relative in seen:
            continue

        text = read_text(path)
        frontmatter, body = parse_frontmatter(text)
        if not is_publish_candidate(frontmatter, body):
            continue
        if any(tag in text for tag in EXCLUDED_TAGS):
            continue
        if contains_obvious_personal_information(text):
            print(f"Skipping possible personal information: {relative}")
            continue
        candidates.append(path)

    return candidates


def should_skip_path(path: Path) -> bool:
    parts = path.relative_to(ROOT).parts
    return any(part in SKIP_DIRS for part in parts[:-1])


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.DOTALL)
    if not match:
        return {}, text

    frontmatter_text, body = match.groups()
    frontmatter: dict[str, str] = {}
    for line in frontmatter_text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        frontmatter[key.strip()] = value.strip().strip("\"'")
    return frontmatter, body


def is_publish_candidate(frontmatter: dict[str, str], body: str) -> bool:
    return frontmatter.get("publish_ok", "").lower() == "true" or REQUIRED_TAG in body


def contains_obvious_personal_information(text: str) -> bool:
    patterns = [
        r"患者\s*(ID|番号|氏名|名)",
        r"カルテ\s*(番号|No\.?)",
        r"\b\d{3}-\d{4}\b",
        r"\b0\d{1,4}-\d{1,4}-\d{3,4}\b",
        r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
        r"(19|20)\d{2}年\d{1,2}月\d{1,2}日.*(入院|退院|発症|手術)",
    ]
    return any(re.search(pattern, text) for pattern in patterns)


def generate_draft(client: Any, system_prompt: str, style_guide: str, source_file: str, source_text: str) -> dict[str, Any]:
    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "title",
            "article_markdown",
            "x_posts",
            "hashtags",
            "medical_checklist",
            "privacy_checklist",
            "copyright_checklist",
            "human_review_notes",
        ],
        "properties": {
            "title": {"type": "string"},
            "article_markdown": {"type": "string"},
            "x_posts": {"type": "array", "items": {"type": "string"}},
            "hashtags": {"type": "array", "items": {"type": "string"}},
            "medical_checklist": {"type": "array", "items": {"type": "string"}},
            "privacy_checklist": {"type": "array", "items": {"type": "string"}},
            "copyright_checklist": {"type": "array", "items": {"type": "string"}},
            "human_review_notes": {"type": "array", "items": {"type": "string"}},
        },
    }
    user_prompt = (
        f"文体ガイド:\n{style_guide}\n\n"
        f"元メモのパス: {source_file}\n\n"
        "以下のObsidianメモから、note記事案、X投稿案3つ、"
        "医療安全・個人情報・著作権・文体の確認項目を生成してください。"
        "Obsidianメモにない具体的な患者情報、数値、文献、経験談は追加しないでください。\n\n"
        f"```markdown\n{source_text}\n```"
    )
    response = client.responses.create(
        model=MODEL,
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "note_draft_generation",
                "schema": schema,
                "strict": True,
            }
        },
    )
    return json.loads(response.output_text)


def write_outputs(source_path: Path, output: dict[str, Any]) -> dict[str, str]:
    generated_at = datetime.now(timezone.utc).isoformat()
    date_prefix = datetime.now().strftime("%Y-%m-%d")
    slug = unique_slug(source_path, date_prefix)
    source_file = source_path.relative_to(ROOT).as_posix()
    frontmatter, _ = parse_frontmatter(read_text(source_path))
    theme = frontmatter.get("theme", "")

    paths = {
        "article": f"articles/drafts/{date_prefix}_{slug}.md",
        "note_post": f"note_posts/drafts/{date_prefix}_{slug}.md",
        "x_posts": f"x_posts/drafts/{date_prefix}_{slug}.md",
        "checklist": f"checklists/drafts/{date_prefix}_{slug}.md",
        "metadata": f"metadata/drafts/{date_prefix}_{slug}.yaml",
    }
    hashtags = normalize_hashtags(output.get("hashtags", []))
    x_posts = ensure_three_items(output.get("x_posts", []))

    write_text(ROOT / paths["article"], render_article(output, source_file, generated_at, hashtags))
    write_text(ROOT / paths["note_post"], render_note_post(output, hashtags))
    write_text(ROOT / paths["x_posts"], render_x_posts(source_file, paths["article"], generated_at, x_posts))
    write_text(ROOT / paths["checklist"], render_checklist(output, source_file, paths["article"], generated_at))
    write_text(ROOT / paths["metadata"], render_metadata(output, source_file, generated_at, hashtags, theme))
    return paths


def unique_slug(source_path: Path, date_prefix: str) -> str:
    base = slugify(source_path.stem)
    if not base:
        digest = hashlib.sha1(source_path.as_posix().encode("utf-8")).hexdigest()[:8]
        base = f"article_{digest}"
    slug = base
    counter = 2
    while (ROOT / "articles" / "drafts" / f"{date_prefix}_{slug}.md").exists():
        slug = f"{base}_{counter:02d}"
        counter += 1
    return slug


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-zA-Z0-9]+", "_", ascii_text).strip("_").lower()[:80]


def render_article(output: dict[str, Any], source_file: str, generated_at: str, hashtags: list[str]) -> str:
    title = str(output.get("title", "Untitled draft")).strip()
    article = str(output.get("article_markdown", "")).strip()
    notes = as_list(output.get("human_review_notes")) or [
        "医療的な断定表現がないか確認してください",
        "実症例に見える部分は匿名化してください",
    ]
    return "\n".join([
        "---",
        f'title: "{escape_yaml(title)}"',
        f'source_file: "{escape_yaml(source_file)}"',
        f'generated_at: "{generated_at}"',
        'status: "draft"',
        "human_review_required: true",
        "---",
        "",
        f"# {title}",
        "",
        article,
        "",
        "---",
        "",
        "## note用ハッシュタグ",
        "",
        "\n".join(hashtags),
        "",
        "---",
        "",
        "## 人間確認メモ",
        "",
        "\n".join(f"- {note}" for note in notes),
        "",
    ])


def render_note_post(output: dict[str, Any], hashtags: list[str]) -> str:
    title = str(output.get("title", "Untitled draft")).strip()
    article = str(output.get("article_markdown", "")).strip()
    return "\n".join([
        f"# {title}",
        "",
        article,
        "",
        "---",
        "",
        "## note用ハッシュタグ",
        "",
        "\n".join(hashtags),
        "",
    ])


def render_x_posts(source_file: str, article_rel: str, generated_at: str, x_posts: list[str]) -> str:
    labels = ["問いかけ型", "要点整理型", "note誘導型"]
    lines = [
        "---",
        f'source_file: "{escape_yaml(source_file)}"',
        f'related_article: "{escape_yaml(article_rel)}"',
        f'generated_at: "{generated_at}"',
        'status: "draft"',
        "---",
        "",
    ]
    for index, (label, post) in enumerate(zip(labels, x_posts), start=1):
        lines.extend([f"## 投稿案{index}：{label}", "", post.strip(), ""])
    return "\n".join(lines)


def render_checklist(output: dict[str, Any], source_file: str, article_rel: str, generated_at: str) -> str:
    style_items = [
        "AIっぽい定型導入になっていないか",
        "上から目線になっていないか",
        "若手PTとしての等身大の言葉になっているか",
        "固すぎず、軽すぎないか",
    ]
    return "\n".join([
        "---",
        f'source_file: "{escape_yaml(source_file)}"',
        f'related_article: "{escape_yaml(article_rel)}"',
        f'generated_at: "{generated_at}"',
        'status: "review_required"',
        "---",
        "",
        "# 医療安全チェック",
        "",
        checklist_items(output.get("medical_checklist")),
        "",
        "# 個人情報チェック",
        "",
        checklist_items(output.get("privacy_checklist")),
        "",
        "# 著作権チェック",
        "",
        checklist_items(output.get("copyright_checklist")),
        "",
        "# 文体チェック",
        "",
        checklist_items(style_items),
        "",
    ])


def render_metadata(output: dict[str, Any], source_file: str, generated_at: str, hashtags: list[str], theme: str) -> str:
    title = escape_yaml(str(output.get("title", "Untitled draft")).strip())
    lines = [
        f'title: "{title}"',
        f'source_file: "{escape_yaml(source_file)}"',
        f'generated_at: "{generated_at}"',
        f'theme: "{escape_yaml(theme.strip())}"',
        'target: "young_pt"',
        'status: "draft"',
        "human_review_required: true",
        "hashtags:",
    ]
    lines.extend(f'  - "{escape_yaml(tag)}"' for tag in hashtags)
    lines.extend(["x_posts_count: 3", ""])
    return "\n".join(lines)


def mark_processed(processed: dict[str, Any], source_path: Path, paths: dict[str, str]) -> None:
    relative_source = source_path.relative_to(ROOT).as_posix()
    processed["processed_files"][relative_source] = {
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "source_sha256": hashlib.sha256(read_text(source_path).encode("utf-8")).hexdigest(),
        "outputs": paths,
    }


def write_summary(records: list[dict[str, str]]) -> None:
    body_path = os.getenv("PR_BODY_PATH")
    if not body_path:
        return
    if not records:
        body = "No draft files were generated in this run.\n"
    else:
        lines = [
            "Generated note draft articles.",
            "",
            "Human review is required before publishing to note or X.",
            "",
            "## Generated files",
            "",
        ]
        for record in records:
            lines.extend([
                f"- Source: `{record['source']}`",
                f"  - Article: `{record['article']}`",
                f"  - Note copy: `{record['note_post']}`",
                f"  - X posts: `{record['x_posts']}`",
                f"  - Checklist: `{record['checklist']}`",
                f"  - Metadata: `{record['metadata']}`",
            ])
        body = "\n".join(lines) + "\n"
    Path(body_path).write_text(body, encoding="utf-8")


def print_generated(records: list[dict[str, str]]) -> None:
    if not records:
        print("No draft files generated.")
        return
    print("Generated files:")
    for record in records:
        print(f"- Article: {record['article']}")
        print(f"- Note copy: {record['note_post']}")
        print(f"- X posts: {record['x_posts']}")
        print(f"- Checklist: {record['checklist']}")
        print(f"- Metadata: {record['metadata']}")


def normalize_hashtags(values: Any) -> list[str]:
    tags = ["#理学療法士", "#新人PT", "#急性期リハ", *as_list(values)]
    normalized: list[str] = []
    for tag in tags:
        clean = tag.strip()
        if not clean:
            continue
        if not clean.startswith("#"):
            clean = f"#{clean}"
        if clean not in normalized:
            normalized.append(clean)
    return normalized


def ensure_three_items(values: Any) -> list[str]:
    items = as_list(values)
    while len(items) < 3:
        items.append("note URLをここに貼る")
    return items[:3]


def checklist_items(values: Any) -> str:
    return "\n".join(f"- [ ] {item}" for item in as_list(values))


def as_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value).strip() for value in values if str(value).strip()]


def escape_yaml(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    raise SystemExit(main())
