import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({
    description: 'Post description',
    example: 'My first Inctagram post',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiProperty({
    description: 'Uploaded file identifiers returned by File-MS',
    example: ['a9f5e3b1-1c4f-4f2c-8c89-7d4e9ad4d7b1'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  fileIds: string[];
}
