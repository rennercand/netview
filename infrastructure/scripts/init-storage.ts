import { CreateBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { storageFromEnv } from "../../packages/storage/src/index.js";
if (process.env.NODE_ENV === "production")
  throw new Error(
    "Use a configuração privada do provedor em produção; este bootstrap é apenas local.",
  );
const storage = storageFromEnv(),
  Bucket = storage.config.bucket;
try {
  try {
    await storage.ready();
  } catch {
    await storage.client.send(new CreateBucketCommand({ Bucket }));
  }
  try {
    await storage.client.send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [
                process.env.APP_ORIGIN || "http://localhost:5173",
                "http://localhost:8080",
              ],
              AllowedMethods: ["PUT"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 300,
            },
          ],
        },
      }),
    );
  } catch (e) {
    if ((e as { name: string }).name !== "NotImplemented") throw e;
    console.log(
      "MinIO: CORS global configurado por MINIO_API_CORS_ALLOW_ORIGIN no Compose.",
    );
  }

  console.log(
    "Bucket privado inicializado. O worker limpa uploads expirados; configure lifecycle também no provedor de produção.",
  );
} finally {
  storage.close();
}
