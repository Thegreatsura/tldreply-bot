import { Bot } from 'grammy';
import { Database } from '../../db/database';
import { EncryptionService } from '../../utils/encryption';
import { getGeminiService } from '../../services/geminiPool';
import { logger } from '../../utils/logger';
import { markdownToHtml, splitMessage } from '../../utils/formatter';
import { linkMessageReferences } from '../../utils/messageLinks';
import { sendHtmlMessage } from '../../utils/telegram';
import { MyContext } from '../commands/BaseCommand';
import { isScheduleDue } from './schedule';

/** Same ceiling as /tldr, so a busy group's daily summary covers the whole day. */
const MAX_SCHEDULED_MESSAGES = 10000;

export class SchedulerService {
  private bot: Bot<MyContext>;
  private db: Database;
  private encryption: EncryptionService;

  constructor(bot: Bot<MyContext>, db: Database, encryption: EncryptionService) {
    this.bot = bot;
    this.db = db;
    this.encryption = encryption;
  }

  /**
   * Fires every schedule whose slot has passed since its last run.
   *
   * Safe to call as often as wanted: the due check is against the schedule's
   * last run, not against the current minute, so the interval it runs on only
   * bounds how late a summary can be.
   */
  async checkAndRunScheduledSummaries(now: Date = new Date()): Promise<void> {
    try {
      const groupsWithSchedules = await this.db.getGroupsWithScheduledSummaries();

      for (const settings of groupsWithSchedules) {
        try {
          const group = await this.db.getGroup(settings.telegram_chat_id);
          if (!group || !group.gemini_api_key_encrypted || !group.enabled) {
            continue;
          }

          const due = isScheduleDue(
            {
              scheduledEnabled: Boolean(settings.scheduled_enabled),
              frequency: settings.schedule_frequency || 'daily',
              time: settings.schedule_time || '09:00:00',
              timezone: settings.schedule_timezone || 'UTC',
              lastRun: settings.last_scheduled_summary
                ? new Date(settings.last_scheduled_summary)
                : null,
            },
            now
          );
          if (!due) continue;

          // Recorded before generating: a failing summary should not be
          // retried every few minutes for the rest of the grace window.
          await this.db.updateLastScheduledSummary(settings.telegram_chat_id);
          await this.generateScheduledSummary(settings.telegram_chat_id, settings);
        } catch (error) {
          logger.error(
            `Error processing scheduled summary for group ${settings.telegram_chat_id}:`,
            error
          );
        }
      }
    } catch (error) {
      logger.error('Error checking scheduled summaries:', error);
      throw error;
    }
  }

  private async generateScheduledSummary(chatId: number, settings: any): Promise<void> {
    try {
      const group = await this.db.getGroup(chatId);
      if (!group || !group.gemini_api_key_encrypted) return;

      // Get messages from the last period
      const hoursAgo = settings.schedule_frequency === 'weekly' ? 168 : 24; // 7 days or 1 day
      const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

      const messages = await this.db.getMessagesSinceTimestamp(
        chatId,
        since,
        MAX_SCHEDULED_MESSAGES
      );
      if (messages.length === 0) {
        return; // No messages to summarize
      }

      // Filter messages based on settings
      const filteredMessages = messages.filter(msg => {
        if (settings.exclude_bot_messages && msg.is_bot) return false;
        if (settings.exclude_commands && msg.content?.startsWith('/')) return false;
        if (
          settings.excluded_user_ids &&
          msg.user_id &&
          settings.excluded_user_ids.includes(msg.user_id)
        )
          return false;
        return true;
      });

      if (filteredMessages.length === 0) return;

      const formattedMessages = filteredMessages.map(msg => ({
        username: msg.username,
        firstName: msg.first_name,
        content: msg.content,
        timestamp: msg.timestamp,
        isBot: msg.is_bot,
        isChannel: msg.is_channel,
        messageId: msg.message_id,
      }));

      const gemini = getGeminiService(chatId, group.gemini_api_key_encrypted, this.encryption);
      const summary = await gemini.summarizeMessages(formattedMessages, {
        customPrompt: settings.custom_prompt,
        summaryStyle: settings.summary_style,
        chatId: chatId,
        chatUsername: group.username,
        timezone: settings.schedule_timezone || 'UTC',
      });

      const linked = linkMessageReferences(
        summary,
        chatId,
        group.username,
        new Set(filteredMessages.map(msg => Number(msg.message_id)))
      );
      const formattedSummary = markdownToHtml(linked);

      const frequencyText = settings.schedule_frequency === 'weekly' ? 'Weekly' : 'Daily';
      const header = `📅 <b>${frequencyText} Scheduled Summary</b>`;

      const MAX_LENGTH = 4000;
      if (formattedSummary.length <= MAX_LENGTH) {
        await sendHtmlMessage(this.bot.api, chatId, `${header}\n\n${formattedSummary}`);
      } else {
        const chunks = splitMessage(formattedSummary, MAX_LENGTH);
        for (let i = 0; i < chunks.length; i++) {
          const chunkHeader = `${header} (${i + 1}/${chunks.length})`;
          await sendHtmlMessage(this.bot.api, chatId, `${chunkHeader}\n\n${chunks[i]}`);
        }
      }
    } catch (error) {
      logger.error(`Error generating scheduled summary for group ${chatId}:`, error);
    }
  }
}
