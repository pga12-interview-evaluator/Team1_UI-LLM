import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-ink text-2xl font-semibold">Page not found</h1>
      <p className="text-ink-muted">
        If you followed an interview link, it may have expired. Contact the recruiting team for a
        new one.
      </p>
      <Link href="/" className="text-brand hover:underline">
        Home
      </Link>
    </main>
  );
}
