import { redirect } from "next/navigation";

/**
 * Keep older scanner bookmarks working. The complete scanner now lives at
 * /black-market, so this route intentionally has no duplicate UI to maintain.
 */
export default function ScannerPage() {
  redirect("/black-market");
}
