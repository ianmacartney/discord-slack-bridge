// https://docs.convex.dev/ai-gateway. Only callable from actions: the service token is only available there.
import { getServiceToken } from "convex/server";

const GATEWAY_URL = "https://ai-gateway.convex.dev";

export const callGateway = async <T>(path: string, body: unknown) => {
  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await getServiceToken("ai-gateway")}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `AI gateway ${path} failed (${response.status}): ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
};

type ChatCompletion = {
  choices: { finish_reason: string; message: { content: string | null } }[];
};

/** The model's reply, or null when it's empty or was cut off at `maxTokens`. */
export const generateText = async ({
  model,
  system,
  prompt,
  maxTokens,
}: {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
}) => {
  const { choices } = await callGateway<ChatCompletion>(
    "/v1/chat/completions",
    {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    },
  );
  const choice = choices[0];
  if (!choice || choice.finish_reason === "length") return null;
  return choice.message.content?.trim() || null;
};
