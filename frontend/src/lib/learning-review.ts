import type { BenchmarkLearningPath } from "./solver-project.ts";

export type LearningAnswers = Record<string, string>;

export interface LearningReviewAnswer {
  predictionId: string;
  selectedOptionId: string;
}

export interface LearningReview {
  schemaVersion: 1;
  pathId: string;
  caseId: string;
  reviewed: boolean;
  answers: LearningReviewAnswer[];
}

export interface LearningReviewEvaluation {
  predictionId: string;
  selectedOptionId: string;
  expectedOptionId: string;
  matched: boolean;
}

export function isLearningReviewComplete(learning: BenchmarkLearningPath, answers: LearningAnswers): boolean {
  return learning.predictions.every((prediction) =>
    prediction.options.some((option) => option.id === answers[prediction.id]),
  );
}

export function createLearningReview(
  caseId: string,
  learning: BenchmarkLearningPath,
  answers: LearningAnswers,
  reviewed: boolean,
): LearningReview {
  return {
    schemaVersion: 1,
    pathId: learning.pathId,
    caseId,
    reviewed,
    answers: learning.predictions.flatMap((prediction) => {
      const selectedOptionId = answers[prediction.id];
      return prediction.options.some((option) => option.id === selectedOptionId)
        ? [{ predictionId: prediction.id, selectedOptionId }]
        : [];
    }),
  };
}

export function evaluateLearningReview(
  learning: BenchmarkLearningPath,
  answers: LearningAnswers,
): LearningReviewEvaluation[] {
  return learning.predictions.map((prediction) => {
    const selectedOptionId = answers[prediction.id] ?? "";
    return {
      predictionId: prediction.id,
      selectedOptionId,
      expectedOptionId: prediction.expectedOptionId,
      matched: selectedOptionId === prediction.expectedOptionId,
    };
  });
}
