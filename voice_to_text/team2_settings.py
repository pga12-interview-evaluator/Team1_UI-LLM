"""Team 2's Whisper decoding settings, read VERBATIM from their notebook (team2/voice_to_textproject.ipynb).

Their notebook is a script, not a library: it records the mic, then calls
    model.transcribe(OUTPUT_FILE, fp16=False, beam_size=5, condition_on_previous_text=True,
                     initial_prompt="This is a Hindi and English mixed ...", no_speech_threshold=0.6)
This module parses that call with `ast` and returns its keyword arguments, so the service uses
exactly the parameters Team 2 committed — if they change beam size or the prompt, the app follows
without anyone editing our code. Two keys are handled by the service itself:
  - `language` is passed per request (app setting), Team 2 leave it to auto-detect;
  - `condition_on_previous_text` is forced False in voice_to_text.transcribe() because on long
    interview answers it produces repeat-loop hallucinations (documented in team2/README.md).
Also exposes their MODEL choice (`whisper.load_model("small")`) and recording constants.
"""

from __future__ import annotations

import ast
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

NOTEBOOK = Path(__file__).resolve().parent / "team2" / "voice_to_textproject.ipynb"
RECORDING_CONSTANTS = ("SILENCE_LIMIT", "SILENCE_THRESHOLD", "START_TIMEOUT", "RATE", "CHUNK")


def _main_cell_source() -> str:
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    for cell in nb["cells"]:
        source = "".join(cell["source"])
        if cell["cell_type"] == "code" and "model.transcribe(" in source and "initial_prompt" in source:
            return source
    raise RuntimeError("Team 2 notebook: no cell with model.transcribe(..., initial_prompt=...)")


def _literal(node: ast.expr) -> Any:
    try:
        return ast.literal_eval(node)
    except (ValueError, SyntaxError):
        return None


@lru_cache(maxsize=1)
def settings() -> dict[str, Any]:
    """{"transcribe": {kwargs}, "model": "small", "recording": {...}} from the notebook."""
    tree = ast.parse(_main_cell_source())
    transcribe: dict[str, Any] = {}
    model: str | None = None
    recording: dict[str, Any] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr == "transcribe":
                for kw in node.keywords:
                    if kw.arg:
                        transcribe[kw.arg] = _literal(kw.value)
            elif node.func.attr == "load_model" and node.args:
                model = _literal(node.args[0])
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in RECORDING_CONSTANTS:
                    recording[target.id] = _literal(node.value)
    if not transcribe:
        raise RuntimeError("Team 2 notebook: model.transcribe() keywords not found")
    return {"transcribe": transcribe, "model": model, "recording": recording}


def transcribe_kwargs() -> dict[str, Any]:
    """Team 2's decoding keywords, minus the ones the service decides per call."""
    kwargs = dict(settings()["transcribe"])
    kwargs.pop("language", None)
    kwargs.pop("condition_on_previous_text", None)
    return kwargs


if __name__ == "__main__":
    print(json.dumps(settings(), indent=2))
