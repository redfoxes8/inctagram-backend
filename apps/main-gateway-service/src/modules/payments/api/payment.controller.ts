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
  ApiBody,
  ApiCreatedResponse,
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

@Controller('payments')
export class PaymentController {
  constructor(
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
        query,
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
  async createCheckoutSession(
    @CurrentUserId() userId: string,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<CreateCheckoutSessionResponseDto> {
    return this.commandBus.execute(
      new CreateCheckoutSessionCommand({
        userId,
        dto,
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
        dto,
      }),
    );
  }

  // GET    /payments/history
  // GET    /payments/subscriptions
  // POST   /payments/checkout
  // PATCH  /payments/subscriptions/:id/auto-renew
  //  POST   /payments/webhook/stripe
}
