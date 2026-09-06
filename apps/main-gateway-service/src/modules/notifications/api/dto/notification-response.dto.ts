import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const NOTIFICATION_TYPES = [
  'SUBSCRIPTION_ACTIVATED',
  'SUBSCRIPTION_EXTENDED',
  'UPCOMING_PAYMENT',
  'SUBSCRIPTION_EXPIRING',
  'PAYMENT_FAILED',
  'PAYMENT_RECOVERED',
  'SUBSCRIPTION_CANCELLED',
] as const;

export class NotificationItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: NOTIFICATION_TYPES })
  type: (typeof NOTIFICATION_TYPES)[number];

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  subscriptionId?: string;

  @ApiPropertyOptional({ nullable: true })
  providerInvoiceId?: string;

  @ApiProperty({ format: 'date-time' })
  effectiveAt: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  subscriptionEndsAt?: string;

  @ApiPropertyOptional({ nullable: true })
  reasonCode?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  seenAt?: string;
}

export class GetNotificationsResponseDto {
  @ApiProperty({ type: [NotificationItemResponseDto] })
  items: NotificationItemResponseDto[];

  @ApiPropertyOptional({ description: 'Opaque cursor for the next page.' })
  nextCursor?: string;
}

export class UnseenNotificationCountResponseDto {
  @ApiProperty({ minimum: 0, example: 0 })
  unseenCount: number;
}

export class MarkNotificationsSeenResponseDto extends UnseenNotificationCountResponseDto {
  @ApiProperty({ format: 'date-time' })
  seenThrough: string;
}

export class NotificationApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Notification cursor is invalid' })
  message: string;
}
