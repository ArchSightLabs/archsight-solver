import { estimateDiagramTextWidth } from "./diagram-label-layout.ts";

export interface DimensionLegendGroup {
  itemIds: string[];
  valueLabel: string;
}

export function formatDimensionLegendGroup(
  group: DimensionLegendGroup,
  maxWidthPx: number,
  fontSize: number,
  countUnit: string,
) {
  const fullLabel = `${group.itemIds.join("=")}=${group.valueLabel}`;
  if (group.itemIds.length <= 1) {
    return fullLabel;
  }
  const summaryLabel = `${group.itemIds[0]}等${group.itemIds.length}${countUnit}=${group.valueLabel}`;
  if (group.itemIds.length > 6 || estimateDiagramTextWidth(fullLabel, fontSize) > maxWidthPx) {
    return summaryLabel;
  }
  return fullLabel;
}
