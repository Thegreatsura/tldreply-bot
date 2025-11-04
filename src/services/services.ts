import { Database } from '../db/database';
import { EncryptionService } from '../utils/encryption';

// Global instances that conversations can access
export let db: Database | null = null;
export let encryption: EncryptionService | null = null;
export const updateState: Map<number, number> = new Map(); // userId -> chatId for API key updates
export const updateStateTimestamps: Map<number, number> = new Map(); // userId -> timestamp when state was set
const STATE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes timeout

export function setServices(database: Database, encryptionService: EncryptionService) {
  db = database;
  encryption = encryptionService;
}

// Clear expired state entries
export function clearExpiredState(): void {
  const now = Date.now();
  for (const [userId, timestamp] of updateStateTimestamps.entries()) {
    if (now - timestamp > STATE_TIMEOUT_MS) {
      updateState.delete(userId);
      updateStateTimestamps.delete(userId);
    }
  }
}

// Set state with timestamp
export function setUpdateState(userId: number, chatId: number): void {
  updateState.set(userId, chatId);
  updateStateTimestamps.set(userId, Date.now());
}

// Get state and clear if expired
export function getUpdateState(userId: number): number | undefined {
  clearExpiredState();
  const timestamp = updateStateTimestamps.get(userId);
  if (timestamp && Date.now() - timestamp > STATE_TIMEOUT_MS) {
    updateState.delete(userId);
    updateStateTimestamps.delete(userId);
    return undefined;
  }
  return updateState.get(userId);
}

// Clear state for a user
export function clearUpdateState(userId: number): void {
  updateState.delete(userId);
  updateStateTimestamps.delete(userId);
}
