declare module 'openai' {
  export interface OpenAIOptions {
    apiKey: string;
    organization?: string;
    apiVersion?: string;
    baseURL?: string;
    timeout?: number;
    maxRetries?: number;
  }
  
  export interface CompletionOptions {
    model: string;
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content: string | null;
      name?: string;
      tool_call_id?: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    }>;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stream?: boolean;
    tools?: Array<{
      type: string;
      function: {
        name: string;
        description?: string;
        parameters: {
          type: string;
          properties: Record<string, any>;
          required?: string[];
        };
      };
    }>;
    tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  }
  
  export interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }
  
  export interface ChatCompletionToolMessageParam {
    role: 'tool';
    content: string;
    tool_call_id: string;
  }
  
  export interface CompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
      index: number;
      message: ChatCompletionMessage;
      finish_reason: string;
    }>;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }
  
  export class OpenAI {
    constructor(options: OpenAIOptions);
    
    chat: {
      completions: {
        create: (options: CompletionOptions) => Promise<CompletionResponse>;
      };
    };
  }
}

declare module 'openai/resources/chat/completions' {
  export interface ChatCompletionMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }
  
  export interface ChatCompletionToolMessageParam {
    role: 'tool';
    content: string;
    tool_call_id: string;
  }
} 