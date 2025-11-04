import { GoogleGenAI } from '@google/genai';

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async summarizeMessages(
    messages: Array<{
      username?: string;
      firstName?: string;
      content: string;
      timestamp: string;
    }>,
    options?: {
      customPrompt?: string | null;
      summaryStyle?: string;
    },
    retryCount: number = 0
  ): Promise<string> {
    if (messages.length === 0) {
      return 'No messages found in the specified time range.';
    }

    // Format messages for context
    const formattedMessages = messages.map((msg, idx) => {
      const user = msg.username || msg.firstName || 'Unknown';
      const content = msg.content;
      return `${idx + 1}. [${user}]: ${content}`;
    }).join('\n\n');

    // Build base prompt
    let prompt = '';
    
    if (options?.customPrompt) {
      // Use custom prompt if provided
      prompt = options.customPrompt.replace('{{messages}}', formattedMessages);
    } else {
      // Use default prompt with style variations
      const styleInstructions = this.getStyleInstructions(options?.summaryStyle || 'default');
      
      prompt = `You are a helpful assistant that summarizes Telegram group chat conversations. 
    ${styleInstructions}
    
    Focus on:
    - Main topics discussed
    - Key decisions or conclusions
    - Important announcements
    - Ongoing questions or unresolved issues
    - Skip greetings, emojis-only messages, and spam
    
    Conversation:
    ${formattedMessages}
    
    Summary:`;
    }

    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    for (let attempt = retryCount; attempt < maxRetries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.0-flash-001',
          contents: prompt,
        });
        return response.text || 'Generated summary (no text returned)';
      } catch (error: any) {
        console.error(`Gemini API error (attempt ${attempt + 1}/${maxRetries}):`, error);
        
        // Don't retry on these errors - they won't be fixed by retrying
        const isNonRetryableError = 
          error.message?.includes('API_KEY_INVALID') || 
          error.message?.includes('401') || 
          error.message?.includes('Unauthorized') ||
          error.message?.includes('PERMISSION_DENIED') || 
          error.message?.includes('403') ||
          error.message?.includes('QUOTA_EXCEEDED') && attempt === maxRetries - 1; // Only non-retryable on last attempt
        
        if (isNonRetryableError) {
          // Provide more specific error messages
          if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
            throw new Error('Invalid API key. Please check your Gemini API key and ensure it\'s correct. You can update it using /update_api_key.');
          } else if (error.message?.includes('PERMISSION_DENIED') || error.message?.includes('403')) {
            throw new Error('Permission denied. Your API key may not have access to the Gemini API. Please check your API key permissions.');
          } else if (error.message?.includes('QUOTA_EXCEEDED') || error.message?.includes('429')) {
            throw new Error('API quota exceeded. Your Gemini API key has reached its rate limit or quota. Please try again later or check your API usage.');
          }
        }
        
        // Retry on transient errors (timeout, network, rate limits on first attempts)
        const isTransientError = 
          error.message?.includes('timeout') || 
          error.message?.includes('TIMEOUT') ||
          error.message?.includes('network') || 
          error.message?.includes('ECONNREFUSED') || 
          error.message?.includes('ENOTFOUND') ||
          error.message?.includes('429') && attempt < maxRetries - 1; // Rate limit - retry with backoff
        
        if (isTransientError && attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt);
          console.log(`Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }
        
        // If we get here, it's either the last attempt or a non-transient error
        if (error.message?.includes('timeout') || error.message?.includes('TIMEOUT')) {
          throw new Error('Request timeout. The API request took too long after multiple retries. Please try again.');
        } else if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED') || error.message?.includes('ENOTFOUND')) {
          throw new Error('Network error. Could not connect to the Gemini API after multiple retries. Please check your internet connection and try again.');
        } else {
          throw new Error(`Failed to generate summary: ${error.message || 'Unknown error'}. Please check your API key and try again.`);
        }
      }
    }
    
    // Should never reach here, but TypeScript needs it
    throw new Error('Failed to generate summary after multiple retries.');
  }

  private getStyleInstructions(style: string): string {
    switch (style) {
      case 'detailed':
        return 'Provide a detailed, comprehensive summary. Include all important points, context, and nuances. Keep the summary under 500 words.';
      case 'brief':
        return 'Provide a very brief summary. Focus only on the most critical points. Keep the summary under 150 words.';
      case 'bullet':
        return 'Provide a summary using bullet points. Each bullet should be concise and clear. Keep the summary under 300 words.';
      case 'timeline':
        return 'Provide a chronological summary, organizing events and discussions in the order they occurred. Keep the summary under 400 words.';
      default:
        return 'Provide a concise, well-structured summary. Keep the summary under 300 words and use bullet points if helpful.';
    }
  }

  static validateApiKey(apiKey: string): boolean {
    // Basic validation - Gemini API keys typically have this format
    return apiKey.length > 20 && /^[A-Za-z0-9_-]+$/.test(apiKey);
  }
}
