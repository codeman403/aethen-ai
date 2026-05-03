import { redirect } from "next/navigation";
export default function ToolMisfirePage() {
  redirect("/traces?type=tool_misfire");
}
