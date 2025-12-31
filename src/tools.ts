/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";

/**
 * Weather information tool that requires human confirmation
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  }
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date 
        : when.type === "delayed"
          ? when.delayInSeconds 
          : when.type === "cron"
            ? when.cron 
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});

// --- YENİ EKLENEN KV (HAFIZA) ARAÇLARI ---

/**
 * 1. ARAÇ: HAFIZAYA KAYDET
 */
const saveToMemory = tool({
  description: "Save important information (like user preferences, personal details) to long-term memory.",
  inputSchema: z.object({
    key: z.string().describe("The topic or key for the information (e.g., 'user_email', 'project_idea')"),
    value: z.string().describe("The information to save"),
  }),
  execute: async ({ key, value }) => {
    // Agent üzerinden environment'a erişiyoruz
    const { agent } = getCurrentAgent<Chat>();
    // TypeScript uyarısını aşmak için (any) kullanıyoruz çünkü Env tipi burada tanımlı değil
    const kv = (agent as any).env.MEMORY; 
    
    if (!kv) {
        return "Error: MEMORY database not found. Please check wrangler.jsonc configuration.";
    }

    await kv.put(key, value);
    return `Information saved to memory: [${key}: ${value}]`;
  },
});

/**
 * 2. ARAÇ: HAFIZADAN OKU
 */
const getFromMemory = tool({
  description: "Retrieve information from long-term memory using a specific key.",
  inputSchema: z.object({
    key: z.string().describe("The topic or key to search for"),
  }),
  execute: async ({ key }) => {
    const { agent } = getCurrentAgent<Chat>();
    const kv = (agent as any).env.MEMORY;

    if (!kv) {
        return "Error: MEMORY database not found.";
    }

    const value = await kv.get(key);
    return value ? `Found in memory: ${value}` : "No information found for this key.";
  },
});

/**
 * Export all available tools
 * YENİ ARAÇLARI BURAYA EKLEDİK
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  // Yeni eklenenler:
  saveToMemory,
  getFromMemory
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  }
};