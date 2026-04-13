import { NestFactory } from '@nestjs/core';
import { MicroFilesServiceModule } from './micro-files-service.module';

async function bootstrap() {
  const app = await NestFactory.create(MicroFilesServiceModule);
  await app.listen(process.env.port ?? 3001);
}
bootstrap();
