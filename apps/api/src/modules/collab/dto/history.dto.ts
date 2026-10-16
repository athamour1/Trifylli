import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/** Το κοινό έγγραφο (π.χ. `symvoulio:<id>`). */
export class DocumentQueryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  document!: string;
}
