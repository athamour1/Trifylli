import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Νέο εξωτερικό στέλεχος για μια δράση — παίρνει email ορισμού κωδικού. */
export class CreateDrasiExternalDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ description: 'Από πού έρχεται, π.χ. «Τοπικό Καλαμάτας».' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  origin?: string;
}
