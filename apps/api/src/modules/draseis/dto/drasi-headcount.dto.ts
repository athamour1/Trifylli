import { ApiProperty } from '@nestjs/swagger';
import { DrasiGroupKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDate, IsEnum, IsString, IsUUID, MaxLength } from 'class-validator';

/** Νέα καταμέτρηση: τίτλος και ανά τι (ενωμοτία, σκηνή…). */
export class StartHeadcountDto {
  @ApiProperty({ example: 'Αναχώρηση από Μέγαρα' })
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ enum: DrasiGroupKind })
  @IsEnum(DrasiGroupKind)
  groupKind!: DrasiGroupKind;
}

/** Μια ομάδα μετρήθηκε: ποιοι λείπουν (κενό = όλοι εδώ) και πότε (ώρα της συσκευής). */
export class HeadcountCheckDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  absentIds!: string[];

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  checkedAt!: Date;
}

export class CloseHeadcountDto {
  @ApiProperty()
  @IsBoolean()
  closed!: boolean;
}
