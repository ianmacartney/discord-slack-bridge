// Jev (TypeSafe) structured decisions via the Convex AI gateway.
// https://docs.convex.dev/ai-gateway -- POST /alpha/decisions (alpha, format may change).
import { callGateway } from "./aiGateway";

export const JEV_MODEL = "typesafe/jev-1.14";

export type JevQuestion =
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "score"; instructions: unknown; criteria: unknown[] }
  // `noul` is a yes/no question: the answer is a probability from 0 to 1 that the statement is true.
  | {
    type: "noul";
    instructions: unknown;
    criteria?: { true?: unknown; false?: unknown };
  };

export type JevAnswer =
  | {
    type: "choice";
    choice: string;
    confidence?: number;
    probabilities?: Record<string, number>;
  }
  | {
    type: "score";
    score: number;
    confidence?: number;
    probabilities?: Record<string, number>;
  }
  | { type: "noul"; noul: number };

export type JevResult<Q extends Record<string, JevQuestion>> = {
  id: string;
  model: string;
  answers: { [K in keyof Q]: JevAnswer };
  usage?: { input_tokens: number; output_tokens: number; cost?: number };
};

/** Ask Jev one or more independent questions about the same `state`. */
export const decide = <Q extends Record<string, JevQuestion>>(
  state: unknown,
  questions: Q,
) =>
  callGateway<JevResult<Q>>("/alpha/decisions", {
    model: JEV_MODEL,
    state,
    questions,
  });
