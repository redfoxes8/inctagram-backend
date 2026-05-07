import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { type PingRequest, type PingResponse } from '../../../../../libs/contracts/src';

@Controller()
export class PostsController {
  private readonly logger = new Logger(PostsController.name);

  @GrpcMethod('PostService', 'Ping')
  ping(data: any): any {
    this.logger.log(`[Post MS] gRPC Ping получен: ${data.message}`);

    return {
      reply: `Pong от Post-MS! Получено: [${data.message}]`,
    };
  }
}
