import { DisplayHeading } from "@/components/DisplayHeading";
import { BodyReveal } from "@/components/motion";

export function SectionIntro({ eyebrow, segments, copy }: { eyebrow: string; segments: Array<{ text: string; accent?: boolean }>; copy: string }) {
  return <div className="app-section__intro"><DisplayHeading eyebrow={eyebrow} as="h2" size={54} segments={segments} /><BodyReveal className="muted" lines={[copy]} /></div>;
}
