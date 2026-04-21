import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/config/prisma.service';

//localhost:3000/api/v1/prisma/prismaTest
@Controller('prisma')
export class PrismaTestController {
  constructor(private prisma: PrismaService) {}

  @Get('prismaTest')
  async prismaTest() {
    try {
      return await this.prisma.user.findMany();
    } catch (e) {
      console.log(e);
    }
  }
}
