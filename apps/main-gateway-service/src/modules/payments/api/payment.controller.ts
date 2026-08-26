import {
  Body,
  Controller,
  Get,
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
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGatewayTimeoutResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
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
import { ToggleAutoRenewCommand } from '../application/commands/toggle-auto-renew.command';
import { GetSubscriptionsResponseDto } from './dto/get-subscriptions.response';
import { ToggleAutoRenewResponseDto } from './dto/toggle-auto-renew.response';
import { PaymentApiErrorResponseDto } from './dto/payment-api-error.response';
import { ProcessWebhookEventResponseDto } from './dto/process-webhook-event.response';

import { Req } from '@nestjs/common';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { ProcessWebhookEventCommand } from '../application/commands/process-webhook-event.command';
import { ProcessWebhookEventResult } from '../application/commands/process-webhook-event.command';
import { GatewayConfig } from '../../../core/gateway.config';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

@ApiTags('Payments')
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
  @ApiBadRequestResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Pagination query validation failed.',
  })
  @ApiUnauthorizedResponse({ type: PaymentApiErrorResponseDto, description: 'Unauthorized.' })
  @ApiServiceUnavailableResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service request timed out.',
  })
  @ApiInternalServerErrorResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service returned an invalid or internal response.',
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
  @ApiOperation({
    summary: 'Get paid subscriptions',
    description: 'Returns the current subscription and ordered queued paid periods.',
  })
  @ApiOkResponse({
    type: GetSubscriptionsResponseDto,
    description: 'Current and queued subscriptions.',
  })
  @ApiUnauthorizedResponse({ type: PaymentApiErrorResponseDto, description: 'Unauthorized.' })
  @ApiServiceUnavailableResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service request timed out.',
  })
  @ApiInternalServerErrorResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service returned an invalid or internal response.',
  })
  async getSubscriptions(@CurrentUserId() userId: string): Promise<GetSubscriptionsResponseDto> {
    return this.queryBus.execute(new GetSubscriptionsQuery({ userId }));
  }

  @Post('checkout')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create checkout session',
    description:
      'Creates or idempotently retrieves a provider-hosted checkout for an active product.',
  })
  @ApiCreatedResponse({
    type: CreateCheckoutSessionResponseDto,
    description: 'Checkout session created or recovered.',
  })
  @ApiBody({
    type: CreateCheckoutSessionDto,
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
    description:
      'Client-generated UUID v4. Reuse it only when retrying the same logical checkout request.',
  })
  @ApiBadRequestResponse({
    type: PaymentApiErrorResponseDto,
    description:
      'Request validation failed, provider is unsupported, or provider rejected the request (reason PROVIDER_REJECTED).',
  })
  @ApiUnauthorizedResponse({ type: PaymentApiErrorResponseDto, description: 'Unauthorized.' })
  @ApiNotFoundResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Active product or provider billing configuration was not found.',
  })
  @ApiConflictResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Idempotency or paid-subscription state conflicts with the request.',
  })
  @ApiServiceUnavailableResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment provider or payment service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment provider or payment service timed out.',
  })
  @ApiInternalServerErrorResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment provider configuration or response is invalid.',
  })
  async createCheckoutSession(
    @CurrentUserId() userId: string,
    @Body() dto: CreateCheckoutSessionDto,
    @Req() request: Request,
  ): Promise<CreateCheckoutSessionResponseDto> {
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || !isUUID(idempotencyKey, '4')) {
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
    type: ToggleAutoRenewResponseDto,
    description: 'Auto renew updated successfully',
  })
  @ApiParam({
    name: 'subscriptionId',
    type: String,
    format: 'uuid',
    required: true,
    description: 'Subscription identifier.',
  })
  @ApiBadRequestResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Request or subscription identifier validation failed.',
  })
  @ApiUnauthorizedResponse({ type: PaymentApiErrorResponseDto, description: 'Unauthorized.' })
  @ApiNotFoundResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Subscription was not found.',
  })
  @ApiConflictResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Subscription state cannot be toggled or requires reconciliation.',
  })
  @ApiServiceUnavailableResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment provider state or payment service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment provider or payment service timed out.',
  })
  @ApiInternalServerErrorResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment provider or payment service returned an internal error.',
  })
  async toggleAutoRenew(
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: ToggleAutoRenewDto,
    @CurrentUserId() userId: string,
  ): Promise<ToggleAutoRenewResponseDto> {
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
  @ApiOperation({
    summary: 'Receive Stripe webhook',
    description:
      'Accepts a Stripe webhook using the exact raw request bytes for signature verification.',
  })
  @ApiHeader({
    name: 'Stripe-Signature',
    required: true,
    schema: { type: 'string' },
    description: 'Stripe webhook signature for the exact raw request body.',
  })
  @ApiBody({
    description: 'Stripe JSON webhook payload. Signature verification uses its exact raw bytes.',
    schema: { type: 'object', additionalProperties: true },
  })
  @ApiOkResponse({
    type: ProcessWebhookEventResponseDto,
    description: 'Verified event accepted, processed, ignored, or recognized as a duplicate.',
  })
  @ApiBadRequestResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Signature/raw body is missing or webhook signature is invalid.',
  })
  @ApiServiceUnavailableResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Webhook is already processing or requires a retryable later delivery.',
  })
  @ApiInternalServerErrorResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Webhook processing returned a sanitized internal error.',
  })
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
  @ApiParam({
    name: 'checkoutSessionId',
    type: String,
    format: 'uuid',
    required: true,
    description: 'Local checkout session identifier.',
  })
  @ApiBadRequestResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Checkout session identifier is not a UUID v4.',
  })
  @ApiUnauthorizedResponse({ type: PaymentApiErrorResponseDto, description: 'Unauthorized.' })
  @ApiNotFoundResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Checkout session was not found or does not belong to the user.',
  })
  @ApiServiceUnavailableResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service is unavailable.',
  })
  @ApiGatewayTimeoutResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service request timed out.',
  })
  @ApiInternalServerErrorResponse({
    type: PaymentApiErrorResponseDto,
    description: 'Payment service returned an invalid or internal response.',
  })
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
