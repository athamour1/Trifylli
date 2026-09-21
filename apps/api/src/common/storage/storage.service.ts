import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import { AppConfigToken } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

/**
 * Λεπτό wrapper πάνω στο S3 (Garage/MinIO/AWS). Η πρόσβαση γίνεται **πάντα**
 * μέσω του backend — ο client δεν βλέπει ποτέ το bucket ούτε credentials.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(@Inject(AppConfigToken) config: AppConfig) {
    this.bucket = config.S3_BUCKET;
    if (config.S3_ENDPOINT && config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY) {
      this.client = new S3Client({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        credentials: {
          accessKeyId: config.S3_ACCESS_KEY_ID,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        },
      });
    } else {
      this.client = null;
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  private require(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException('Η αποθήκευση αρχείων δεν έχει ρυθμιστεί.');
    }
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.require().send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getStream(key: string): Promise<{ stream: Readable; contentLength?: number }> {
    const out = await this.require().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return { stream: out.Body as Readable, contentLength: out.ContentLength };
  }

  async delete(key: string): Promise<void> {
    await this.require().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
