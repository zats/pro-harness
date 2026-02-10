import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pro-harness",
  description: "A Pro-style LLM harness runner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
