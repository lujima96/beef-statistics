"""PDF to text conversion utilities."""

from __future__ import annotations

import re
import shutil
import subprocess
from io import BytesIO
from typing import List

try:  # Optional PyMuPDF (best quality)
    import fitz  # type: ignore

    HAS_FITZ: bool = True
except Exception:
    HAS_FITZ = False

from pdfminer.high_level import extract_text as pdfminer_extract_text
from pdfminer.layout import LAParams

__all__ = ["pdf_bytes_to_text"]


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00A0", " ")
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return text


def pdf_bytes_to_text(pdf_bytes: bytes) -> str:
    """Return normalized text extracted from *pdf_bytes*."""

    if HAS_FITZ:
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")  # type: ignore[attr-defined]
            parts: List[str] = []
            page_count: int = getattr(doc, "page_count", 0)
            for idx in range(page_count):
                page = doc.load_page(idx)
                blocks: List[List[object]] = page.get_text("blocks")  # type: ignore[assignment]
                blocks.sort(
                    key=lambda b: (
                        round(float(b[1]), 1),
                        round(float(b[0]), 1),
                    )
                )
                if idx > 0:
                    parts.append(f"\n\n=== PAGE {idx + 1} ===\n\n")
                for block in blocks:
                    text_field = block[4]
                    txt = (str(text_field) if text_field is not None else "").strip()
                    if txt:
                        parts.append(txt + "\n")
            return _normalize_text("".join(parts))
        except Exception:
            pass

    if shutil.which("pdftotext"):
        try:
            proc = subprocess.run(
                ["pdftotext", "-layout", "-", "-"],
                input=pdf_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
            )
            txt = proc.stdout.decode("utf-8", errors="ignore")
            txt = txt.replace("\f", "\n\n=== PAGE BREAK ===\n\n")
            return _normalize_text(txt)
        except Exception:
            pass

    try:
        laparams = LAParams(
            all_texts=True,
            boxes_flow=None,
            word_margin=0.1,
            char_margin=2.0,
            line_margin=0.2,
        )
        text = pdfminer_extract_text(BytesIO(pdf_bytes), laparams=laparams) or ""
        return _normalize_text(text)
    except Exception:
        text = pdfminer_extract_text(BytesIO(pdf_bytes)) or ""
        return _normalize_text(text)
