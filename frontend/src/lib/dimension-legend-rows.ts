import { estimateDiagramTextWidth } from "./diagram-label-layout.ts";

export interface DimensionLegendGroup {
  itemIds: string[];
  valueLabel: string;
}

export const DIMENSION_LEGEND_MAX_IDS_PER_ROW = 4;

function dimensionLegendLabel(itemIds: string[], valueLabel: string) {
  return `${itemIds.join("=")}=${valueLabel}`;
}

export function formatDimensionLegendGroupRows(
  group: DimensionLegendGroup,
  maxWidthPx: number,
  fontSize: number,
  countUnit: string,
  maxIdsPerRow = DIMENSION_LEGEND_MAX_IDS_PER_ROW,
) {
  const safeMaxIdsPerRow = Math.max(1, Math.floor(maxIdsPerRow));
  const rows: string[] = [];
  for (let start = 0; start < group.itemIds.length;) {
    let take = Math.min(safeMaxIdsPerRow, group.itemIds.length - start);
    let ids = group.itemIds.slice(start, start + take);
    let label = dimensionLegendLabel(ids, group.valueLabel);
    while (take > 1 && estimateDiagramTextWidth(label, fontSize) > maxWidthPx) {
      take -= 1;
      ids = group.itemIds.slice(start, start + take);
      label = dimensionLegendLabel(ids, group.valueLabel);
    }
    rows.push(label);
    start += take;
  }
  return rows.length ? rows : [`${group.itemIds[0] ?? ""}等${group.itemIds.length}${countUnit}=${group.valueLabel}`];
}

export function formatDimensionLegendGroup(
  group: DimensionLegendGroup,
  maxWidthPx: number,
  fontSize: number,
  countUnit: string,
) {
  return formatDimensionLegendGroupRows(group, maxWidthPx, fontSize, countUnit)[0] ?? "";
}
