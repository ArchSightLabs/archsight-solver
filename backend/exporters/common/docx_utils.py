from __future__ import annotations

import io
import base64
from typing import Optional

import pandas as pd

try:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.shared import Inches, Pt, RGBColor

    HAS_DOCX = True
except ImportError:  # pragma: no cover
    HAS_DOCX = False
    Document = None  # type: ignore[assignment]
    WD_ALIGN_PARAGRAPH = None  # type: ignore[assignment]
    qn = None  # type: ignore[assignment]
    Pt = None  # type: ignore[assignment]
    Inches = None  # type: ignore[assignment]
    RGBColor = None  # type: ignore[assignment]


THEME_RGB = RGBColor(31, 78, 121) if HAS_DOCX else None


def create_document(
    font_name: str = "Microsoft YaHei",
    east_asia_font: Optional[str] = None,
    font_size: float = 10.5,
):
    if not HAS_DOCX:
        raise RuntimeError("python-docx is not available")

    east_asia = east_asia_font or font_name
    doc = Document()
    styles = doc.styles
    styles["Normal"].font.name = font_name
    styles["Normal"]._element.rPr.rFonts.set(qn("w:eastAsia"), east_asia)
    styles["Normal"].font.size = Pt(font_size)
    return doc


def add_report_title(doc, title: str, subtitle: Optional[str] = None) -> None:
    title_paragraph = doc.add_paragraph()
    title_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_paragraph.add_run(title)
    title_run.bold = True
    title_run.font.size = Pt(24)
    if THEME_RGB is not None:
        title_run.font.color.rgb = THEME_RGB

    if subtitle:
        subtitle_paragraph = doc.add_paragraph()
        subtitle_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        subtitle_run = subtitle_paragraph.add_run(subtitle)
        subtitle_run.bold = True
        subtitle_run.font.size = Pt(12)

    divider = doc.add_paragraph()
    divider.alignment = WD_ALIGN_PARAGRAPH.CENTER
    divider_run = divider.add_run("────────────────────────")
    divider_run.font.size = Pt(10)
    if THEME_RGB is not None:
        divider_run.font.color.rgb = THEME_RGB


def add_heading(doc, text: str) -> None:
    paragraph = doc.add_paragraph()
    run = paragraph.add_run(text)
    run.bold = True
    run.font.size = Pt(14)
    if THEME_RGB is not None:
        run.font.color.rgb = THEME_RGB


def style_table_header_row(table) -> None:
    if not table.rows:
        return

    for cell in table.rows[0].cells:
        if not cell.paragraphs:
            continue
        for run in cell.paragraphs[0].runs:
            run.bold = True
            if THEME_RGB is not None:
                run.font.color.rgb = THEME_RGB


def add_df_table(doc, frame: pd.DataFrame) -> None:
    table = doc.add_table(rows=1, cols=len(frame.columns))
    table.style = "Table Grid"
    for idx, column in enumerate(frame.columns):
        header_paragraph = table.rows[0].cells[idx].paragraphs[0]
        header_paragraph.add_run(str(column))
    style_table_header_row(table)
    for _, row in frame.iterrows():
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            cells[idx].text = str(value)


def add_png_figure(doc, png_bytes: bytes, caption: str, width_inches: float = 6.2) -> None:
    if not png_bytes:
        return
    paragraph = doc.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    run.add_picture(io.BytesIO(png_bytes), width=Inches(width_inches))

    caption_paragraph = doc.add_paragraph()
    caption_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption_run = caption_paragraph.add_run(caption)
    caption_run.italic = True
    caption_run.font.size = Pt(9)
    if THEME_RGB is not None:
        caption_run.font.color.rgb = THEME_RGB


def png_from_report_images(report_images: Optional[dict], key: str) -> bytes:
    if not report_images:
        return b""
    value = report_images.get(key)
    if not isinstance(value, str) or not value:
        return b""
    payload = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    try:
        return base64.b64decode(payload, validate=True)
    except Exception:
        return b""
