import { Test, TestingModule } from '@nestjs/testing';
import path from 'path';
import { ConfigModule } from '@nestjs/config';
import { PostConfigModule } from '../src/core/post-config.module';

export async function createTestApp(
  moduleMetadata: any,
  envOverrides?: Record<string, string>,
): Promise<TestingModule> {
  // If explicit env overrides are provided, apply them temporarily for module compilation.
  const previous: Record<string, string | undefined> = {};
  if (envOverrides) {
    for (const [k, v] of Object.entries(envOverrides)) {
      previous[k] = process.env[k];
      process.env[k] = v;
    }
  }

  try {
    const testingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: [path.resolve(process.cwd(), 'apps/micro-post-service/.env.test')],
          ignoreEnvFile: process.env.NODE_ENV === 'production',
        }),
        PostConfigModule,
        ...(moduleMetadata.imports || []),
      ],
      providers: moduleMetadata.providers || [],
      controllers: moduleMetadata.controllers || [],
    }).compile();

    return testingModule;
  } finally {
    // restore previous env values
    if (envOverrides) {
      for (const k of Object.keys(envOverrides)) {
        if (previous[k] === undefined) delete process.env[k];
        else process.env[k] = previous[k]!;
      }
    }
  }
}
