import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

/** Ένα είδος ειδοποίησης ανοιχτό ή κλειστό. */
export class NotificationSettingDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

class PushKeysDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  auth!: string;
}

/** Η συσκευή όπως τη δίνει ο browser (`PushSubscription.toJSON()`). */
export class PushSubscriptionDto {
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_tld: false })
  @MaxLength(1000)
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

/** Ποια συσκευή δεν θέλει πια push. */
export class PushEndpointDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  endpoint!: string;
}
