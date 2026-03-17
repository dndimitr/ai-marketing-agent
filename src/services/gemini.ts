import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function chatWithSkill(
  skillMarkdown: string,
  history: Message[],
  message: string
) {
  const model = "gemini-3.1-pro-preview";
  
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: `You are an expert marketing assistant specialized in the following skill. 
      Use the provided guidelines and principles to help the user.
      
      SKILL GUIDELINES:
      ${skillMarkdown}
      
      CAPABILITIES:
      - You have access to the 'urlContext' tool. If the user provides a URL, you can analyze its content directly.
      - You have access to 'googleSearch' for real-time information.
      
      When a user provides a website URL, use your tools to fetch and analyze its content (SEO, copy, structure, etc.) based on the skill guidelines.
      
      Always be professional, data-driven, and practical.`,
      tools: [
        { urlContext: {} },
        { googleSearch: {} }
      ]
    },
    history: history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }))
  });

  const result = await chat.sendMessage({ message });
  return result.text;
}
