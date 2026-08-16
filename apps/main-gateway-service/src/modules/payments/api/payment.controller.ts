import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../auth/api/decorators/current-user-id.decorator';
import { GetPaymentHistoryQueryParams } from './dto/get-payment-history.query-params';
import { GetPaymentHistoryQuery } from '../application/queries/get-payment-history.query';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetPaymentHistoryResponseDto } from './dto/get-payment-history.response';
import { GetSubscriptionsQuery } from '../application/queries/get-subscriptions.query';
import { CreateCheckoutSessionCommand } from '../application/commands/create-checkout-session.command';
import { CreateCheckoutSessionResponseDto } from './dto/create-checkout-session.response';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { ToggleAutoRenewDto } from './dto/toggle-auto-renew.dto';
import { ApiDomainError } from '../../../../../../libs/common/src';
import { ToggleAutoRenewCommand } from '../application/commands/toggle-auto-renew.command';

import { Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { ProcessWebhookEventCommand } from '../application/commands/process-webhook-event.command';
import { GrpcErrorMapper } from '../../../../../../libs/common/src/grpc/grpc-error.mapper';
import { GatewayConfig } from '../../../core/gateway.config';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly gatewayConfig: GatewayConfig,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get('history')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get payment history',
  })
  @ApiOkResponse({
    type: GetPaymentHistoryResponseDto,
  })
  async getPaymentHistory(
    @CurrentUserId() userId: string,
    @Query() query: GetPaymentHistoryQueryParams,
  ): Promise<GetPaymentHistoryResponseDto> {
    return this.queryBus.execute(
      new GetPaymentHistoryQuery({
        userId,
        page: query.pageNumber,
        pageSize: query.pageSize,
      }),
    );
  }

  @Get('subscriptions')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getSubscriptions(@CurrentUserId() userId: string) {
    return this.queryBus.execute(new GetSubscriptionsQuery({ userId }));
  }

  @Post('checkout')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create checkout session',
  })
  @ApiCreatedResponse({
    type: CreateCheckoutSessionResponseDto,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID reused for retries of the same logical checkout request.',
  })
  async createCheckoutSession(
    @CurrentUserId() userId: string,
    @Body() dto: CreateCheckoutSessionDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<CreateCheckoutSessionResponseDto> {
    if (!isUUID(idempotencyKey, '4')) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Idempotency-Key must be a UUID v4',
      });
    }
    return this.commandBus.execute(
      new CreateCheckoutSessionCommand({
        userId,
        productId: dto.productId,
        provider: dto.provider,
        autoRenewConsent: dto.autoRenewConsent,
        successUrl: this.gatewayConfig.successPaymentUrl,
        cancelUrl: this.gatewayConfig.cancelPaymentUrl,
        idempotencyKey,
      }),
    );
  }

  @Patch('subscriptions/:subscriptionId/auto-renew')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Toggle auto renew',
    description: 'Enables or disables subscription auto renewal.',
  })
  @ApiBody({
    type: ToggleAutoRenewDto,
  })
  @ApiOkResponse({
    description: 'Auto renew updated successfully',
  })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(404, 'Subscription not found', 'Not Found')
  @ApiDomainError(503, 'Payment service unavailable', 'Service unavailable')
  async toggleAutoRenew(
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: ToggleAutoRenewDto,
    @CurrentUserId() userId: string,
  ) {
    return this.commandBus.execute(
      new ToggleAutoRenewCommand({
        userId,
        subscriptionId,
        enabled: dto.enabled,
      }),
    );
  }

  @Post('webhook/stripe')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<void> {
    const signature = req.headers['stripe-signature'];

    if (typeof signature !== 'string') {
      throw new BadRequestException('Missing Stripe signature');
    }

    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    // TODO(P-013.2):
    // When Payment MS introduces DuplicateWebhookEventException,
    // map that specific exception to HTTP 200 OK.
    // Stripe retries every non-2xx response, therefore duplicate
    // webhook deliveries must be acknowledged successfully.

    try {
      await this.commandBus.execute(
        new ProcessWebhookEventCommand({
          provider: 'STRIPE',
          rawBody,
          signatureHeaders: [{ name: 'stripe-signature', value: signature }],
          receivedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      // Duplicate webhook deliveries are reported by Payment MS
      // as DomainExceptionCode.Conflict (gRPC ALREADY_EXISTS).
      // Stripe expects HTTP 2xx for already processed events.
      if (GrpcErrorMapper.isConflict(error)) {
        return;
      }

      throw error;
    }

    return;
  }

  // GET    /payments/history
  // GET    /payments/subscriptions
  // POST   /payments/checkout
  // PATCH  /payments/subscriptions/:id/auto-renew
  //  POST   /payments/webhook/stripe
}
