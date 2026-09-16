import { Injectable } from '@nestjs/common';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { SubscriptionReminderBackfillCursor } from '../../domain/interfaces/subscription-reminder-backfill.repository.interface';
import { IPaymentUnitOfWork } from '../ports/payment-unit-of-work.port';
import { StageSubscriptionRemindersService } from './stage-subscription-reminders.service';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export type BackfillSubscriptionRemindersInput = Readonly<{ cursor?: string; pageSize?: number }>;
export type BackfillSubscriptionRemindersResult = Readonly<{
  scanned: number;
  eligible: number;
  created: number;
  updated: number;
  suppressed: number;
  pastDueSkipped: number;
  stateSkipped: number;
  nextCursor: string | null;
  done: boolean;
}>;

@Injectable()
export class BackfillSubscriptionRemindersService {
  constructor(
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly stageReminders: StageSubscriptionRemindersService,
  ) {}

  public async runOnce(
    input: BackfillSubscriptionRemindersInput,
  ): Promise<BackfillSubscriptionRemindersResult> {
    const pageSize = this.pageSize(input.pageSize);
    const cursor = this.decodeCursor(input.cursor);
    const phase = cursor?.status ?? SubscriptionStatus.ACTIVE;
    const candidateNow = await this.unitOfWork.execute((context) => context.databaseNow());
    const candidates = await this.unitOfWork.execute((context) =>
      context.subscriptionReminderBackfill.findCandidatePage({
        status: phase,
        now: candidateNow,
        cursor,
        limit: pageSize + 1,
      }),
    );
    const page = candidates.slice(0, pageSize);
    const hasMore = candidates.length > pageSize;
    if (page.length === 0) {
      if (phase === SubscriptionStatus.ACTIVE) {
        return {
          scanned: 0,
          eligible: 0,
          created: 0,
          updated: 0,
          suppressed: 0,
          pastDueSkipped: 0,
          stateSkipped: 0,
          nextCursor: this.encodeCursor({
            status: SubscriptionStatus.QUEUED,
            endsAt: new Date(0),
            id: '00000000-0000-4000-8000-000000000000',
          }),
          done: false,
        };
      }
      return {
        scanned: 0,
        eligible: 0,
        created: 0,
        updated: 0,
        suppressed: 0,
        pastDueSkipped: 0,
        stateSkipped: 0,
        nextCursor: null,
        done: true,
      };
    }
    const last = page.at(-1)!;
    const staged = await this.unitOfWork.execute(async (context) => {
      const now = await context.databaseNow();
      await context.lockUsers(page.map((candidate) => candidate.userId));
      const periods = await context.subscriptionReminderBackfill.findAuthoritativePeriods({
        ids: page.map((candidate) => candidate.id),
        status: phase,
        now,
      });
      const result = await this.stageReminders.stageBatch(
        { periods, now },
        context.subscriptionReminders,
      );
      return { periods, result };
    });
    const nextCursor = hasMore
      ? this.encodeCursor({ status: phase, endsAt: last.endsAt, id: last.id })
      : phase === SubscriptionStatus.ACTIVE
        ? this.encodeCursor({
            status: SubscriptionStatus.QUEUED,
            endsAt: new Date(0),
            id: '00000000-0000-4000-8000-000000000000',
          })
        : null;
    return {
      scanned: page.length,
      eligible: staged.periods.length,
      ...staged.result,
      stateSkipped: page.length - staged.periods.length,
      nextCursor,
      done: nextCursor === null,
    };
  }

  private pageSize(value: number | undefined): number {
    if (value === undefined) return DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE)
      throw this.invalid('Invalid page size');
    return value;
  }
  private decodeCursor(value: string | undefined): SubscriptionReminderBackfillCursor | null {
    if (!value) return null;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      if (!this.isCursor(parsed)) throw new Error();
      return { status: parsed.status, endsAt: new Date(parsed.endsAt), id: parsed.id };
    } catch {
      throw this.invalid('Invalid reminder backfill cursor');
    }
  }
  private encodeCursor(cursor: SubscriptionReminderBackfillCursor): string {
    return Buffer.from(
      JSON.stringify({
        version: 1,
        status: cursor.status,
        endsAt: cursor.endsAt.toISOString(),
        id: cursor.id,
      }),
    ).toString('base64url');
  }
  private isCursor(value: unknown): value is {
    version: 1;
    status: SubscriptionStatus.ACTIVE | SubscriptionStatus.QUEUED;
    endsAt: string;
    id: string;
  } {
    if (!value || typeof value !== 'object') return false;
    const cursor = value as Record<string, unknown>;
    return (
      cursor.version === 1 &&
      (cursor.status === SubscriptionStatus.ACTIVE ||
        cursor.status === SubscriptionStatus.QUEUED) &&
      typeof cursor.endsAt === 'string' &&
      Number.isFinite(new Date(cursor.endsAt).getTime()) &&
      typeof cursor.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(cursor.id)
    );
  }
  private invalid(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.BadRequest, message });
  }
}
