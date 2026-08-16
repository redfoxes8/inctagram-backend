import { ICommand } from '@nestjs/cqrs';
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';

import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { CreateCheckoutSessionResponseDto } from '../../api/dto/create-checkout-session.response';
import { PaymentProviderCode } from '../types/payment-provider-code.type';

export type CreateCheckoutSessionCommandDto = {
  userId: string;
  productId: string;
  provider: PaymentProviderCode;
  autoRenewConsent: true;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string | null;
};

export class CreateCheckoutSessionCommand implements ICommand {
  constructor(public readonly dto: CreateCheckoutSessionCommandDto) {}
}

@CommandHandler(CreateCheckoutSessionCommand)
export class CreateCheckoutSessionHandler implements ICommandHandler<CreateCheckoutSessionCommand> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(command: CreateCheckoutSessionCommand): Promise<CreateCheckoutSessionResponseDto> {
    return this.paymentAdapter.createCheckoutSession(command.dto);
  }
}
