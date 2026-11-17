/** Shared native citation-support criteria for evaluation and hosted publication. */
import type { LLMTool } from "../utils/provider.js";

export const JUDGE_TOOL: LLMTool = {
  name: "judge_citation",
  description: "Rate how well the source excerpt supports the claim.",
  input_schema: {
    type: "object",
    properties: {
      score: {
        type: "integer",
        enum: [0, 1, 2],
        description:
          "0=not supported or contradicted, 1=partially supported, 2=fully supported",
      },
      reason: { type: "string", description: "One sentence explaining the rating." },
    },
    required: ["score", "reason"],
  },
};

export const JUDGE_SYSTEM =
  "You are an expert fact-checker. Given a claim from a wiki article and a source excerpt, rate whether the source supports the claim. Be strict: partial credit only if the source addresses the claim but is incomplete. Important: if the source excerpt consists entirely of YAML frontmatter (metadata fields such as title, date, author, or tags between --- delimiters), treat it as non-evidence for any substantive claim and score it 0, unless the claim is explicitly about that metadata field.";

