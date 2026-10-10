import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { APP_NAME } from "@/config/app";
import "./globals.css";

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description:
    "See what is coming in, what is going out, and what is yours to spend, day by day.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={body.variable}>
      {/* Browser extensions add attributes to <body> before React loads;
          this keeps that from being reported as a hydration mismatch. It
          covers this one element only, not what is inside it. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
