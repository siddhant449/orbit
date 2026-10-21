import { Upcoming } from "@/components/page";

export const metadata = { title: "Billing" };

export default function Page() {
  return (
    <Upcoming
      title={"Billing"}
      description={"Your plan, payment method and invoices."}
      points={["Change or pause your plan.", "Add profiles to your team.", "Download invoices."]}
    />
  );
}
