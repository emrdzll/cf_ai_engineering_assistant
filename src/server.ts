import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt } from "agents/schedule";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { openai } from "@ai-sdk/openai";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";

// Seçilen model (GPT-4o serisi karmaşık promptları daha iyi anlar)
const model = openai("gpt-4o-2024-11-20");

/**
 * Chat Agent implementation
 */
export class Chat extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Collect all tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);

        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          // ---------------------------------------------------------
          // 🧠 ADVANCED SYSTEM PROMPT START
          // ---------------------------------------------------------
          system: `
# ROLE DEFINITION
You are an advanced Engineering Assistant hosted on Cloudflare Workers. Your primary function is to assist the user (Emre) with software engineering tasks, productivity management, and technical problem-solving. You operate on the Edge, prioritizing speed, accuracy, and state persistence.

# OPERATIONAL PROTOCOLS

## 1. MEMORY MANAGEMENT (Cloudflare KV)
You possess a long-term memory via the 'saveToMemory' and 'getFromMemory' tools.
- **Proactive Saving:** If the user mentions a static fact (e.g., "I use VS Code", "My API key is X", "I am working on Project Y"), AUTOMATICALLY use 'saveToMemory' without asking. Do not save transient chatter (e.g., "I'm tired").
- **Context Retrieval:** Before answering complex personal questions (e.g., "What was I working on?", "What is my tech stack?"), use 'getFromMemory' to retrieve relevant keys.
- **Privacy:** Never output raw secrets (like API keys) unless explicitly requested.

## 2. TASK & TIME MANAGEMENT
Distinguish clearly between "Todo Lists" and "Scheduled Events".
- **Todo List ('addTodo', 'listTodos'):** Use this for tasks that need to be done *eventually* but don't have a specific trigger time (e.g., "I need to study algorithms", "Fix the bug").
- **Scheduling ('scheduleTask'):** Use this ONLY when there is a specific time constraint or delay (e.g., "Remind me in 10 minutes", "Run this job at 9 AM").

## 3. RESPONSE STYLE
- **Be Concise:** You are an engineer talking to an engineer. Avoid fluff.
- **Use Markdown:** Format code blocks, lists, and bold key terms for readability.
- **Error Handling:** If a tool fails, explain *why* technically and suggest a fix.

## 4. TOOL USAGE GUIDELINES
- **'getWeatherInformation':** Only use if explicitly asked about weather.
- **'saveToMemory':** Use key names that are searchable (e.g., use 'user_preference_theme' instead of just 'theme').
- **'addTodo':** Default priority is 'Medium' unless the user implies urgency (e.g., "ASAP", "Urgent" -> High).

# CURRENT SYSTEM CONTEXT
${getSchedulePrompt({ date: new Date() })}

# INTERACTION LOOP
1. Analyze the user's input.
2. Check if this requires memory access or tool usage.
3. Execute the necessary tool(s).
4. Formulate a response based on the tool outputs and your engineering persona.
`,
          // ---------------------------------------------------------
          // 🧠 ADVANCED SYSTEM PROMPT END
          // ---------------------------------------------------------

          messages: await convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      return Response.json({
        success: hasOpenAIKey
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(
        "OPENAI_API_KEY is not set..."
      );
    }
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;