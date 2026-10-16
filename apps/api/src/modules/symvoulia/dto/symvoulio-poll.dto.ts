import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { POLL_LIMITS } from '@trifylli/shared';

/** Νέα ψηφοφορία: ερώτηση, επιλογές (κενό = Ναι/Όχι/Αποχή), επώνυμη ή μυστική. */
export class OpenPollDto {
  @ApiProperty()
  @IsString()
  @MaxLength(POLL_LIMITS.question)
  question!: string;

  @ApiPropertyOptional({ type: [String], description: 'Κενό = «Ναι / Όχι / Αποχή»' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POLL_LIMITS.options)
  @IsString({ each: true })
  @MaxLength(POLL_LIMITS.option, { each: true })
  options?: string[];

  @ApiPropertyOptional({ description: 'Μυστική: φαίνεται ποιος ψήφισε, όχι τι' })
  @IsOptional()
  @IsBoolean()
  secret?: boolean;
}

export class PollVoteDto {
  @ApiProperty({ description: 'Η θέση της επιλογής' })
  @IsInt()
  @Min(0)
  choice!: number;
}
