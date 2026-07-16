import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  UseGuards,
  Request,
  ParseUUIDPipe,
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
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { ApiDomainError } from '../../../../../../libs/common/src';
import { GetProfileQuery } from '../application/queries/get-profile.query';
import { GetProfileResponseDto } from './dto/get-profile.dto';
import type { IAuthRequestInfo } from '../../../common/interfaces/auth-request-info.interface';
import { UpdateProfileCommand } from '../application/use-cases/update-profile.use-case';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUserId } from '../../auth/api/decorators/current-user-id.decorator';
import { ConfirmAvatarCommand } from '../application/commands/confirm-avatar.command';
import { GetAvatarUploadUrlCommand } from '../application/commands/get-avatar-upload-url.command';
import { ConfirmAvatarRequestDto } from './dto/confirm-avatar-request.dto';
import { ConfirmAvatarResponseDto } from './dto/confirm-avatar-response.dto';
import { GetAvatarUploadUrlRequestDto } from './dto/get-avatar-upload-url-request.dto';
import { GetAvatarUploadUrlResponseDto } from './dto/get-avatar-upload-url-response.dto';
import { DeleteAvatarCommand } from '../application/commands/delete-avatar.command';

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
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @ApiOkResponse({
    description: 'Public profile retrieved successfully',
    type: GetProfileResponseDto,
  })
  @ApiDomainError(404, 'Profile not found', 'Profile was not found')
  @ApiDomainError(503, 'Service unavailable', 'Service unavailable')
  public async getProfile(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<GetProfileResponseDto> {
    logger.debug(`Incoming request: userId=${userId}`);
    return this.queryBus.execute(new GetProfileQuery(userId));
  }

  @Put('update')
  @HttpCode(204)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update profile info',
    description: 'Update whole profile info with received data',
  })
  @ApiParam({
    name: 'userId',
    description: 'User identifier',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @ApiNoContentResponse({
    description: 'Profile updated successfully',
  })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(404, 'User profile not found', 'User profile not found')
  @ApiDomainError(400, 'Provided username already taken', 'Username already taken')
  public async updateProfile(
    @Request() req: IAuthRequestInfo,
    @Body() dto: UpdateProfileDto,
  ): Promise<void> {
    const userId: string = req.user.userId;
    logger.debug(`Incoming request: userId=${userId}`);
    await this.commandBus.execute(new UpdateProfileCommand(dto, userId));
    return;
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
  @ApiDomainError(404, 'Profile not found', 'Profile not found')
  public async confirmAvatar(
    @CurrentUserId() userId: string,
    @Body() dto: ConfirmAvatarRequestDto,
  ): Promise<ConfirmAvatarResponseDto> {
    logger.debug(`[ProfileController] PUT avatar/confirm userId=${userId} fileId=${dto.fileId}`);

    return this.commandBus.execute(
      new ConfirmAvatarCommand({
        userId,
        fileId: dto.fileId,
      }),
    );
  }

  @Delete('avatar')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete profile avatar',
    description: 'Deletes user profile avatar and triggers S3 file deletion.',
  })
  @ApiNoContentResponse({
    description: 'Avatar deleted successfully',
  })
  @ApiDomainError(401, 'Unauthorized', 'Unauthorized')
  @ApiDomainError(404, 'Profile not found', 'Profile not found')
  public async deleteAvatar(@CurrentUserId() userId: string): Promise<void> {
    logger.debug(`[ProfileController] DELETE avatar userId=${userId}`);
    await this.commandBus.execute(
      new DeleteAvatarCommand({
        userId,
      }),
    );
  }
}
