import { MapPin } from "lucide-react";
import type { AnalysisMode } from "../types/structure";
import { modelObjectVocabulary } from "../lib/model-object-vocabulary";

interface ModelObjectGuideProps {
  mode: AnalysisMode;
}

export function ModelObjectGuide({ mode }: ModelObjectGuideProps) {
  const vocabulary = modelObjectVocabulary(mode);
  return (
    <div className="space-y-1">
      <div className="eyebrow flex items-center gap-2">
        <MapPin className="h-3.5 w-3.5 text-primary" />
        {vocabulary.navigatorTitle}
      </div>
      <p className="text-xs font-medium leading-relaxed text-muted-foreground">
        {vocabulary.navigatorDescription}
      </p>
    </div>
  );
}
