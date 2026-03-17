import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatRequest {
  provider: string;
  skillContent: string;
  messages: Array<{ role: string; content: string }>;
  userMessage: string;
}

async function callGemini(apiKey: string, skillContent: string, messages: any[], userMessage: string) {
  const { GoogleGenerativeAI } = await import("npm:@google/genai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const systemPrompt = `You are a helpful marketing assistant. You have access to this marketing skill guide:

${skillContent}

Based on this guide, help the user understand and apply these marketing concepts. Be conversational, practical, and provide specific examples when relevant.`;

  const history = messages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  const chat = model.startChat({
    history,
    systemInstruction: systemPrompt,
  });

  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

async function callOpenAI(apiKey: string, skillContent: string, messages: any[], userMessage: string) {
  const systemPrompt = `You are a helpful marketing assistant. You have access to this marketing skill guide:

${skillContent}

Based on this guide, help the user understand and apply these marketing concepts. Be conversational, practical, and provide specific examples when relevant.`;

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: chatMessages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callClaude(apiKey: string, skillContent: string, messages: any[], userMessage: string) {
  const systemPrompt = `You are a helpful marketing assistant. You have access to this marketing skill guide:

${skillContent}

Based on this guide, help the user understand and apply these marketing concepts. Be conversational, practical, and provide specific examples when relevant.`;

  const claudeMessages = [
    ...messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 8096,
      system: systemPrompt,
      messages: claudeMessages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { provider, skillContent, messages, userMessage }: ChatRequest = await req.json();

    if (!provider || !skillContent || !userMessage) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: keyData, error: keyError } = await supabase
      .from("ai_api_keys")
      .select("api_key")
      .eq("provider", provider)
      .maybeSingle();

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ error: `API key not found for provider: ${provider}` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let response: string;

    switch (provider) {
      case "gemini":
        response = await callGemini(keyData.api_key, skillContent, messages, userMessage);
        break;
      case "openai":
        response = await callOpenAI(keyData.api_key, skillContent, messages, userMessage);
        break;
      case "claude":
        response = await callClaude(keyData.api_key, skillContent, messages, userMessage);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Unsupported provider: ${provider}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }

    return new Response(
      JSON.stringify({ response }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in ai-chat function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
