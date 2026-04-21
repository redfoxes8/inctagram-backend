import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

//localhost:3000/api/v1/prisma/prisma-test
@Controller('prisma')
export class PrismaTestController {
  constructor(private prisma: PrismaService) {}

  @Get('prisma-test')
  async prismaTest() {
    try {
      return await this.prisma.user.findMany();
    } catch (e) {
      console.log(e);
    }
  }
}
