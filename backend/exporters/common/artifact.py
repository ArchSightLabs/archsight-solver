from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO


@dataclass
class ExportArtifact:
    buffer: BytesIO
    filename: str
    mimetype: str
