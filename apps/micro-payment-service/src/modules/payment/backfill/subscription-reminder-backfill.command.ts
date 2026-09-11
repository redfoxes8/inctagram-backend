import { NestFactory } from '@nestjs/core';
import { BackfillSubscriptionRemindersService } from '../application/services/backfill-subscription-reminders.service';
import { SubscriptionReminderBackfillModule } from './subscription-reminder-backfill.module';

type Arguments = Readonly<{ cursor?: string; pageSize?: number }>;

async function main(): Promise<void> {
  const argumentsValue = parseArguments(process.argv.slice(2));
  const context = await NestFactory.createApplicationContext(SubscriptionReminderBackfillModule, {
    logger: false,
  });
  try {
    const service = context.get(BackfillSubscriptionRemindersService);
    process.stdout.write(`${JSON.stringify(await service.runOnce(argumentsValue))}\n`);
  } finally {
    await context.close();
  }
}

function parseArguments(argumentsValue: string[]): Arguments {
  const result: { cursor?: string; pageSize?: number } = {};
  for (const argument of argumentsValue) {
    if (argument === '--') continue;
    if (argument.startsWith('--cursor=')) result.cursor = argument.slice('--cursor='.length);
    else if (argument.startsWith('--page-size='))
      result.pageSize = Number(argument.slice('--page-size='.length));
    else throw new Error('Unsupported reminder backfill argument');
  }
  return result;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Reminder backfill failed';
  process.stderr.write(`payment.reminder.backfill.failed: ${message}\n`);
  process.exitCode = 1;
});
