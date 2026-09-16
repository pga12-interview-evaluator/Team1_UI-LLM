"""Modal deployment of the two Python services (free tier: $30/month credits, no card).

    cd deploy && .venv/Scripts/python -m modal setup            # once: browser login
    .venv/Scripts/python -m modal secret create interviewly SERVICE_TOKEN=<random>
    .venv/Scripts/python -m modal deploy modal/interviewly_services.py

Prints two URLs:
    voice → WHISPER_URL        (Whisper + Team 2 settings + Team 4 analysis, voice_to_text/server.py)
    body  → BODY_LANGUAGE_URL  (Team 3 wrapped by body_language/server.py)

Both FastAPI apps are mounted unchanged as ASGI apps; models are baked into the images so a cold
start is seconds, not minutes. Containers scale to zero when idle.
"""

from __future__ import annotations

from pathlib import Path

import modal

# Local checkout root when run from the CLI; inside the container this module is re-imported from
# /root and the image definitions below are only evaluated locally, so any path works there.
_here = Path(__file__).resolve()
ROOT = _here.parents[2] if len(_here.parents) > 2 else _here.parent

app = modal.App("interviewly-services")
secrets = [modal.Secret.from_name("interviewly")]  # SERVICE_TOKEN

# ------------------------------------------------------------------ voice (Team 2 + Team 4)

voice_image = (
    modal.Image.debian_slim(python_version="3.11")
    .env({"XDG_CACHE_HOME": "/root/.cache", "WHISPER_MODEL": "base", "WHISPER_CORS": "*"})
    .pip_install("torch==2.5.1", index_url="https://download.pytorch.org/whl/cpu")
    .pip_install(
        "openai-whisper>=20250625",
        "numpy<2",
        "scipy>=1.11",
        "fastapi>=0.115",
        "python-multipart>=0.0.9",
    )
    .run_commands("python -c \"import whisper; whisper.load_model('base')\"")
    .add_local_dir(
        ROOT / "voice_to_text",
        remote_path="/root/voice_to_text",
        ignore=["*.wav", "*.log", "__pycache__", "*.pyc", "original_notebook.ipynb"],
    )
)


@app.function(image=voice_image, secrets=secrets, memory=2048, cpu=2.0, timeout=600, scaledown_window=300)
@modal.asgi_app()
def voice():
    import sys

    sys.path.insert(0, "/root/voice_to_text")
    from server import app as fastapi_app  # noqa: PLC0415

    return fastapi_app


# ------------------------------------------------------------------ body (Team 3)

body_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libegl1", "libgles2", "libopengl0")
    .env({"BODY_LANGUAGE_REPORTS": "/tmp/reports"})
    .pip_install(
        "mediapipe>=1.0",
        "opencv-python-headless>=4.10",
        "numpy>=2.0",
        "pandas>=2.2",
        "scikit-learn>=1.5",
        "joblib>=1.4",
        "fastapi>=0.115",
        "python-multipart>=0.0.9",
    )
    .add_local_dir(
        ROOT / "Team3_Body_language",
        remote_path="/root/app/Team3_Body_language",
        ignore=["task3_reports", "task3_data", "__pycache__", "*.pyc"],
        copy=True,
    )
    # Team 3's script downloads its two landmarker models on first import; do it at build time.
    .run_commands(
        "cd /root/app/Team3_Body_language && python -c \"import task31_body_language_percentage_json as t3; "
        "t3.ensure_model(t3.FACE_MODEL, t3.FACE_MODEL_URL, 'face'); t3.ensure_model(t3.POSE_MODEL, t3.POSE_MODEL_URL, 'pose')\""
    )
    .add_local_dir(
        ROOT / "body_language",
        remote_path="/root/app/body_language",
        ignore=[".venv", "reports", "*.log", "__pycache__", "*.pyc"],
    )
)


@app.function(image=body_image, secrets=secrets, memory=1536, cpu=2.0, timeout=600, scaledown_window=300)
@modal.asgi_app()
def body():
    import sys

    sys.path.insert(0, "/root/app/body_language")
    from server import app as fastapi_app  # noqa: PLC0415

    return fastapi_app
