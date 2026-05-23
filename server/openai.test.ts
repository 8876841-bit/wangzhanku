import { describe, it, expect } from "vitest";

describe("OpenAI API Key validation", () => {
  it("should have OPENAI_API_KEY set", () => {
    expect(process.env.OPENAI_API_KEY).toBeDefined();
    expect(process.env.OPENAI_API_KEY!.length).toBeGreaterThan(10);
  });

  it("should be able to call OpenAI API", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    expect(response.status).toBe(200);
  }, 15000);
});
