import "@blaxel/telemetry";
import express, { Request, Response } from "express";
import { SandboxInstance } from "@blaxel/core";
import { analyzeRepo, generateDiagram, chatWithRepo } from "./agent.js";

const host = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "8000");

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/analyze", async (req: Request, res: Response) => {
  const { sandboxName, prompt, systemPrompt, model, jobId } = req.body;

  if (!sandboxName || !prompt) {
    return res.status(400).json({ error: "sandboxName and prompt are required" });
  }

  try {
    const sandbox = await SandboxInstance.get(sandboxName);
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    for await (const event of analyzeRepo(sandbox, {
      prompt,
      systemPrompt: systemPrompt || SYSTEM_PROMPT,
      model: model || "claude-haiku-4-5",
      jobId: jobId || "unknown",
    })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  } catch (error) {
    console.error("[Analyze] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
});

app.post("/diagram", async (req: Request, res: Response) => {
  const { sandboxName, prompt, systemPrompt, model, jobId } = req.body;

  if (!sandboxName || !prompt) {
    return res.status(400).json({ error: "sandboxName and prompt are required" });
  }

  try {
    const sandbox = await SandboxInstance.get(sandboxName);
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    
    for await (const event of generateDiagram(sandbox, {
      prompt,
      systemPrompt: systemPrompt || SYSTEM_PROMPT,
      model: model || "claude-haiku-4-5",
      jobId: jobId || "unknown",
    })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  } catch (error) {
    console.error("[Diagram] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
});

app.post("/chat", async (req: Request, res: Response) => {
  const { sandboxName, messages, systemPrompt, model, context, graphContext } = req.body;

  if (!sandboxName || !messages) {
    return res.status(400).json({ error: "sandboxName and messages are required" });
  }

  try {
    const sandbox = await SandboxInstance.get(sandboxName);
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    
    for await (const event of chatWithRepo(sandbox, {
      messages,
      systemPrompt,
      model: model || "claude-haiku-4-5",
      context,
      graphContext,
    })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  } catch (error) {
    console.error("[Chat] Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
});

const SYSTEM_PROMPT = `You are an expert software architect and technical analyst.

Your expertise includes:
- Analyzing codebases to understand architecture and design patterns
- Identifying tech stacks, frameworks, and dependencies
- Understanding data flows and component interactions
- Creating clear, comprehensive system design documentation

The repository is already available at /repo. Focus on analyzing the existing files.`;

app.listen(port, host, () => {
  console.log(`Onboardy Analyzer Agent listening on ${host}:${port}`);
});
