import { Context } from 'grammy';
import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { GeminiService } from '../services/gemini';
import { db, encryption, getUpdateState, clearUpdateState, setUpdateState } from '../services/services';

type MyContext = ConversationFlavor<Context>;

type MyConversationContext = Context;

export async function setupApiKey(conversation: Conversation<MyContext>, ctx: MyConversationContext) {
  const chat = ctx.chat;
  if (!chat || chat.type !== 'private') return;

  await ctx.reply('Please paste your Gemini API key:');

  const apiKeyCtx = await conversation.waitFor('message:text');
  const apiKey = apiKeyCtx.message.text.trim();

  // Validate API key format
  if (!GeminiService.validateApiKey(apiKey)) {
    await ctx.reply('❌ Invalid API key format. Please try again with /setup_group.');
    return;
  }

    // Test the API key
    try {
      const gemini = new GeminiService(apiKey);
      await gemini.summarizeMessages([{ content: 'test', timestamp: new Date().toISOString() }]);
      
      // If successful, save the encrypted key
      if (!encryption || !db) {
        throw new Error('Database or encryption service not available');
      }
      
      // Find the most recent group setup for this user
      const groups = await db.query(
        'SELECT telegram_chat_id FROM groups WHERE setup_by_user_id = $1 ORDER BY setup_at DESC LIMIT 1',
        [chat.id]
      );
      
      if (groups.rows.length === 0) {
        throw new Error('No group found for setup');
      }
      
      const groupChatId = groups.rows[0].telegram_chat_id;
      
      // Final security check: verify user is still admin before saving API key
      try {
        const member = await ctx.api.getChatMember(groupChatId, chat.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
          await ctx.reply(
            '❌ You must be an admin of the group to complete setup.\n\n' +
            'If you were removed as admin, please ask a current admin to run /setup in the group.'
          );
          return;
        }
      } catch (error) {
        await ctx.reply(
          '❌ Could not verify admin status. Please try again or ask a group admin to run /setup.'
        );
        return;
      }
      
      const encryptedKey = encryption.encrypt(apiKey);
      await db.updateGroupApiKey(groupChatId, encryptedKey);

      await ctx.reply('✅ Successfully configured! You can now use /tldr in your group.');
    } catch (error: any) {
      console.error('API key validation error:', error);
      
      // Provide specific error messages
      const errorMessage = error.message || 'Unknown error';
      if (errorMessage.includes('Invalid API key') || errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('401')) {
        await ctx.reply('❌ Invalid API key. The API key format is incorrect or the key is invalid. Please check your key and try again.\n\n💡 Get a new key from: https://makersuite.google.com/app/apikey');
      } else if (errorMessage.includes('quota') || errorMessage.includes('QUOTA_EXCEEDED') || errorMessage.includes('429')) {
        await ctx.reply('❌ API quota exceeded. Your Gemini API key has reached its rate limit or quota. Please try again later or check your API usage.');
      } else if (errorMessage.includes('Permission denied') || errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('403')) {
        await ctx.reply('❌ Permission denied. Your API key may not have access to the Gemini API. Please check your API key permissions.');
      } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
        await ctx.reply('❌ Network error. Could not connect to the Gemini API. Please check your internet connection and try again.');
      } else {
        await ctx.reply(`❌ Failed to validate API key: ${errorMessage}. Please check your key and try again.`);
      }
    }
}

export async function updateApiKey(conversation: Conversation<MyContext>, ctx: MyConversationContext) {
  const chat = ctx.chat;
  if (!chat || chat.type !== 'private') return;

  // Clear any stale state before starting
  clearUpdateState(chat.id);

  // Get the group chat ID from the update state
  const groupChatId = getUpdateState(chat.id);
  
  if (!groupChatId) {
    await ctx.reply('❌ No group selected for update. Please run /update_api_key again.');
    return;
  }
  
  // Clear the state after getting it (conversation is starting)
  clearUpdateState(chat.id);

  await ctx.reply('Please paste your new Gemini API key:');

  const apiKeyCtx = await conversation.waitFor('message:text');
  const apiKey = apiKeyCtx.message.text.trim();

  // Validate API key format
  if (!GeminiService.validateApiKey(apiKey)) {
    await ctx.reply('❌ Invalid API key format. Please try again with /update_api_key.');
    return;
  }

  // Test the API key
  try {
    const gemini = new GeminiService(apiKey);
    await gemini.summarizeMessages([{ content: 'test', timestamp: new Date().toISOString() }]);
    
    // If successful, save the encrypted key
    if (!encryption || !db) {
      throw new Error('Database or encryption service not available');
    }
    
    // Verify user is still admin of the group
    try {
      const member = await ctx.api.getChatMember(groupChatId, chat.id);
      if (member.status !== 'administrator' && member.status !== 'creator') {
        await ctx.reply(
          '❌ You must be an admin of the group to update the API key.\n\n' +
          'If you were removed as admin, please ask a current admin to update it.'
        );
        return;
      }
    } catch (error) {
      await ctx.reply(
        '❌ Could not verify admin status. Please try again or ask a group admin to update it.'
      );
      return;
    }
    
    // Update the encrypted key
    const encryptedKey = encryption.encrypt(apiKey);
    await db.updateGroupApiKey(groupChatId, encryptedKey);

    await ctx.reply('✅ API key updated successfully! The bot will now use the new key for summaries.');
  } catch (error: any) {
    console.error('API key validation error:', error);
    
    // Provide specific error messages
    const errorMessage = error.message || 'Unknown error';
    if (errorMessage.includes('Invalid API key') || errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('401')) {
      await ctx.reply('❌ Invalid API key. The API key format is incorrect or the key is invalid. Please check your key and try again.\n\n💡 Get a new key from: https://makersuite.google.com/app/apikey');
    } else if (errorMessage.includes('quota') || errorMessage.includes('QUOTA_EXCEEDED') || errorMessage.includes('429')) {
      await ctx.reply('❌ API quota exceeded. Your Gemini API key has reached its rate limit or quota. Please try again later or check your API usage.');
    } else if (errorMessage.includes('Permission denied') || errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('403')) {
      await ctx.reply('❌ Permission denied. Your API key may not have access to the Gemini API. Please check your API key permissions.');
    } else if (errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      await ctx.reply('❌ Network error. Could not connect to the Gemini API. Please check your internet connection and try again.');
    } else {
      await ctx.reply(`❌ Failed to validate API key: ${errorMessage}. Please check your key and try again.`);
    }
  }
}
