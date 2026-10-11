import { PrismaClient } from "../../packages/database/src/index.js";
import { hashPassword } from "../../packages/auth/src/index.js";
import { requestSchema } from "../../packages/shared/src/index.js";
const data = requestSchema.parse({
  email: process.env.ADMIN_EMAIL,
  name: process.env.ADMIN_NAME || "Administrador",
  password: process.env.ADMIN_PASSWORD,
});
const db = new PrismaClient();
try {
  if (await db.user.findUnique({ where: { email: data.email } }))
    throw new Error("Email existente; este comando não redefine senhas.");
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash: await hashPassword(data.password),
        isAdmin: true,
        status: "ACTIVE",
      },
    });
    await tx.household.create({
      data: {
        name: process.env.HOUSEHOLD_NAME || "Minha família",
        ownerId: user.id,
        memberships: {
          create: { userId: user.id, role: "HOST", allowUpload: true },
        },
      },
    });
  });
  console.log(
    "Administrador e grupo criados. Nenhuma credencial foi registrada.",
  );
} finally {
  await db.$disconnect();
}
