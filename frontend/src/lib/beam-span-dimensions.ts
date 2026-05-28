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

export function formatBeamDimensionLength(value: number) {
  return `${Math.abs(value).toFixed(2).replace(/\.?0+$/u, "")}m`;
}

function beamSpanMemberId(index: number) {
  return `B${index + 1}`;
}

function beamSpanNodeRange(index: number) {
  return `N${index + 1}-N${index + 2}`;
}

function estimateLegendTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.62;
}

export function beamSpanLengthLabel(length: number) {
  return formatBeamDimensionLength(length);
}

export function beamSpanDimensionLabel(index: number, _length: number, widthPx: number) {
  if (widthPx >= 34) return beamSpanMemberId(index);
  return null;
}

export function buildBeamSpanDimensionLegendRows(dimensions: BeamSpanDimension[], maxWidthPx: number, fontSize = 12) {
  const rows: string[] = [];
  let current = "";
  const groups = dimensions.reduce<Array<{ startIndex: number; endIndex: number; lengthLabel: string }>>((items, dimension) => {
    const previous = items[items.length - 1];
    if (previous && previous.lengthLabel === dimension.lengthLabel && previous.endIndex + 1 === dimension.index) {
      previous.endIndex = dimension.index;
      return items;
    }
    return [...items, { startIndex: dimension.index, endIndex: dimension.index, lengthLabel: dimension.lengthLabel }];
  }, []);

  for (const group of groups) {
    const memberLabel = group.startIndex === group.endIndex
      ? beamSpanMemberId(group.startIndex)
      : `${beamSpanMemberId(group.startIndex)}-${beamSpanMemberId(group.endIndex)}`;
    const item = `${memberLabel}=${group.lengthLabel}`;
    const next = current ? `${current}，${item}` : item;
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
      title: `${beamSpanMemberId(index)}：第 ${index + 1} 跨，${beamSpanNodeRange(index)}，L = ${formatFullSpanLength(length)}`,
    };
  });
}
