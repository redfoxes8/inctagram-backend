import { ICommand } from '@nestjs/cqrs';
import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';

import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { CreateCheckoutSessionDto } from '../../api/dto/create-checkout-session.dto';

export type CreateCheckoutSessionCommandDto = {
  userId: string;
  dto: CreateCheckoutSessionDto;

  successUrl: string;
  cancelUrl: string;
};

export class CreateCheckoutSessionCommand implements ICommand {
  constructor(public readonly dto: CreateCheckoutSessionCommandDto) {}
}

@CommandHandler(CreateCheckoutSessionCommand)
export class CreateCheckoutSessionHandler implements ICommandHandler<CreateCheckoutSessionCommand> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(command: CreateCheckoutSessionCommand) {
    return this.paymentAdapter.createCheckoutSession(command.dto);
  }
}
