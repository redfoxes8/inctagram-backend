import {
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
import { GetCheckoutSessionStatusQuery } from '../application/queries/get-checkout-session-status.query';
import { CreateCheckoutSessionCommand } from '../application/commands/create-checkout-session.command';
import { CreateCheckoutSessionResponseDto } from './dto/create-checkout-session.response';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { ToggleAutoRenewDto } from './dto/toggle-auto-renew.dto';
import { GetCheckoutSessionStatusResponseDto } from './dto/get-checkout-session-status.response';
import { ApiDomainError } from '../../../../../../libs/common/src';
import { ToggleAutoRenewCommand } from '../application/commands/toggle-auto-renew.command';

import { Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { ProcessWebhookEventCommand } from '../application/commands/process-webhook-event.command';
import { ProcessWebhookEventResult } from '../application/commands/process-webhook-event.command';
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
    description: 'Returns paginated payment history with newest-first ordering.',
  })
  @ApiOkResponse({
    type: GetPaymentHistoryResponseDto,
    description: 'Paginated payment history',
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
  @ApiDomainError(409, 'Subscription cannot be toggled', 'Conflict')
  @ApiDomainError(503, 'Payment service unavailable', 'Service unavailable')
  @ApiDomainError(504, 'Payment provider timed out', 'Gateway Timeout')
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
  async stripeWebhook(@Req() req: RawBodyRequest<Request>): Promise<ProcessWebhookEventResult> {
    const signature = req.headers['stripe-signature'];

    if (typeof signature !== 'string') {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Stripe signature header is required',
      });
    }

    const rawBody = req.rawBody;

    if (!rawBody) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Webhook raw body is required',
      });
    }

    return this.commandBus.execute(
      new ProcessWebhookEventCommand({
        provider: 'STRIPE',
        rawBody,
        signatureHeaders: [{ name: 'stripe-signature', value: signature }],
        receivedAt: new Date().toISOString(),
      }),
    );
  }

  @Get('checkout/:checkoutSessionId/status')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get checkout session status',
    description:
      'Returns the local state of a verified webhook processing for a checkout session. ' +
      'This endpoint returns the payment service-local status and does not contact the provider API.',
  })
  @ApiOkResponse({
    type: GetCheckoutSessionStatusResponseDto,
    description: 'Checkout session status',
  })
  @ApiDomainError(400, 'Bad Request', 'Invalid checkout session ID')
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(404, 'Not Found', 'Checkout session not found or does not belong to the user')
  async getCheckoutSessionStatus(
    @Param('checkoutSessionId') checkoutSessionId: string,
    @CurrentUserId() userId: string,
  ): Promise<GetCheckoutSessionStatusResponseDto> {
    if (!isUUID(checkoutSessionId, '4')) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'checkoutSessionId must be a UUID v4',
      });
    }

    return this.queryBus.execute(
      new GetCheckoutSessionStatusQuery({
        userId,
        checkoutSessionId,
      }),
    );
  }

  // GET    /payments/history
  // GET    /payments/subscriptions
  // GET    /payments/checkout/:checkoutSessionId/status
  // POST   /payments/checkout
  // PATCH  /payments/subscriptions/:id/auto-renew
  //  POST   /payments/webhook/stripe
}
