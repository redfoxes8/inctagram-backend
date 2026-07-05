import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'Username',
    example: 'barbiturate23',
  })
  @IsNotEmpty({ message: 'Username value is required' })
  @IsString({ message: 'Username value must be a string' })
  @MinLength(6, { message: 'Username length must be more then 6' })
  @MaxLength(30, { message: 'Username length must be less then 30' })
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Username can contain only Latin letters, numbers, underscores and hyphens',
  })
  username: string;

  @ApiProperty({
    description: 'First name',
    example: 'Alex',
  })
  @IsNotEmpty({ message: 'firstName value is required' })
  @IsString({ message: 'firstName value must be a string' })
  @MinLength(1, { message: 'firstName length must be more then 2' })
  @MaxLength(50, { message: 'firstName length must be less then 50' })
  @Matches(/^[A-Za-zА-Яа-яЁё]+$/, {
    message: 'firstName value can contain only Latin and Cyrillic letters',
  })
  firstName: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Obama',
  })
  @IsNotEmpty({ message: 'lastName value is required' })
  @IsString({ message: 'lastName value must be a string' })
  @MinLength(1, { message: 'lastName length must be more then 2' })
  @MaxLength(50, { message: 'lastName length must be less then 50' })
  @Matches(/^[A-Za-zА-Яа-яЁё]+$/, {
    message: 'lastName value can contain only Latin and Cyrillic letters',
  })
  lastName: string;

  @ApiPropertyOptional({
    description: 'Date of birth',
    example: '2026-07-04T12:30:00Z',
  })
  @IsOptional()
  @IsString({ message: 'dateOfBirth value must be a string' })
  @Matches(/^(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[0-2])\.\d{4}$/, {
    message: 'dateOfBirth must be in format dd.MM.yyyy',
  })
  dateOfBirth: string | null;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'Belarus',
  })
  @IsOptional()
  @IsString({ message: 'Country value must be a string' })
  @MinLength(2, { message: 'Last name length must be more then 2' })
  @MaxLength(20, { message: 'Last name length must be less then 20' })
  country: string | null;

  @ApiPropertyOptional({
    description: 'City',
    example: 'Minsk',
  })
  @IsOptional()
  @IsString({ message: 'City value must be a string' })
  @MinLength(2, { message: 'City length must be more then 2' })
  @MaxLength(50, { message: 'City length must be less then 50' })
  city: string | null;

  @ApiPropertyOptional({
    description: 'Info about user',
    example: 'Chill guy',
  })
  @IsOptional()
  @IsString({ message: 'AboutMe value must be a string' })
  @MinLength(10, { message: 'AboutMe length must be more then 10' })
  @MaxLength(200, { message: 'AboutMe length must be less then 200' })
  @Matches(/^[A-Za-zА-Яа-яЁё0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]+$/, {
    message: 'aboutMe can contain only letters, numbers and special symbols',
  })
  aboutMe: string | null;
}
