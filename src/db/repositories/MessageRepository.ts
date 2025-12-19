import { BaseRepository } from './BaseRepository';
import { logger } from '../../utils/logger';

export class MessageRepository extends BaseRepository {
  async insertMessage(data: {
    chatId: number;
    messageId: number;
    userId?: number;
    username?: string;
    firstName?: string;
    content: string;
    isBot?: boolean;
    isChannel?: boolean;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO messages (telegram_chat_id, message_id, user_id, username, first_name, content, is_bot, is_channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (telegram_chat_id, message_id)
       DO UPDATE SET
         content = EXCLUDED.content,
         username = EXCLUDED.username,
         first_name = EXCLUDED.first_name,
         user_id = EXCLUDED.user_id,
         is_bot = EXCLUDED.is_bot,
         is_channel = EXCLUDED.is_channel`,
      [
        data.chatId,
        data.messageId,
        data.userId,
        data.username,
        data.firstName,
        data.content,
        data.isBot || false,
        data.isChannel || false,
      ]
    );
  }

  async getMessagesSinceTimestamp(
    chatId: number,
    since: Date,
    limit: number = 1000,
    username?: string
  ): Promise<any[]> {
    // Allow up to 10000 messages for hierarchical summarization
    const maxLimit = Math.min(limit, 10000);
    let query = 'SELECT * FROM messages WHERE telegram_chat_id = $1 AND timestamp >= $2';
    const params: any[] = [chatId, since];

    if (username) {
      query += ` AND username = $${params.length + 1}`;
      params.push(username);
    }

    query += ` ORDER BY timestamp ASC LIMIT $${params.length + 1}`;
    params.push(maxLimit);

    const result = await this.db.query(query, params);
    return result.rows;
  }

  async getMessagesSinceMessageId(
    chatId: number,
    sinceMessageId: number,
    limit: number = 1000
  ): Promise<any[]> {
    // Allow up to 10000 messages for hierarchical summarization
    const maxLimit = Math.min(limit, 10000);
    const result = await this.db.query(
      'SELECT * FROM messages WHERE telegram_chat_id = $1 AND message_id >= $2 ORDER BY message_id ASC LIMIT $3',
      [chatId, sinceMessageId, maxLimit]
    );
    return result.rows;
  }

  async getLastNMessages(chatId: number, count: number, username?: string): Promise<any[]> {
    // Get the last N messages, ordered by timestamp descending, then reverse to chronological order
    const maxCount = Math.min(count, 10000); // Limit to 10000 messages
    let query = 'SELECT * FROM messages WHERE telegram_chat_id = $1';
    const params: any[] = [chatId];

    if (username) {
      query += ` AND username = $${params.length + 1}`;
      params.push(username);
    }

    query += ` ORDER BY timestamp DESC, message_id DESC LIMIT $${params.length + 1}`;
    params.push(maxCount);

    const result = await this.db.query(query, params);
    // Reverse to get chronological order (oldest first)
    return result.rows.reverse();
  }

  async getMessagesToCleanup(hoursAgo: number): Promise<any[]> {
    // Get messages that are about to be deleted, grouped by chat
    const result = await this.db.query(
      "SELECT * FROM messages WHERE timestamp < NOW() - (INTERVAL '1 hour' * $1) ORDER BY telegram_chat_id, timestamp ASC",
      [hoursAgo]
    );
    return result.rows;
  }

  async cleanupOldMessages(hoursAgo: number): Promise<void> {
    const result = await this.db.query(
      "DELETE FROM messages WHERE timestamp < NOW() - (INTERVAL '1 hour' * $1)",
      [hoursAgo]
    );
    logger.info(`Cleaned up ${result.rowCount} old messages`);
  }
}
