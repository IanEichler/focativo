import { redirect } from "next/navigation";
import { ROUTES } from "@/lib/routes";

/** A raiz leva ao painel; o proxy encaminha visitantes para o login. */
export default function Home() {
  redirect(ROUTES.appHome);
}
