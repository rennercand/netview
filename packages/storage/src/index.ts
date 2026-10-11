import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export interface StorageConfig {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}
export class PrivateStorage {
  readonly client: S3Client;
  readonly signer: S3Client;
  constructor(readonly config: StorageConfig) {
    const options = {
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED" as const,
      responseChecksumValidation: "WHEN_REQUIRED" as const,
    };
    this.client = new S3Client({ ...options, endpoint: config.endpoint });
    this.signer = new S3Client({ ...options, endpoint: config.publicEndpoint });
  }
  async ready() {
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.config.bucket }),
    );
  }
  async init(key: string) {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: "video/mp4",
      }),
    );
    if (!result.UploadId) throw new Error("Upload sem identificador");
    return result.UploadId;
  }
  async partUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    size?: number,
  ) {
    return getSignedUrl(
      this.signer,
      new UploadPartCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        ContentLength: size,
      }),
      {
        expiresIn: 300,
        ...(size ? { signableHeaders: new Set(["content-length"]) } : {}),
      },
    );
  }
  async parts(key: string, uploadId: string) {
    const parts: { partNumber: number; etag: string; size: number }[] = [];
    let marker: string | undefined;
    do {
      const r = await this.client.send(
        new ListPartsCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const p of r.Parts ?? [])
        if (p.PartNumber && p.ETag)
          parts.push({
            partNumber: p.PartNumber,
            etag: p.ETag,
            size: p.Size ?? 0,
          });
      marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }
  async complete(
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[],
  ) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }
  async abort(key: string, uploadId: string) {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.config.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
    } catch (e) {
      if ((e as { name: string }).name !== "NoSuchUpload") throw e;
    }
  }
  async head(key: string) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }
  async get(key: string, range?: string) {
    return this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Range: range,
      }),
    );
  }
  async playbackUrl(key: string) {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: 120 },
    );
  }
  async processingUrl(key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: 120 },
    );
  }
  async put(key: string, data: Buffer, mime: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: mime,
      }),
    );
  }
  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }
  close() {
    this.client.destroy();
    this.signer.destroy();
  }
}
export function storageFromEnv() {
  const requireValue = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} obrigatório`);
    return value;
  };
  return new PrivateStorage({
    endpoint: requireValue("S3_ENDPOINT"),
    publicEndpoint: requireValue("S3_PUBLIC_ENDPOINT"),
    region: process.env.S3_REGION || "auto",
    bucket: requireValue("S3_BUCKET"),
    accessKeyId: requireValue("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireValue("S3_SECRET_ACCESS_KEY"),
  });
}
