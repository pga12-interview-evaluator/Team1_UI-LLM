"""Team 4's speech analysis (fillers, repetitions, pauses, speaking rate, fluency score), loaded
VERBATIM from their notebook so their code is never edited here.

Team 4 delivered a notebook (team4/team4_capstone.ipynb, repo Team4_Audio_data_processing
commit 0a96cd5) whose main cell defines pure functions over a Whisper result:
    detect_fillers(text) -> (counts, total)
    detect_repetitions(text) -> [word, ...]
    detect_pauses(segments) -> [seconds, ...]
    calculate_wpm(text, duration) -> float
    calculate_fluency_score(total_words, filler_count, repetition_count, long_pause_count) -> float
plus their FILLER_WORDS list. The same cell also loads a Whisper model and runs on a hard-coded
file; those statements are skipped. Only function/constant definitions and imports are executed.

`analyze(text, segments, duration)` mirrors their `analyze_speech()` (which reads a file from disk)
over the transcription we already have, so the model runs once per answer, not twice.
"""

from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

NOTEBOOK = Path(__file__).resolve().parent / "team4" / "team4_capstone.ipynb"
KEEP_ASSIGNMENTS = {"FILLER_WORDS"}
LONG_PAUSE_SEC = 2.0  # Team 4: long_pauses = [p for p in pauses if p >= 2]

_ns: dict[str, Any] | None = None


def _load() -> dict[str, Any]:
    """Execute only the definitions from Team 4's notebook into a private namespace."""
    global _ns
    if _ns is not None:
        return _ns
    nb = json.loads(NOTEBOOK.read_text(encoding="utf-8"))
    source = next(
        "".join(cell["source"])
        for cell in nb["cells"]
        if cell["cell_type"] == "code" and "def detect_fillers" in "".join(cell["source"])
    )
    tree = ast.parse(source)
    kept: list[ast.stmt] = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.Import, ast.ImportFrom)):
            if isinstance(node, (ast.Import, ast.ImportFrom)) and any(
                alias.name in {"whisper", "librosa"} for alias in node.names
            ):
                continue  # heavy, only needed by their file-based runner
            kept.append(node)
        elif isinstance(node, ast.Assign) and any(
            isinstance(t, ast.Name) and t.id in KEEP_ASSIGNMENTS for t in node.targets
        ):
            kept.append(node)
    module = ast.Module(body=kept, type_ignores=[])
    ast.fix_missing_locations(module)
    namespace: dict[str, Any] = {}
    exec(compile(module, str(NOTEBOOK), "exec"), namespace)  # noqa: S102 — our own vendored notebook
    for required in ("detect_fillers", "detect_repetitions", "detect_pauses", "calculate_wpm", "calculate_fluency_score"):
        if required not in namespace:
            raise RuntimeError(f"Team 4 notebook is missing {required}()")
    _ns = namespace
    return namespace


def analyze(text: str, segments: list[dict], duration: float) -> dict:
    """Team 4's analyze_speech() over an existing transcription. Same keys as their return dict."""
    t4 = _load()
    import re

    words = re.findall(r"\b[a-zA-Z]+\b", text)
    total_words = len(words)
    filler_counts, filler_count = t4["detect_fillers"](text)
    repetitions = t4["detect_repetitions"](text)
    pauses = t4["detect_pauses"](segments)
    long_pauses = [p for p in pauses if p >= LONG_PAUSE_SEC]
    average_pause = float(sum(pauses) / len(pauses)) if pauses else 0.0
    longest_pause = float(max(pauses)) if pauses else 0.0
    wpm = t4["calculate_wpm"](text, duration)
    fluency = t4["calculate_fluency_score"](total_words, filler_count, len(repetitions), len(long_pauses))
    return {
        "duration": round(float(duration), 2),
        "total_words": total_words,
        "wpm": wpm,
        "filler_count": filler_count,
        "filler_words": filler_counts,
        "repetition_count": len(repetitions),
        "repetitions": repetitions,
        "total_pauses": len(pauses),
        "long_pauses": len(long_pauses),
        "average_pause": round(average_pause, 2),
        "longest_pause": round(longest_pause, 2),
        "fluency_score": fluency,
        "source": "team4/team4_capstone.ipynb@0a96cd5",
    }


if __name__ == "__main__":
    sample = "Um so I, you know, built it. It it worked, basically."
    print(json.dumps(analyze(sample, [{"start": 0, "end": 2.0}, {"start": 4.5, "end": 6.0}], 6.0), indent=2))
