import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiDomainError } from '../../../../../../libs/common/src';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../auth/api/decorators/current-user-id.decorator';
import { GenerateUploadUrlCommand } from '../application/commands/generate-upload-url.command';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';
import { GenerateUploadUrlResponseDto } from './dto/generate-upload-url-response.dto';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(@Inject(CommandBus) private readonly commandBus: CommandBus) {}

  @Post('upload-url')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate signed upload URL',
    description: 'Requests a signed upload URL from File-MS. The ownerId is taken from JWT only.',
  })
  @ApiBody({ type: GenerateUploadUrlDto })
  @ApiOkResponse({
    description: 'Signed upload URL generated successfully',
    type: GenerateUploadUrlResponseDto,
  })
  @ApiDomainError(400, 'Validation error', 'Validation failed')
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(503, 'File service unavailable', 'Service unavailable')
  async generateUploadUrl(
    @Body() dto: GenerateUploadUrlDto,
    @CurrentUserId() ownerId: string,
  ): Promise<GenerateUploadUrlResponseDto> {
    return this.commandBus.execute(new GenerateUploadUrlCommand({ dto, ownerId }));
  }
}
