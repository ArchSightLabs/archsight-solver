export interface BeamSpanDimension {
  index: number;
  length: number;
  start: number;
  end: number;
  label: string | null;
  lengthLabel: string;
  title: string;
}

function formatFullSpanLength(value: number) {
  return `${Math.abs(value).toFixed(2)} m`;
}

function estimateLegendTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.62;
}

export function beamSpanLengthLabel(length: number) {
  return `l = ${formatFullSpanLength(length)}`;
}

export function beamSpanDimensionLabel(index: number, _length: number, widthPx: number) {
  if (widthPx >= 34) return `(${index + 1})`;
  return null;
}

export function buildBeamSpanDimensionLegendRows(dimensions: BeamSpanDimension[], maxWidthPx: number, fontSize = 12) {
  const rows: string[] = [];
  let current = "";

  for (const dimension of dimensions) {
    const item = `(${dimension.index + 1}) ${dimension.lengthLabel}`;
    const next = current ? `${current}    ${item}` : item;
    if (current && estimateLegendTextWidth(next, fontSize) > maxWidthPx) {
      rows.push(current);
      current = item;
    } else {
      current = next;
    }
  }

  if (current) rows.push(current);
  return rows;
}

export function buildBeamSpanDimensionSegments(spans: number[], totalLength: number, startX: number, endX: number): BeamSpanDimension[] {
  const safeTotal = Math.max(1e-9, totalLength);
  const drawingLength = Math.max(0, endX - startX);
  let cursor = startX;

  return spans.map((length, index) => {
    const width = drawingLength * (Math.max(0, length) / safeTotal);
    const start = cursor;
    const end = index === spans.length - 1 ? endX : start + width;
    cursor = end;
    return {
      index,
      length,
      start,
      end,
      label: beamSpanDimensionLabel(index, length, Math.max(0, end - start)),
      lengthLabel: beamSpanLengthLabel(length),
      title: `第 ${index + 1} 跨，跨长 ${formatFullSpanLength(length)}`,
    };
  });
}
