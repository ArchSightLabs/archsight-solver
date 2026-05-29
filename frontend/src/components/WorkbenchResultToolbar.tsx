import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileText, Play, RotateCw, Settings2, Table2 } from "lucide-react";
import { Button } from "./ui/button";
import type { ExportFormat } from "../hooks/useWorkbenchActions";
import {
  REPORT_FIGURE_MODE_OPTIONS,
  REPORT_FIGURE_SCOPE_OPTIONS,
  REPORT_TEMPLATE_OPTIONS,
  type ReportExportOptions,
  type ReportFigureMode,
  type ReportFigureScope,
  type ReportTemplate,
} from "../lib/report-options";
import { exportToolbarLabel } from "../lib/workbench-operation-status";
import { ReportOptionSelect } from "./workbench-result-panels";

interface WorkbenchResultToolbarProps {
  compact: boolean;
  hasResults: boolean;
  isSolving: boolean;
  runLabel: string;
  exportingFormat: ExportFormat | null;
  reportExportOptions: ReportExportOptions;
  onRunCalculation: () => void;
  onExport: (format: ExportFormat) => void;
  onReportExportOptionsChange: (options: ReportExportOptions) => void;
}

export function WorkbenchResultToolbar({
  compact,
  hasResults,
  isSolving,
  runLabel,
  exportingFormat,
  reportExportOptions,
  onRunCalculation,
  onExport,
  onReportExportOptionsChange,
}: WorkbenchResultToolbarProps) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExportSettingsOpen, setIsExportSettingsOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const isExportingAny = exportingFormat !== null;
  const exportLabel = exportToolbarLabel(exportingFormat);

  const updateReportExportOption = <K extends keyof ReportExportOptions>(key: K, value: ReportExportOptions[K]) => {
    onReportExportOptionsChange({ ...reportExportOptions, [key]: value });
  };

  const handleExportFormat = (format: ExportFormat) => {
    setIsExportMenuOpen(false);
    onExport(format);
  };

  const toggleExportMenu = () => {
    const nextOpen = !isExportMenuOpen;
    setIsExportMenuOpen(nextOpen);
    if (nextOpen) {
      setIsExportSettingsOpen(false);
    }
  };

  useEffect(() => {
    if (!isExportMenuOpen) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof globalThis.Node && !exportMenuRef.current?.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExportMenuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={onRunCalculation}
        disabled={isSolving}
        className={`rounded-lg font-bold shadow-lg shadow-primary/20 disabled:opacity-50 ${compact ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
        title={runLabel}
      >
        {isSolving ? (
          <RotateCw className={`mr-2 animate-spin ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
        ) : (
          <Play className={`mr-2 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
        )}
        {runLabel}
      </Button>
      <div
        ref={exportMenuRef}
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsExportMenuOpen(false);
          }
        }}
      >
        <Button
          type="button"
          variant="outline"
          onClick={toggleExportMenu}
          disabled={!hasResults || isExportingAny}
          aria-haspopup="menu"
          aria-expanded={isExportMenuOpen}
          className={`rounded-lg border-white/10 bg-white/[0.03] font-bold text-foreground hover:bg-primary/5 disabled:opacity-50 ${compact ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
        >
          <FileText className={`mr-2 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
          {exportLabel}
          <ChevronDown className={`ml-2 transition-transform ${isExportMenuOpen ? "rotate-180" : ""} ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
        </Button>
        {isExportMenuOpen && hasResults && !isExportingAny ? (
          <div
            role="menu"
            className={`absolute right-0 top-full z-50 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/30 ${compact ? "text-xs" : "text-sm"}`}
          >
            <div className="px-2.5 pb-1 pt-1 text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400">
              成果文件
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleExportFormat("docx")}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-black">导出计算书</span>
                <span className="block truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">Word · 模型、图形与校核摘要</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => handleExportFormat("xlsx")}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Table2 className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-black">导出参数表</span>
                <span className="block truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">Excel · 输入参数与结果数据</span>
              </span>
            </button>
            <div className="mt-1.5 border-t border-slate-200 p-1.5 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsExportSettingsOpen((current) => !current)}
                aria-expanded={isExportSettingsOpen}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[11px] font-black text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="h-3.5 w-3.5" />
                  计算书设置
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExportSettingsOpen ? "rotate-180" : ""}`} />
              </button>
              {isExportSettingsOpen ? (
                <div className="grid gap-2 px-1 pb-1 pt-2">
                  <ReportOptionSelect
                    id="report-template"
                    name="reportTemplate"
                    label="计算书模板"
                    value={reportExportOptions.template}
                    options={REPORT_TEMPLATE_OPTIONS}
                    onChange={(value) => updateReportExportOption("template", value as ReportTemplate)}
                  />
                  <ReportOptionSelect
                    id="report-figure-mode"
                    name="reportFigureMode"
                    label="图形模式"
                    value={reportExportOptions.figureMode}
                    options={REPORT_FIGURE_MODE_OPTIONS}
                    onChange={(value) => updateReportExportOption("figureMode", value as ReportFigureMode)}
                  />
                  <ReportOptionSelect
                    id="report-figure-scope"
                    name="reportFigureScope"
                    label="插图范围"
                    value={reportExportOptions.figureScope}
                    options={REPORT_FIGURE_SCOPE_OPTIONS}
                    onChange={(value) => updateReportExportOption("figureScope", value as ReportFigureScope)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
