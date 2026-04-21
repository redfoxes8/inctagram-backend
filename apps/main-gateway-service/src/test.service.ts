import { Injectable } from '@nestjs/common';
import { PrismaService } from './infrastructure/prisma/config/prisma.service';

@Injectable()
export class TestService {
  constructor(public prisma: PrismaService) {}
  async someFoo() {
    try {
      return await this.prisma.user.findMany();
    } catch (e) {
      console.log(e);
    }
  }
}
