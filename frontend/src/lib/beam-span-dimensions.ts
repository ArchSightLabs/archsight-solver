export interface BeamSpanDimension {
  index: number;
  memberId: string;
  startNodeId: string;
  endNodeId: string;
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
  return `${Math.abs(value).toFixed(2).replace(/\.?0+$/u, "")} m`;
}

function beamSpanMemberId(index: number) {
  return `(${index + 1})`;
}

export function beamSpanLengthLabel(length: number) {
  return formatBeamDimensionLength(length);
}

export function beamSpanDimensionLabel(index: number, _length: number, widthPx: number, memberId = beamSpanMemberId(index)) {
  if (widthPx >= 34) return memberId;
  return null;
}

export function buildBeamSpanDimensionLegendRows(dimensions: BeamSpanDimension[], _maxWidthPx: number, _fontSize = 12) {
  const groups = dimensions.reduce<Array<{ memberIds: string[]; lengthLabel: string }>>((items, dimension) => {
    const current = items.find((item) => item.lengthLabel === dimension.lengthLabel);
    if (current) {
      current.memberIds.push(dimension.memberId);
      return items;
    }
    return [...items, { memberIds: [dimension.memberId], lengthLabel: dimension.lengthLabel }];
  }, []);

  return groups.map((group) => `${group.memberIds.join("=")}=${group.lengthLabel}`);
}

export function buildBeamSpanDimensionSegments(
  spans: number[],
  totalLength: number,
  startX: number,
  endX: number,
  labels: { memberIds?: string[]; nodeIds?: string[] } = {},
): BeamSpanDimension[] {
  const safeTotal = Math.max(1e-9, totalLength);
  const drawingLength = Math.max(0, endX - startX);
  let cursor = startX;

  return spans.map((length, index) => {
    const width = drawingLength * (Math.max(0, length) / safeTotal);
    const start = cursor;
    const end = index === spans.length - 1 ? endX : start + width;
    const memberId = labels.memberIds?.[index]?.trim() || beamSpanMemberId(index);
    const startNodeId = labels.nodeIds?.[index]?.trim() || `${index + 1}`;
    const endNodeId = labels.nodeIds?.[index + 1]?.trim() || `${index + 2}`;
    cursor = end;
    return {
      index,
      memberId,
      startNodeId,
      endNodeId,
      length,
      start,
      end,
      label: beamSpanDimensionLabel(index, length, Math.max(0, end - start), memberId),
      lengthLabel: beamSpanLengthLabel(length),
      title: `${memberId}：第 ${index + 1} 跨，${startNodeId}-${endNodeId}，L = ${formatFullSpanLength(length)}`,
    };
  });
}
