import { redirect } from "next/navigation";
export default function MemoryDebugPage() {
  redirect("/traces?type=memory");
}
