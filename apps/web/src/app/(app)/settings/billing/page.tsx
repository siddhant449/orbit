import { Upcoming } from "@/components/page";

export const metadata = { title: "Billing and subscription" };

export default function Page() {
  return (
    <Upcoming
      title={"Billing and subscription"}
      description={"Your plan, payment method and invoices."}
      points={["Change or pause your plan.", "Add profiles to your team.", "Download invoices."]}
    />
  );
}
