import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { GetAvailableProductsResponseDto } from '../../api/dto/get-available-products.response';
import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';

export class GetAvailableProductsQuery extends Query<GetAvailableProductsResponseDto> {}

@QueryHandler(GetAvailableProductsQuery)
export class GetAvailableProductsHandler implements IQueryHandler<
  GetAvailableProductsQuery,
  GetAvailableProductsResponseDto
> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  public execute(): Promise<GetAvailableProductsResponseDto> {
    return this.paymentAdapter.getAvailableProducts();
  }
}
