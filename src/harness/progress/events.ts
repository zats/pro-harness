type CostSoFar = {
  costSoFarUsd?: number;
  costSoFarPriced?: boolean;
  costSoFarPartiallyPriced?: boolean;
  costSoFarMissingPricingFor?: string[];
};

export type ProgressEvent =
  | ({ type: "run_start"; input: string; estimatedTotalSteps: number } & CostSoFar)
  | ({ type: "step_start"; stepId: string; title: string; detail?: string; completedSteps: number; estimatedTotalSteps: number } & CostSoFar)
  | ({ type: "step_end"; stepId: string; title: string; learned: string; completedSteps: number; estimatedTotalSteps: number } & CostSoFar)
  | ({
      type: "step_detail";
      stepId: string;
      title: string;
      level: 1 | 2 | 3;
      message: string;
      completedSteps: number;
      estimatedTotalSteps: number;
    } & CostSoFar)
  | ({ type: "budget_update"; remainingSteps: number; completedSteps: number; estimatedTotalSteps: number } & CostSoFar)
  | ({
      type: "run_end";
      finalAnswerChars: number;
      completedSteps: number;
      estimatedTotalSteps: number;
      usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
      usageDetails?: { cachedInputTokens: number; reasoningTokens: number; webSearchCalls: number };
      costUsd?: number;
      costPriced?: boolean;
      costPartiallyPriced?: boolean;
      costMissingPricingFor?: string[];
    } & CostSoFar);

export interface Reporter {
  emit(e: ProgressEvent): void;
}
