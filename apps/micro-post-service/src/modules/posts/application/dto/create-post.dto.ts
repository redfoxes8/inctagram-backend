import { IsArray, IsNotEmpty, IsString, MaxLength, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Transform, plainToInstance } from 'class-transformer';

export class PostImageDto {
  @IsString()
  @IsNotEmpty()
  fileId: string;
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  ownerId: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Transform(({ value }) => {
    // РУЧНАЯ ГИДРАТАЦИЯ (как требовал USER)
    if (Array.isArray(value)) {
      return value.map(item => plainToInstance(PostImageDto, item));
    }
    return value;
  })
  images: PostImageDto[];
}
