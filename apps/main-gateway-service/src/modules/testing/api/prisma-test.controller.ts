import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';

//localhost:3000/api/v1/prisma/prisma-test
@ApiTags('Testing')
@Controller('prisma')
export class PrismaTestController {
  constructor(private prisma: PrismaService) {}

  @Get('prisma-test')
  @ApiOperation({ summary: 'Get all users from DB (Test)', description: 'Returns a raw list of all users from the Prisma database. Only for testing purposes.' })
  @ApiOkResponse({ description: 'List of users retrieved directly from the database' })
  async prismaTest() {
    try {
      return await this.prisma.user.findMany();
    } catch (e) {
      console.log(e);
    }
  }
}
