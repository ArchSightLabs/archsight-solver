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

export function beamSpanLengthLabel(length: number) {
  return formatBeamDimensionLength(length);
}

export function beamSpanDimensionLabel(index: number, _length: number, widthPx: number) {
  if (widthPx >= 34) return beamSpanMemberId(index);
  return null;
}

export function buildBeamSpanDimensionLegendRows(dimensions: BeamSpanDimension[], _maxWidthPx: number, _fontSize = 12) {
  const groups = dimensions.reduce<Array<{ memberIds: string[]; lengthLabel: string }>>((items, dimension) => {
    const current = items.find((item) => item.lengthLabel === dimension.lengthLabel);
    if (current) {
      current.memberIds.push(beamSpanMemberId(dimension.index));
      return items;
    }
    return [...items, { memberIds: [beamSpanMemberId(dimension.index)], lengthLabel: dimension.lengthLabel }];
  }, []);

  return groups.map((group) => `${group.memberIds.join("=")}=${group.lengthLabel}`);
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
