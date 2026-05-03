import { redirect } from "next/navigation";
export default function HallucinationRCAPage() {
  redirect("/traces?type=hallucination");
}
