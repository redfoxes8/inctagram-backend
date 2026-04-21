import { TestService } from './test.service';
import { Controller, Get } from '@nestjs/common';

@Controller('prisma')
export class TestController {
  constructor(private testService: TestService) {}

  @Get('prismaTest')
  async prismaTest() {
    return await this.testService.someFoo();
  }
}
