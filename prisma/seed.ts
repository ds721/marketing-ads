import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

// Demo data for local development: two tenants owned by different users, so
// tenant isolation can be exercised by hand as well as by the test suite.

const db = new PrismaClient();

async function main() {
  const password = await hash("password123", 12);

  const [priya, raj] = await Promise.all([
    db.user.upsert({
      where: { email: "priya@example.com" },
      update: {},
      create: { email: "priya@example.com", name: "Priya", passwordHash: password, emailVerified: new Date() },
    }),
    db.user.upsert({
      where: { email: "raj@example.com" },
      update: {},
      create: { email: "raj@example.com", name: "Raj", passwordHash: password, emailVerified: new Date() },
    }),
  ]);

  await db.user.upsert({
    where: { email: "admin@example.com" },
    update: { isPlatformAdmin: true },
    create: {
      email: "admin@example.com",
      name: "Platform admin",
      passwordHash: password,
      emailVerified: new Date(),
      isPlatformAdmin: true,
    },
  });

  const salon = await db.tenant.upsert({
    where: { slug: "glow-salon" },
    update: {},
    create: {
      slug: "glow-salon",
      name: "Glow Salon",
      planId: "growth",
      members: { create: { userId: priya.id, role: "OWNER" } },
      businessProfile: {
        create: {
          category: "Salon",
          city: "Chennai",
          phone: "+91 98400 12345",
          address: "12 Anna Nagar Main Road",
          aboutRaw:
            "We are a women's salon in Anna Nagar, Chennai. We do haircuts, colouring, facials and hair spa treatments. Most of our customers are working women and mothers who come back every month.",
          postingFrequency: "3_per_week",
          onboardedAt: new Date(),
        },
      },
      brandSettings: {
        create: {
          toneOfVoice: "Premium & elegant",
          brandDescription: "An elegant neighbourhood salon where regulars feel looked after.",
          wordsToUse: ["glow", "pamper", "expert", "care"],
          wordsToAvoid: ["cheap", "discount blast"],
          ctaPreference: "Book on WhatsApp",
          primaryColor: "#B5478A",
          secondaryColor: "#2E2447",
          accentColor: "#F5A31C",
        },
      },
      automation: { create: { level: "ASSISTED", autoSchedule: true, maxPostsPerWeek: 4 } },
      subscription: { create: { planId: "growth", status: "ACTIVE" } },
      products: {
        create: [
          { kind: "SERVICE", name: "Hair spa treatment", price: 1200, category: "Hair care" },
          { kind: "SERVICE", name: "Haircut & styling", price: 700, category: "Hair care" },
          { kind: "SERVICE", name: "Gold facial", price: 1500, category: "Skin" },
          { kind: "SERVICE", name: "Hair colouring", price: 2500, category: "Hair care" },
        ],
      },
      audiences: {
        create: {
          description:
            "Women aged 25–45 living or working within 5 km. Working professionals and mothers who value quality and trust their stylist.",
          location: "Anna Nagar + 5 km",
          ageRange: "25-45",
        },
      },
      goals: {
        create: [
          {
            label: "Increase bookings",
            metric: "bookings",
            targetNumber: 30,
            currentNumber: 18,
            month: new Date().toISOString().slice(0, 7),
          },
        ],
      },
    },
  });

  const restaurant = await db.tenant.upsert({
    where: { slug: "spice-house" },
    update: {},
    create: {
      slug: "spice-house",
      name: "Spice House",
      planId: "starter",
      members: { create: { userId: raj.id, role: "OWNER" } },
      businessProfile: {
        create: {
          category: "Restaurant",
          city: "Chennai",
          phone: "+91 98410 55555",
          address: "45 T Nagar High Road",
          aboutRaw:
            "Family-run South Indian restaurant in T Nagar. Famous for our Sunday biryani, dosas and filter coffee. Families and office workers eat with us every day.",
          postingFrequency: "daily",
          onboardedAt: new Date(),
        },
      },
      brandSettings: {
        create: {
          toneOfVoice: "Friendly & local",
          brandDescription: "A warm, family-run restaurant known for biryani worth the queue.",
          ctaPreference: "Order now",
          primaryColor: "#E8492E",
          secondaryColor: "#2E2447",
          accentColor: "#F5A31C",
        },
      },
      automation: { create: { level: "MANUAL", maxPostsPerWeek: 6 } },
      subscription: { create: { planId: "starter", status: "TRIALING" } },
      products: {
        create: [
          { name: "Chicken biryani", price: 220, category: "Biryani" },
          { name: "Mutton biryani", price: 320, category: "Biryani" },
          { name: "Masala dosa", price: 90, category: "Tiffin" },
          { name: "Filter coffee", price: 30, category: "Beverages" },
        ],
      },
      audiences: {
        create: {
          description: "Local families and office workers within 3 km who eat out several times a week.",
          location: "T Nagar",
          ageRange: "20-55",
        },
      },
      goals: {
        create: [
          {
            label: "Increase sales",
            metric: "sales",
            targetNumber: 200,
            currentNumber: 64,
            month: new Date().toISOString().slice(0, 7),
          },
        ],
      },
    },
  });

  console.log(`Seeded:
  ${salon.name} — priya@example.com / password123
  ${restaurant.name} — raj@example.com / password123
  Platform admin — admin@example.com / password123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
