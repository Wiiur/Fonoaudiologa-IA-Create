"""Export helpers — turn Markdown/HTML content into a DOCX (Word) document.

Kept intentionally minimal: parse a subset of Markdown (headings, bold, italic, lists, tables) — enough for
our AI-generated reports and clinical notes.
"""

from __future__ import annotations

import io
import re
from typing import Optional

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH


def _add_inline(paragraph, text: str):
    """Parse **bold** and *italic* in a single line of text."""
    pattern = re.compile(r"(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)")
    idx = 0
    for m in pattern.finditer(text):
        if m.start() > idx:
            paragraph.add_run(text[idx:m.start()])
        token = m.group(1)
        if token.startswith("**"):
            r = paragraph.add_run(token[2:-2]); r.bold = True
        elif token.startswith("`"):
            r = paragraph.add_run(token[1:-1]); r.font.name = "Consolas"
        elif token.startswith("*"):
            r = paragraph.add_run(token[1:-1]); r.italic = True
        idx = m.end()
    if idx < len(text):
        paragraph.add_run(text[idx:])


def markdown_to_docx(md: str, title: Optional[str] = None, subtitle: Optional[str] = None) -> bytes:
    """Convert simplified Markdown to a DOCX buffer."""
    doc = Document()

    # Base style
    styles = doc.styles["Normal"]
    styles.font.name = "Calibri"
    styles.font.size = Pt(11)

    # Header block
    if title:
        h = doc.add_paragraph()
        h.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = h.add_run(title)
        run.bold = True
        run.font.size = Pt(20)
        run.font.color.rgb = RGBColor(0xB7, 0x5C, 0x46)
    if subtitle:
        sp = doc.add_paragraph()
        sr = sp.add_run(subtitle)
        sr.italic = True
        sr.font.size = Pt(10)
        sr.font.color.rgb = RGBColor(0x66, 0x66, 0x66)
        doc.add_paragraph("")

    # Parse block by block
    lines = md.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.rstrip()

        # Headings
        if stripped.startswith("### "):
            p = doc.add_heading(level=3); p.add_run(stripped[4:]).font.color.rgb = RGBColor(0x2A, 0x2A, 0x2A)
        elif stripped.startswith("## "):
            p = doc.add_heading(level=2); p.add_run(stripped[3:]).font.color.rgb = RGBColor(0xB7, 0x5C, 0x46)
        elif stripped.startswith("# "):
            p = doc.add_heading(level=1); p.add_run(stripped[2:]).font.color.rgb = RGBColor(0xB7, 0x5C, 0x46)

        # Horizontal rule
        elif stripped in ("---", "***", "___"):
            hr = doc.add_paragraph()
            hr.add_run("─" * 60).font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

        # Bullets
        elif re.match(r"^\s*[-*]\s+", stripped):
            content = re.sub(r"^\s*[-*]\s+", "", stripped)
            p = doc.add_paragraph(style="List Bullet")
            _add_inline(p, content)

        # Numbered list
        elif re.match(r"^\s*\d+\.\s+", stripped):
            content = re.sub(r"^\s*\d+\.\s+", "", stripped)
            p = doc.add_paragraph(style="List Number")
            _add_inline(p, content)

        # Table (pipe-delimited)
        elif "|" in stripped and stripped.count("|") >= 2 and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-+", lines[i + 1]):
            # Collect table lines
            header_cells = [c.strip() for c in stripped.strip("|").split("|")]
            i += 2  # skip header and separator
            rows = []
            while i < len(lines) and "|" in lines[i]:
                rows.append([c.strip() for c in lines[i].strip("|").split("|")])
                i += 1
            table = doc.add_table(rows=1 + len(rows), cols=len(header_cells))
            table.style = "Light Grid Accent 1"
            hdr = table.rows[0].cells
            for j, h_text in enumerate(header_cells):
                if j < len(hdr):
                    hdr[j].text = ""
                    p = hdr[j].paragraphs[0]
                    r = p.add_run(h_text); r.bold = True
            for r_idx, row in enumerate(rows):
                cells = table.rows[r_idx + 1].cells
                for j, val in enumerate(row):
                    if j < len(cells):
                        cells[j].text = ""
                        _add_inline(cells[j].paragraphs[0], val)
            continue  # already advanced i

        # Blank line
        elif stripped == "":
            doc.add_paragraph("")

        # Regular paragraph
        else:
            p = doc.add_paragraph()
            _add_inline(p, stripped)

        i += 1

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()
