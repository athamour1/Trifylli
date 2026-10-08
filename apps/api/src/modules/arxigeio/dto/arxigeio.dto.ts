import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsEnum } from 'class-validator';
import { KladosDuty } from '@trifylli/shared';

/** Οι υπευθυνότητες ενός στελέχους (αντικατάσταση) — κενό ⇒ καμία. */
export class SetDutiesDto {
  @ApiProperty({ enum: KladosDuty, isArray: true })
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(KladosDuty, { each: true })
  duties!: KladosDuty[];
}
