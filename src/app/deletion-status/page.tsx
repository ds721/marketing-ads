export const metadata = { title: "Data deletion" };

/** Where Meta sends a user who asked for their Instagram data to be removed. */
export default async function DeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-3">Your Instagram data has been removed</h1>
        <p className="text-ink-soft mb-4">
          Markit no longer holds a connection to your Instagram account. Any posts that were
          scheduled to it have been stopped.
        </p>
        {code && (
          <p className="text-sm text-ink-faint">
            Confirmation code: <code className="font-mono">{code}</code>
          </p>
        )}
      </div>
    </main>
  );
}
