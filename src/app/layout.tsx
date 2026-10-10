import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import Script from "next/script";
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
      <body>
        {children}
        <Script
          src="/lib/require-jquery.js"
          data-main="/lib/capital_one"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
