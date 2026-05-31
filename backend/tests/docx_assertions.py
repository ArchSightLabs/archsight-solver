import base64
import io
import re
import zipfile


def _png_bytes_from_data_uri(value: str) -> bytes:
    payload = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    return base64.b64decode(payload, validate=True)


def _media_sort_key(name: str) -> tuple[int, str]:
    match = re.search(r"image(\d+)\.", name)
    return (int(match.group(1)) if match else 0, name)


def docx_media_pngs(docx_bytes: bytes) -> list[bytes]:
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as archive:
        media_names = sorted(
            (
                name
                for name in archive.namelist()
                if name.startswith("word/media/") and name.lower().endswith(".png")
            ),
            key=_media_sort_key,
        )
        return [archive.read(name) for name in media_names]


def assert_docx_embeds_report_images(
    docx_bytes: bytes,
    report_images: dict[str, str],
    expected_keys: list[str],
) -> None:
    expected_images = [_png_bytes_from_data_uri(report_images[key]) for key in expected_keys]
    assert docx_media_pngs(docx_bytes) == expected_images
