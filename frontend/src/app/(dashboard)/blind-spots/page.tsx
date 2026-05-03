import { redirect } from "next/navigation";
export default function BlindSpotsPage() {
  redirect("/traces?type=blind_spot");
}
