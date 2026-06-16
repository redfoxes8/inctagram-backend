import {
  BaseDomainEntity,
  BaseDomainEntityProps,
} from '../../../../../../libs/common/src/domain/base.domain.entity';

import { FileStatusDomain, FileTypeDomain } from './file.types';
import { randomUUID } from 'crypto';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

type FileEntityProps = BaseDomainEntityProps & {
  s3Key: string | null;
  bucket: string | null;
  fileExtension: string;
  status: FileStatusDomain;
  userId: string;
  fileType: FileTypeDomain;
  region: string;
  size: number;
};

export type CreateNewFileDTO = {
  fileExtension: string;
  userId: string;
  fileType: FileTypeDomain;
  region: string;
  size: number;
};

export class FileEntity extends BaseDomainEntity {
  private s3Key: string | null;
  private bucket: string | null;
  private readonly extension: string;
  private status: FileStatusDomain;
  private readonly userId: string;
  private readonly type: FileTypeDomain;
  private readonly region: string;
  private readonly size: number;

  constructor(data: FileEntityProps) {
    super(data);
    this.s3Key = data.s3Key;
    this.bucket = data.bucket;
    this.extension = data.fileExtension;
    this.status = data.status;
    this.userId = data.userId;
    this.type = data.fileType;
    this.region = data.region;
    this.size = data.size;
  }

  public static createNew(dto: CreateNewFileDTO) {
    return new this({
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      s3Key: null,
      bucket: null,
      fileExtension: dto.fileExtension,
      status: FileStatusDomain.PENDING,
      userId: dto.userId,
      fileType: dto.fileType,
      region: dto.region,
      size: dto.size,
    });
  }

  public setS3Props(s3Key: string, bucket: string): void {
    this.s3Key = s3Key;
    this.bucket = bucket;
  }

  public updateStatus(status: FileStatusDomain): void {
    if (status == FileStatusDomain.PENDING && this.status == FileStatusDomain.UPLOADED) {
      throw new DomainException({
        message: 'Trying to update file status to PENDING when it is already UPLOADED',
        code: DomainExceptionCode.Conflict,
      });
    }
    this.status = status;
  }

  public getS3Key(): string {
    if (!this.s3Key) {
      throw new DomainException({
        message: 'S3 key is not set',
        code: DomainExceptionCode.Conflict,
      });
    }
    return this.s3Key;
  }

  public getBucket(): string {
    if (!this.bucket) {
      throw new DomainException({
        message: 'Bucket is not set',
        code: DomainExceptionCode.Conflict,
      });
    }
    return this.bucket;
  }

  public getFileExtension(): string {
    return this.extension;
  }

  public getStatus(): FileStatusDomain {
    return this.status;
  }

  public getUserId(): string {
    return this.userId;
  }

  public getFileType(): FileTypeDomain {
    return this.type;
  }

  public getRegion(): string {
    return this.region;
  }

  public getSize(): number {
    return this.size;
  }
}
