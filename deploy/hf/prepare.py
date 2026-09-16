"""Assemble the two Hugging Face Space folders (git-ignored) from the repo.

    python deploy/hf/prepare.py            # writes deploy/hf/out/voice and deploy/hf/out/body

Each output folder is a complete, FLAT Space repo (Dockerfile + README front matter + code) so it
can be uploaded through the Space's "Upload files" page; the Dockerfile recreates the subfolders.
Or: `huggingface-cli upload <user>/<space> deploy/hf/out/voice . --repo-type space`. See DEPLOY.md.
"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "deploy" / "hf" / "out"

README = """---
title: {title}
emoji: {emoji}
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

{description}

Set the Space secret `SERVICE_TOKEN` to the same value as the app's `SERVICE_TOKEN`.
"""


def fresh(folder: Path) -> Path:
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    return folder


def voice() -> None:
    out = fresh(OUT / "voice")
    shutil.copy(ROOT / "deploy/hf/Dockerfile.voice", out / "Dockerfile")
    for name in ("voice_to_text.py", "server.py", "team2_settings.py", "team4_speech.py"):
        shutil.copy(ROOT / "voice_to_text" / name, out / name)
    # flat: the Dockerfile moves the notebooks back under team2/ and team4/
    shutil.copy(ROOT / "voice_to_text/team2/voice_to_textproject.ipynb", out)
    shutil.copy(ROOT / "voice_to_text/team4/team4_capstone.ipynb", out)
    (out / "README.md").write_text(
        README.format(
            title="Interviewly Voice",
            emoji="🎤",
            description="Whisper transcription service for the Interviewly interview app (Team 2 settings).",
        ),
        encoding="utf-8",
    )


def body() -> None:
    out = fresh(OUT / "body")
    shutil.copy(ROOT / "deploy/hf/Dockerfile.body", out / "Dockerfile")
    # flat: the Dockerfile moves files back under body_language/ and Team3_Body_language/
    shutil.copy(ROOT / "body_language/server.py", out / "server.py")
    shutil.copy(ROOT / "body_language/requirements.txt", out / "requirements.txt")
    shutil.copy(ROOT / "Team3_Body_language/task31_body_language_percentage_json.py", out)
    (out / "README.md").write_text(
        README.format(
            title="Interviewly Body Language",
            emoji="🧍",
            description="Team 3 body-language analysis (MediaPipe) for the Interviewly interview app. Non-scored coaching signals only.",
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    voice()
    body()
    print(f"Space folders written to {OUT}")
