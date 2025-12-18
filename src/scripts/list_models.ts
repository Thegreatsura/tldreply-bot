import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.error('❌ No GEMINI_API_KEY found in .env file.');
    logger.error('Please make sure you have a .env file with GEMINI_API_KEY=...');
    logger.error('Or provide it directly: GEMINI_API_KEY=... npm run list-models');
    process.exit(1);
  }

  logger.info('🔄 Connecting to Google GenAI...');
  const genAI = new GoogleGenAI({ apiKey });

  try {
    logger.info('📋 Fetching available models...');
    const response: any = await genAI.models.list();

    logger.info('\n✅ Available Models:');
    logger.info('----------------------------------------');

    const models = response.models || response || [];
    if (models.length === 0) {
      logger.error('No models found?');
    }

    for (const model of models) {
      logger.info(`- ${model.name}`);
      logger.info(`  Display Name: ${model.displayName}`);
      logger.info(`  Description: ${model.description}`);
      logger.info(`  Supported Methods: ${model.supportedGenerationMethods?.join(', ')}`);
      logger.info('----------------------------------------');
    }
  } catch (error: any) {
    logger.error('❌ Error listing models:', error.message);
    if (error.response) {
      logger.error('Response:', JSON.stringify(error.response, null, 2));
    }
  }
}

listModels();
