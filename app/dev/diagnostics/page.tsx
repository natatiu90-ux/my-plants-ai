import { notFound } from "next/navigation";
import { DevDiagnostics } from "@/components/DevDiagnostics";

export default function DevDiagnosticsPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DevDiagnostics />;
}
