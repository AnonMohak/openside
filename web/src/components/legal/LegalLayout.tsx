import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { useSeoMeta } from "@/hooks/useSeoMeta";

export const LEGAL_CONTACT_EMAIL = "therinkit@gmail.com";

// Shared shell for the public legal pages. Uses the landing palette so it
// matches the marketing site and follows the app theme.
const LegalLayout = ({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) => {
  useSeoMeta();

  return (
    <div className="landing min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/logo/logo-light.png"
              className="w-6 select-none dark:hidden"
              alt="Openside"
            />
            <img
              src="/logo/logo-dark.png"
              className="hidden w-6 select-none dark:block"
              alt="Openside"
            />
            <span className="text-lg font-bold uppercase">Openside</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-primary hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-20">
        <h1 className="font-bricolage text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-foreground/55">
          Last updated {updated}
        </p>
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-8 text-sm text-foreground/60 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Openside</p>
          <div className="flex items-center gap-5">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const LegalSection = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-bricolage text-xl font-semibold tracking-tight">
      {title}
    </h2>
    <div className="flex flex-col gap-3 text-[0.9375rem] leading-7 text-foreground/75">
      {children}
    </div>
  </section>
);

export const LegalList = ({ items }: { items: ReactNode[] }) => (
  <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-foreground/35">
    {items.map((item, index) => (
      <li key={index}>{item}</li>
    ))}
  </ul>
);

export const LegalEmail = () => (
  <a
    href={`mailto:${LEGAL_CONTACT_EMAIL}`}
    className="font-medium text-(--landing-brand-text) underline-offset-4 hover:underline"
  >
    {LEGAL_CONTACT_EMAIL}
  </a>
);

export default LegalLayout;
