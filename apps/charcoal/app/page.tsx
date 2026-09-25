import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/sections/Hero";
import { TheLoop } from "@/sections/TheLoop";
import { Participants } from "@/sections/Participants";
import { Rules } from "@/sections/Rules";
import { LiveWork } from "@/sections/LiveWork";
import { Provenance } from "@/sections/Provenance";
import { CtaFooter } from "@/sections/CtaFooter";

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <div style={{ height: 120 }} aria-hidden="true" />
        <TheLoop />
        <Participants />
        <Rules />
        <LiveWork />
        <Provenance />
        <CtaFooter />
      </main>
      <SiteFooter />
    </>
  );
}
