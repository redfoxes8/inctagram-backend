// /users/profile (получение и редактирование "био", загрузка аватара).

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ApiDomainError } from '../../../../../../libs/common/src';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../auth/api/decorators/current-user-id.decorator';
import { ConfirmAvatarCommand } from '../application/commands/confirm-avatar.command';
import { GetAvatarUploadUrlCommand } from '../application/commands/get-avatar-upload-url.command';
import { GetPublicProfileQuery } from '../application/queries/get-public-profile.query';
import { ConfirmAvatarRequestDto } from './dto/confirm-avatar-request.dto';
import { ConfirmAvatarResponseDto } from './dto/confirm-avatar-response.dto';
import { GetAvatarUploadUrlRequestDto } from './dto/get-avatar-upload-url-request.dto';
import { GetAvatarUploadUrlResponseDto } from './dto/get-avatar-upload-url-response.dto';
import { PublicProfileResponseDto } from './dto/public-profile-response.dto';

const logger = new Logger('ProfileController');

@ApiTags('Profile')
@Controller('profile')
export class ProfileController {
  constructor(
    @Inject(QueryBus) private readonly queryBus: QueryBus,
    @Inject(CommandBus) private readonly commandBus: CommandBus,
  ) {}

  @Get(':userId')
  @ApiOperation({
    summary: 'Get public profile',
    description: 'Retrieves public profile details of a user, along with the posts count.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User identifier',
    example: 'user-id',
  })
  @ApiOkResponse({
    description: 'Public profile retrieved successfully',
    type: PublicProfileResponseDto,
  })
  @ApiDomainError(404, 'User not found', 'User was not found')
  @ApiDomainError(503, 'Service unavailable', 'Service unavailable')
  public async getPublicProfile(@Param('userId') userId: string): Promise<PublicProfileResponseDto> {
    logger.debug(`Incoming request: userId=${userId}`);
    return this.queryBus.execute(new GetPublicProfileQuery(userId));
  }

  @Post('avatar/upload-url')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate signed upload URL for avatar',
    description:
      'Requests a signed upload URL from File-MS for the AVATAR file type. The ownerId is extracted from the JWT token.',
  })
  @ApiBody({ type: GetAvatarUploadUrlRequestDto })
  @ApiCreatedResponse({
    description: 'Signed upload URL generated successfully',
    type: GetAvatarUploadUrlResponseDto,
  })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(503, 'File service unavailable', 'Service unavailable')
  public async getAvatarUploadUrl(
    @CurrentUserId() userId: string,
    @Body() dto: GetAvatarUploadUrlRequestDto,
  ): Promise<GetAvatarUploadUrlResponseDto> {
    logger.debug(
      `[ProfileController] POST avatar/upload-url userId=${userId} fileSize=${dto.fileSize} fileExtension=${dto.fileExtension}`,
    );

    return this.commandBus.execute(
      new GetAvatarUploadUrlCommand({
        userId,
        fileSize: dto.fileSize,
        fileExtension: dto.fileExtension,
      }),
    );
  }

  @Put('avatar/confirm')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm avatar upload',
    description:
      'Validates the uploaded avatar file and saves avatarFileId and avatarUrl to the user profile.',
  })
  @ApiBody({ type: ConfirmAvatarRequestDto })
  @ApiOkResponse({
    description: 'Avatar confirmed successfully',
    type: ConfirmAvatarResponseDto,
  })
  @ApiDomainError(400, 'Validation error', 'Validation failed or file is not in UPLOADED status')
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(403, 'Forbidden', 'Forbidden')
  @ApiDomainError(503, 'File service unavailable', 'Service unavailable')
  public async confirmAvatar(
    @CurrentUserId() userId: string,
    @Body() dto: ConfirmAvatarRequestDto,
  ): Promise<ConfirmAvatarResponseDto> {
    logger.debug(
      `[ProfileController] PUT avatar/confirm userId=${userId} fileId=${dto.fileId}`,
    );

    return this.commandBus.execute(
      new ConfirmAvatarCommand({
        userId,
        fileId: dto.fileId,
      }),
    );
  }
}
