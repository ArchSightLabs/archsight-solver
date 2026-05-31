import io
import os
import sys

from docx import Document
from docx.shared import Inches

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, ROOT_DIR)

from backend.exporters.common.docx_utils import add_png_figure, create_document
from backend.exporters.common.report_figures import Canvas


def test_add_png_figure_keeps_standard_report_image_on_current_page_width():
    doc = create_document()

    add_png_figure(doc, Canvas(width=900, height=520).png(), "图 1 标准结构图")

    assert len(doc.sections) == 1
    assert len(doc.inline_shapes) == 1
    assert doc.inline_shapes[0].width == Inches(6.2)


def test_add_png_figure_uses_landscape_page_for_wide_large_report_image():
    doc = create_document()

    add_png_figure(doc, Canvas(width=2400, height=680).png(), "图 1 大模型结构图")

    output = io.BytesIO()
    doc.save(output)
    reopened = Document(io.BytesIO(output.getvalue()))

    assert len(reopened.inline_shapes) == 1
    assert reopened.inline_shapes[0].width > Inches(8.0)
    assert any(section.page_width > section.page_height for section in reopened.sections)
    assert reopened.sections[-1].page_width < reopened.sections[-1].page_height
