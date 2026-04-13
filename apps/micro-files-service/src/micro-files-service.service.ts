import { Injectable } from '@nestjs/common';

@Injectable()
export class MicroFilesServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
