"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui/kit";
import styles from "./PrototypeFeeStory.module.css";

export type FeeStorySlide = { title: string; body: string; art: string };
const art = (name: string) => `/prototype-fee-story/story-${name}.png`;

const ORGANIZER_STORY: FeeStorySlide[] = [
  { title: "Helping is real work", body: "Shopping, packing, riding, delivering, posting proof. Running a cause takes your time, your energy and your money.", art: art("work") },
  { title: "Where every donation goes", body: "At least 93% goes to the people you help. Up to 5% is your share, 1% keeps Salapi going and 1% goes to the Disaster Vault.", art: art("split") },
  { title: "Your share covers your work", body: "Set up to 5% for fuel, phone data and your days of work. Donors see it before they give, and you receive it after your proof is confirmed.", art: art("share") },
  { title: "Or make it 0%", body: "If your costs are covered, or you'd like to give your time as a gift, set it to 0%. Both choices are welcome.", art: art("gift") },
  { title: "1% keeps Salapi going", body: "It pays for the servers that keep your cause online and the salaries of the Salapi team, so they can look after their own families too.", art: art("salapi") },
  { title: "1% for the Disaster Vault", body: "Every donation adds 1% to a shared emergency fund. When a disaster strikes, 20% of the fund goes to two NGOs working on that disaster.", art: art("vault") },
  { title: "One helper inspires the next", body: "When helping pays fairly, more people can make it their work, and more families get help.", art: art("helpers") },
];

const DONOR_START = { organizer: 0, platform: 2, cause: 4 } as const;
export type DonorStoryKey = keyof typeof DONOR_START;
export const donorFeeStory = (inStages: boolean): FeeStorySlide[] => [
  { art: art("work"), title: "Helping takes real work", body: "The organizer shops, travels, delivers the help and posts proof, often over many days." },
  { art: art("share"), title: "So they set a small share", body: "Up to 5%, set before the cause opens and never raised later. It covers their fuel, phone data and time. Some organizers choose 0%." },
  { art: art("split"), title: "Where your $10 goes", body: "At least $9.30 reaches the people in need. Up to $0.50 goes to the organizer, $0.10 keeps Salapi going and $0.10 goes to the Disaster Vault." },
  { art: art("vault"), title: "What's the Disaster Vault?", body: "A shared emergency fund. Every donation adds 1%, and when a flood, typhoon or earthquake strikes, 20% of the fund goes to two NGOs working on that disaster." },
  inStages
    ? { art: art("stages"), title: "Paid in stages", body: "The need is checked before the cause opens. The organizer gets the family's part in stages, each unlocked by receipts for the last. Their own share waits for proof of delivery and your rating." }
    : { art: art("two-steps"), title: "Paid in two steps", body: "The need is checked before the cause opens, and the family's part goes straight to them. The organizer's share waits until they prove delivery and donors like you rate it." },
  { art: art("refund"), title: "Or your money comes back", body: "If the organizer can't prove delivery in time, whatever is still held, including their share, comes back to you." },
  { art: art("helpers"), title: "Fair pay keeps helpers going", body: "For many organizers, helping is their daily work. A small, visible share lets them support their own families while they help others, and inspires more people to start." },
];

export default function PrototypeFeeStory({ onDone, slides = ORGANIZER_STORY, start = 0, ariaLabel = "Organizer fee story" }: {
  onDone: () => void;
  slides?: FeeStorySlide[];
  start?: number;
  ariaLabel?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(start);
  const last = at === slides.length - 1;
  const left = (index: number) => (track.current?.children[index] as HTMLElement | undefined)?.offsetLeft ?? 0;
  useLayoutEffect(() => { if (track.current) track.current.scrollLeft = left(start); }, [start]);
  const go = (index: number) => {
    const target = Math.max(0, Math.min(slides.length - 1, index));
    track.current?.scrollTo({ left: left(target), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const onScroll = () => {
    const element = track.current;
    if (!element) return;
    let nearest = 0;
    for (let index = 1; index < element.children.length; index++) if (Math.abs(left(index) - element.scrollLeft) < Math.abs(left(nearest) - element.scrollLeft)) nearest = index;
    if (nearest !== at) setAt(nearest);
  };

  return <div className={styles.slider}>
    <div ref={track} className={styles.track} role="group" aria-roledescription="carousel" aria-label={ariaLabel} tabIndex={0} onScroll={onScroll} onKeyDown={event => { if (event.key === "ArrowRight") go(at + 1); if (event.key === "ArrowLeft") go(at - 1); }}>
      {slides.map((slide, index) => <figure key={slide.title} className={styles.slide} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${slides.length}`} aria-hidden={index !== at}>
        <img src={slide.art} alt="" width="400" height="300" draggable={false} />
        <figcaption><span className={styles.count}>{index + 1} / {slides.length}</span><strong>{slide.title}</strong><p>{slide.body}</p></figcaption>
      </figure>)}
    </div>
    <div className={styles.dots} role="group" aria-label={`Slide ${at + 1} of ${slides.length}`}>
      {slides.map((slide, index) => <button key={slide.title} type="button" aria-label={`Slide ${index + 1}`} aria-current={index === at || undefined} onClick={() => go(index)} />)}
    </div>
    <Btn onClick={() => last ? onDone() : go(at + 1)}>{last ? "Got it" : "Next"}</Btn>
  </div>;
}

export const donorStoryStart = DONOR_START;
