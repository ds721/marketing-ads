import { permanentRedirect } from "next/navigation";

// Business pages moved from /site/{slug} to /{slug}. Kept as a permanent
// redirect so any link already shared keeps working and search engines
// transfer ranking to the new address.
export default async function LegacySiteRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}
