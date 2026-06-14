import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiDomainError } from '../../../../../../libs/common/src';
import {
  GetFileStatusBatchRequestDto,
  GetFileStatusBatchResponseDto,
} from './dto/get-file-status-batch.dto';
import { IRpcAdapter } from '../domain/interfaces/rpc-adapter.interface';

@ApiTags('File')
@Controller('file')
export class FileController {
  constructor(private readonly rpcAdapter: IRpcAdapter) {}

  @Post('status-batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'get files status',
    description: 'Get status of files by file ids',
  })
  @ApiBody({ type: GetFileStatusBatchRequestDto })
  @ApiOkResponse({ description: 'Files status', type: GetFileStatusBatchResponseDto })
  @ApiDomainError(404, 'Files not found', 'Files not found')
  @ApiDomainError(503, 'File service unavailable', 'Service unavailable')
  async getFileStatusBatch(
    @Body() dto: GetFileStatusBatchRequestDto,
  ): Promise<GetFileStatusBatchResponseDto> {
    return await this.rpcAdapter.getFileStatusBatch(dto);
  }
}
