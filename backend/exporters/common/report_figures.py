from __future__ import annotations

import math
import struct
import zlib
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


Color = Tuple[int, int, int]

BLUE: Color = (37, 99, 235)
CYAN: Color = (8, 145, 178)
GREEN: Color = (22, 163, 74)
AMBER: Color = (217, 119, 6)
RED: Color = (220, 38, 38)
PURPLE: Color = (124, 58, 237)
SLATE: Color = (71, 85, 105)
LIGHT: Color = (226, 232, 240)
GRID: Color = (203, 213, 225)
INK: Color = (15, 23, 42)
WHITE: Color = (255, 255, 255)
TEAL: Color = (15, 118, 110)
BEAM_DARK: Color = (47, 95, 143)
SUPPORT_FILL: Color = (214, 222, 232)
LOAD_INK: Color = (51, 65, 85)


@dataclass
class ChartSeries:
    label: str
    values: Sequence[float]
    color: Color


class Canvas:
    def __init__(self, width: int = 900, height: int = 480, background: Color = WHITE):
        self.width = width
        self.height = height
        self.pixels = bytearray(background * (width * height))

    def png(self) -> bytes:
        raw = bytearray()
        stride = self.width * 3
        for y in range(self.height):
            raw.append(0)
            start = y * stride
            raw.extend(self.pixels[start : start + stride])
        return _png_pack(self.width, self.height, bytes(raw))

    def pixel(self, x: int, y: int, color: Color) -> None:
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return
        index = (y * self.width + x) * 3
        self.pixels[index : index + 3] = bytes(color)

    def line(self, x0: float, y0: float, x1: float, y1: float, color: Color = INK, width: int = 2) -> None:
        x0_i, y0_i, x1_i, y1_i = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx = abs(x1_i - x0_i)
        dy = -abs(y1_i - y0_i)
        sx = 1 if x0_i < x1_i else -1
        sy = 1 if y0_i < y1_i else -1
        err = dx + dy
        while True:
            radius = max(0, width // 2)
            for ox in range(-radius, radius + 1):
                for oy in range(-radius, radius + 1):
                    self.pixel(x0_i + ox, y0_i + oy, color)
            if x0_i == x1_i and y0_i == y1_i:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0_i += sx
            if e2 <= dx:
                err += dx
                y0_i += sy

    def rect(self, x0: float, y0: float, x1: float, y1: float, color: Color, fill: bool = False) -> None:
        left, right = sorted((int(round(x0)), int(round(x1))))
        top, bottom = sorted((int(round(y0)), int(round(y1))))
        if fill:
            for y in range(top, bottom + 1):
                for x in range(left, right + 1):
                    self.pixel(x, y, color)
            return
        self.line(left, top, right, top, color, 2)
        self.line(right, top, right, bottom, color, 2)
        self.line(right, bottom, left, bottom, color, 2)
        self.line(left, bottom, left, top, color, 2)

    def circle(self, cx: float, cy: float, radius: int, color: Color, fill: bool = True) -> None:
        cx_i, cy_i = int(round(cx)), int(round(cy))
        r2 = radius * radius
        for y in range(cy_i - radius, cy_i + radius + 1):
            for x in range(cx_i - radius, cx_i + radius + 1):
                dist = (x - cx_i) ** 2 + (y - cy_i) ** 2
                if fill and dist <= r2:
                    self.pixel(x, y, color)
                elif not fill and abs(dist - r2) <= radius:
                    self.pixel(x, y, color)


def _png_pack(width: int, height: int, raw_scanlines: bytes) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw_scanlines, 9)) + chunk(b"IEND", b"")


def _as_float_list(values: Sequence[Any], scale: float = 1.0) -> List[float]:
    output = []
    for value in values:
        try:
            number = float(value) * scale
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            output.append(number)
    return output


def _domain(values: Iterable[float], pad_ratio: float = 0.08) -> Tuple[float, float]:
    nums = [float(v) for v in values if math.isfinite(float(v))]
    if not nums:
        return -1.0, 1.0
    lo, hi = min(nums), max(nums)
    if math.isclose(lo, hi):
        delta = max(abs(lo), 1.0) * 0.2
        return lo - delta, hi + delta
    pad = (hi - lo) * pad_ratio
    return lo - pad, hi + pad


def line_chart_png(
    x_values: Sequence[Any],
    series: Sequence[ChartSeries],
    width: int = 900,
    height: int = 480,
    y_zero: bool = True,
) -> bytes:
    canvas = Canvas(width, height)
    left, right, top, bottom = 70, width - 28, 34, height - 56
    x = _as_float_list(x_values)
    if not x:
        max_len = max((len(item.values) for item in series), default=0)
        x = [float(index) for index in range(max_len)]
    x_lo, x_hi = _domain(x, 0.02)
    all_y = [value for item in series for value in _as_float_list(item.values)]
    y_lo, y_hi = _domain(all_y)
    if y_zero:
        y_lo = min(y_lo, 0.0)
        y_hi = max(y_hi, 0.0)

    def sx(value: float) -> float:
        return left + (value - x_lo) / max(x_hi - x_lo, 1e-9) * (right - left)

    def sy(value: float) -> float:
        return bottom - (value - y_lo) / max(y_hi - y_lo, 1e-9) * (bottom - top)

    _draw_grid(canvas, left, right, top, bottom)
    canvas.line(left, bottom, right, bottom, SLATE, 2)
    canvas.line(left, top, left, bottom, SLATE, 2)
    if y_lo < 0 < y_hi:
        canvas.line(left, sy(0.0), right, sy(0.0), GRID, 2)

    for item in series:
        y_values = _as_float_list(item.values)
        count = min(len(x), len(y_values))
        if count < 2:
            continue
        points = [(sx(x[index]), sy(y_values[index])) for index in range(count)]
        for start, end in zip(points, points[1:]):
            canvas.line(start[0], start[1], end[0], end[1], item.color, 3)
        for px, py in points[:: max(1, len(points) // 8)]:
            canvas.circle(px, py, 4, item.color, True)
    return canvas.png()


def bar_chart_png(values: Sequence[Any], colors: Optional[Sequence[Color]] = None, width: int = 900, height: int = 480) -> bytes:
    canvas = Canvas(width, height)
    left, right, top, bottom = 70, width - 28, 34, height - 56
    y_values = _as_float_list(values)
    y_lo, y_hi = _domain(y_values)
    y_lo = min(y_lo, 0.0)
    y_hi = max(y_hi, 0.0)
    _draw_grid(canvas, left, right, top, bottom)
    canvas.line(left, bottom, right, bottom, SLATE, 2)
    canvas.line(left, top, left, bottom, SLATE, 2)

    def sy(value: float) -> float:
        return bottom - (value - y_lo) / max(y_hi - y_lo, 1e-9) * (bottom - top)

    zero_y = sy(0.0)
    canvas.line(left, zero_y, right, zero_y, SLATE, 2)
    count = len(y_values)
    if count == 0:
        return canvas.png()
    slot = (right - left) / count
    bar_width = max(8, min(42, slot * 0.58))
    palette = colors or [BLUE, CYAN, GREEN, AMBER, PURPLE, RED]
    for index, value in enumerate(y_values):
        cx = left + slot * (index + 0.5)
        color = palette[index % len(palette)]
        canvas.rect(cx - bar_width / 2, zero_y, cx + bar_width / 2, sy(value), color, True)
    return canvas.png()


def beam_preview_png(beam: Dict[str, Any]) -> bytes:
    canvas = Canvas(1000, 300)
    left, right, y0 = 80, 920, 150
    total = float(beam.get("totalLength") or sum(beam.get("spans", []) or [1.0]) or 1.0)

    def sx(x: float) -> float:
        return left + x / max(total, 1e-9) * (right - left)

    canvas.line(left, y0, right, y0, BEAM_DARK, 6)
    for support in beam.get("supports", []):
        x = sx(float(support.get("x", 0.0)))
        if support.get("type") == "fixed":
            canvas.rect(x - 14, y0 - 5, x + 14, y0 + 39, SUPPORT_FILL, True)
        elif support.get("type") == "free":
            canvas.circle(x, y0, 7, SLATE, False)
        else:
            canvas.line(x - 18, y0 + 30, x + 18, y0 + 30, SLATE, 2)
            canvas.line(x - 16, y0 + 26, x + 16, y0 + 26, SLATE, 2)
            canvas.line(x, y0 + 2, x - 16, y0 + 26, SLATE, 2)
            canvas.line(x, y0 + 2, x + 16, y0 + 26, SLATE, 2)
            if support.get("type") == "roller":
                canvas.circle(x - 9, y0 + 36, 3, SLATE, False)
                canvas.circle(x + 9, y0 + 36, 3, SLATE, False)
    for load in beam.get("loads", []):
        if load.get("type") == "point":
            x = sx(float(load.get("x", 0.0)))
            magnitude = float(load.get("intensityKn", load.get("intensityKnPerM", 1.0)) or 1.0)
            arrow_len = 30 + min(44, abs(magnitude) * 1.5)
            if magnitude < 0:
                _arrow(canvas, x, y0 + arrow_len, x, y0, LOAD_INK)
            else:
                _arrow(canvas, x, y0 - arrow_len, x, y0, LOAD_INK)
        else:
            length = float(load.get("length", 0.0))
            x = sx(float(load.get("startX", load.get("x", 0.0))))
            x2 = sx(float(load.get("endX", min(total, float(load.get("x", 0.0)) + max(length, total * 0.15)))))
            intensity = float(load.get("intensityKnPerM", 0.0) or 0.0)
            downward = intensity >= 0
            guide_y = y0 - 70 if downward else y0 + 70
            start_y = guide_y + 5 if downward else guide_y - 5
            end_y = y0 - 8 if downward else y0 + 8
            arrow_count = max(3, min(30, int((x2 - x) / 28)))
            for tick in range(arrow_count):
                xt = x + (x2 - x) * (tick + 0.5) / arrow_count
                _arrow(canvas, xt, start_y, xt, end_y, LOAD_INK)
            canvas.line(x, guide_y, x2, guide_y, LOAD_INK, 2)
    curve = beam.get("curve", [])
    if curve:
        values = _as_float_list([item.get("vMm", item.get("v", 0.0)) for item in curve])
        max_abs = max(1.0, max((abs(value) for value in values), default=1.0))
        last = None
        for item in curve:
            x = sx(float(item.get("x", 0.0)))
            v = float(item.get("vMm", item.get("v", 0.0)))
            y = y0 - (v / max(max_abs, 1e-9)) * 80
            if last is not None:
                canvas.line(last[0], last[1], x, y, TEAL, 3)
            last = (x, y)
    for index in range(0, int(right - left), 18):
        canvas.line(left + index, y0 + 80, min(left + index + 8, right), y0 + 80, SLATE, 1)
    return canvas.png()


def structure_preview_png(
    nodes: Sequence[Dict[str, Any]],
    members: Sequence[Dict[str, Any]],
    deformed_nodes: Optional[Sequence[Dict[str, Any]]] = None,
    loads: Optional[Sequence[Dict[str, Any]]] = None,
    width: int = 900,
    height: int = 520,
) -> bytes:
    canvas = Canvas(width, height)
    all_nodes = list(nodes) + list(deformed_nodes or [])
    xs = [float(node.get("x", 0.0)) for node in all_nodes]
    ys = [float(node.get("y", 0.0)) for node in all_nodes]
    x_lo, x_hi = _domain(xs, 0.12)
    y_lo, y_hi = _domain(ys, 0.12)
    left, right, top, bottom = 58, width - 42, 34, height - 44

    def sx(value: float) -> float:
        return left + (value - x_lo) / max(x_hi - x_lo, 1e-9) * (right - left)

    def sy(value: float) -> float:
        return bottom - (value - y_lo) / max(y_hi - y_lo, 1e-9) * (bottom - top)

    node_by_id = {node.get("id", node.get("nodeId")): node for node in nodes}
    deformed_by_id = {node.get("id", node.get("nodeId")): node for node in deformed_nodes or []}
    for member in members:
        start = node_by_id.get(member.get("start"))
        end = node_by_id.get(member.get("end"))
        if not start or not end:
            continue
        canvas.line(sx(float(start["x"])), sy(float(start["y"])), sx(float(end["x"])), sy(float(end["y"])), GRID, 4)
        d0 = deformed_by_id.get(member.get("start"))
        d1 = deformed_by_id.get(member.get("end"))
        if d0 and d1:
            canvas.line(sx(float(d0["x"])), sy(float(d0["y"])), sx(float(d1["x"])), sy(float(d1["y"])), BLUE, 4)
    for node in nodes:
        x, y = sx(float(node.get("x", 0.0))), sy(float(node.get("y", 0.0)))
        support = node.get("supportType")
        if support and support != "free":
            canvas.rect(x - 10, y + 8, x + 10, y + 22, GREEN, True)
        canvas.circle(x, y, 6, INK, True)
    for node in deformed_nodes or []:
        canvas.circle(sx(float(node.get("x", 0.0))), sy(float(node.get("y", 0.0))), 5, BLUE, True)
    member_by_id = {member.get("id"): member for member in members}
    for load in loads or []:
        if load.get("type") == "nodal":
            node = node_by_id.get(load.get("node"))
            if not node:
                continue
            fx = float(load.get("fxKn", 0.0) or 0.0)
            fy = float(load.get("fyKn", 0.0) or 0.0)
            length = 58
            mag = math.hypot(fx, fy)
            if mag > 1e-9:
                x, y = sx(float(node["x"])), sy(float(node["y"]))
                _arrow(canvas, x - fx / mag * length, y + fy / mag * length, x, y, RED)
        elif load.get("type") == "member_point":
            member = member_by_id.get(load.get("member"))
            if not member:
                continue
            start = node_by_id.get(member.get("start"))
            end = node_by_id.get(member.get("end"))
            if not start or not end:
                continue
            ratio = min(1.0, max(0.0, float(load.get("positionRatio", 0.5) or 0.5)))
            force = float(load.get("forceKn", 0.0) or 0.0)
            if abs(force) <= 1e-9:
                continue
            x0, y0 = sx(float(start["x"])), sy(float(start["y"]))
            x1, y1 = sx(float(end["x"])), sy(float(end["y"]))
            x = x0 + (x1 - x0) * ratio
            y = y0 + (y1 - y0) * ratio
            dx, dy = x1 - x0, y1 - y0
            length = math.hypot(dx, dy) or 1.0
            local_y = (dy / length, -dx / length)
            direction = (0.0, -1.0) if load.get("direction") == "global_y" else local_y
            sign = 1.0 if force >= 0 else -1.0
            _arrow(canvas, x - direction[0] * sign * 58, y - direction[1] * sign * 58, x, y, RED)
        elif load.get("type") == "distributed":
            member = member_by_id.get(load.get("member"))
            if not member:
                continue
            start = node_by_id.get(member.get("start"))
            end = node_by_id.get(member.get("end"))
            if not start or not end:
                continue
            q_start = float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)) or 0.0)
            q_end = float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)) or q_start)
            representative = q_start if abs(q_start) >= abs(q_end) else q_end
            if abs(representative) <= 1e-9:
                continue
            start_ratio = min(1.0, max(0.0, float(load.get("startRatio", 0.0) or 0.0)))
            end_ratio = min(1.0, max(0.0, float(load.get("endRatio", 1.0) or 1.0)))
            if end_ratio < start_ratio:
                start_ratio, end_ratio = end_ratio, start_ratio
                q_start, q_end = q_end, q_start
            x0, y0 = sx(float(start["x"])), sy(float(start["y"]))
            x1, y1 = sx(float(end["x"])), sy(float(end["y"]))
            dx, dy = x1 - x0, y1 - y0
            member_length = math.hypot(dx, dy) or 1.0
            local_y = (dy / member_length, -dx / member_length)
            sign = 1.0 if representative >= 0 else -1.0
            direction = (0.0, -1.0) if load.get("direction") == "global_y" else local_y
            guide_offset = 46
            gx0 = x0 + dx * start_ratio - direction[0] * sign * guide_offset
            gy0 = y0 + dy * start_ratio - direction[1] * sign * guide_offset
            gx1 = x0 + dx * end_ratio - direction[0] * sign * guide_offset
            gy1 = y0 + dy * end_ratio - direction[1] * sign * guide_offset
            canvas.line(gx0, gy0, gx1, gy1, RED, 2)
            arrow_count = 8
            max_q = max(abs(q_start), abs(q_end), 1e-9)
            for tick in range(arrow_count):
                ratio = start_ratio + (end_ratio - start_ratio) * (tick + 0.5) / arrow_count
                local_ratio = (ratio - start_ratio) / max(end_ratio - start_ratio, 1e-9)
                q = q_start + (q_end - q_start) * local_ratio
                if abs(q) <= 1e-9:
                    continue
                q_sign = 1.0 if q >= 0 else -1.0
                arrow_length = 34 + 18 * abs(q) / max_q
                x = x0 + dx * ratio
                y = y0 + dy * ratio
                _arrow(canvas, x - direction[0] * q_sign * arrow_length, y - direction[1] * q_sign * arrow_length, x, y, RED)
    return canvas.png()


def sensitivity_chart_png(results: Optional[Dict[str, Any]]) -> bytes:
    if not results:
        return b""
    variations = [float(value) * 100.0 for value in results.get("variations", [])]
    colors = [BLUE, AMBER, PURPLE, RED, GREEN, CYAN]
    series = []
    for index, item in enumerate(results.get("series", [])):
        series.append(ChartSeries(str(item.get("label", item.get("key", f"S{index + 1}"))), item.get("values", []), colors[index % len(colors)]))
    return line_chart_png(variations, series, y_zero=False)


def _draw_grid(canvas: Canvas, left: int, right: int, top: int, bottom: int) -> None:
    for index in range(1, 5):
        y = top + (bottom - top) * index / 5
        canvas.line(left, y, right, y, GRID, 1)
    for index in range(1, 6):
        x = left + (right - left) * index / 6
        canvas.line(x, top, x, bottom, LIGHT, 1)


def _arrow(canvas: Canvas, x0: float, y0: float, x1: float, y1: float, color: Color) -> None:
    canvas.line(x0, y0, x1, y1, color, 3)
    angle = math.atan2(y1 - y0, x1 - x0)
    for offset in (math.pi * 0.78, -math.pi * 0.78):
        canvas.line(x1, y1, x1 + math.cos(angle + offset) * 13, y1 + math.sin(angle + offset) * 13, color, 3)
