import { PrismaClient as Client } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
export { Prisma } from "@prisma/client";
export class PrismaClient extends Client {
  constructor() {
    const url = process.env.DATABASE_URL;
    if (
      process.env.NODE_ENV === "production" &&
      (!url || new URL(url).searchParams.get("sslmode") !== "verify-full")
    )
      throw new Error(
        "DATABASE_URL de produção deve usar sslmode=verify-full.",
      );
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }
}
export const SESSION_SECONDS = 60 * 60 * 12;
