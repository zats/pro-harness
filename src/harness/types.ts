export type Stakes = "low" | "medium" | "high";
export type TaskType = "factual" | "coding" | "math" | "writing" | "planning" | "research" | "other";
export type OutputFormat = "freeform" | "json" | "markdown" | "code" | "table" | "other";
export type Recipe = "direct" | "best_of_n" | "plan_execute_verify" | "rag_cited";
export type ToolName = "web_search" | "python";

export type TaskSpec = {
  task_type: TaskType;
  stakes: Stakes;
  tools_needed: ToolName[] | ["none"];
  output_format: OutputFormat;
  recipe: Recipe;
  clarification_needed: boolean;
  clarification_questions: string[];
};

export type EvidenceItem = {
  id: string;
  url?: string;
  title?: string;
  snippet?: string;
  fetched_at: string;
};

export type ContextPack = {
  system_rules: string;
  user_rules: string;
  conversation_summary: string;
  retrieved_evidence: EvidenceItem[];
  artifacts: Record<string, unknown>;
};

export type PlanStep = {
  step_id: string;
  goal: string;
  // LLM output is not guaranteed; accept "none" and treat it as no tool call.
  tool_call?: { tool: ToolName | "none"; input: Record<string, unknown> };
  expected_artifact: string;
  stop_condition: string;
};

export type Plan = {
  plan: PlanStep[];
  acceptance_criteria: string[];
  risks: string[];
};

export type Candidate = {
  id: string;
  draft_text: string;
  citations: EvidenceItem[];
};

export type Review = {
  overall_score: number;
  subscores: Record<string, number>;
  major_issues: string[];
  minor_issues: string[];
  recommended_repairs: string[];
  verification_targets: string[];
  tool_requests?: { tool: "web_search"; input: { query: string; topK?: number } }[];
};

export type Verification = {
  verified: { claim: string; status: "supported" | "unsupported" | "unclear"; evidence_ref?: string }[];
  required_edits: string[];
  confidence: number;
};
